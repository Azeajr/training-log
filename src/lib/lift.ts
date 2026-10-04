import type { TrainingDB } from '../db/index'
import { discardPendingSessionRows } from './session'
import { getCurrentTm } from './training-max'
import { calcCrossSets, effectiveSupplementalWeek } from './calc'
import { liftWeightFloor } from './plate-loading'
import type { CrossBlockPlan } from './workout-compose'
import type { DeloadSupplemental, Lift, LiftSupplemental } from '../types/domain'

export async function createLift(
  db: TrainingDB,
  fields: { name: string; progressionIncrement: number; baseWeight: number; liftType: 'upper' | 'lower' },
): Promise<number> {
  const lifts = await db.lifts.toArray()
  const nextOrder = lifts.reduce((m, l) => Math.max(m, l.order), 0) + 1
  return db.lifts.add({ ...fields, order: nextOrder, archived: false })
}

export async function updateLift(db: TrainingDB, id: number, patch: Partial<Lift>): Promise<void> {
  await db.lifts.update(id, patch)
}

// Archiving keeps all history (TMs, completed/skipped sessions) but removes the
// lift from the active roster: it no longer counts toward cycle completion.
// Pending sessions in any cycle are deleted so they don't linger on Today.
export async function archiveLift(
  db: TrainingDB,
  id: number,
  opts?: { removeCrossRefs?: boolean },
): Promise<void> {
  await db.transaction(async () => {
    await db.lifts.update(id, { archived: true })
    // Through the shared cascade, not a re-implementation: this deleted the
    // session ROW only and left its sets, accessorySets and accessoryNotes
    // behind, pointing at a sessionId nothing resolves (F99). The *Rows variant
    // because we are already inside a transaction and they do not nest.
    const pending = await db.sessions.where('liftId').equals(id).filter(s => s.status === 'pending').toArray()
    for (const s of pending) await discardPendingSessionRows(db, s.id!)
    // Optionally drop cross-lift blocks on other days that use this lift as
    // their movement. Off by default: archiving is reversible, so the blocks
    // keep running off this lift's last (frozen) TM until the user opts to remove.
    if (opts?.removeCrossRefs) {
      const refs = await db.liftSupplementals.where('movementLiftId').equals(id).toArray()
      for (const b of refs) await db.liftSupplementals.delete(b.id!)
    }
  })
}

export async function unarchiveLift(db: TrainingDB, id: number): Promise<void> {
  await db.lifts.update(id, { archived: false })
}

// Names of active training days whose cross-lift supplemental uses this lift as
// its movement. Drives the archive warning: archiving leaves these blocks
// pointing at a now-inactive lift (they keep its frozen TM unless removed).
export async function liftsCrossReferencing(db: TrainingDB, movementLiftId: number): Promise<string[]> {
  const refs = await db.liftSupplementals.where('movementLiftId').equals(movementLiftId).toArray()
  if (refs.length === 0) return []
  const lifts = await db.lifts.toArray()
  const names: string[] = []
  for (const b of refs) {
    const owner = lifts.find(l => l.id === b.liftId)
    if (owner && !owner.archived && !names.includes(owner.name)) names.push(owner.name)
  }
  return names
}

// Hard-delete a lift and everything attached to it. Destructive — intended for
// pre-history use (onboarding roster edits). For lifts with training history use
// archiveLift instead. Also clears cross blocks on other days that reference
// this lift as their movement.
export async function deleteLift(db: TrainingDB, id: number): Promise<void> {
  await db.transaction(async () => {
    await db.liftSupplementals.where('liftId').equals(id).delete()
    const referencing = await db.liftSupplementals.where('movementLiftId').equals(id).toArray()
    for (const b of referencing) await db.liftSupplementals.delete(b.id!)
    await db.trainingMaxes.where('liftId').equals(id).delete()

    // The cascade used to stop here, leaving this lift's sessions and all their
    // child rows behind with a liftId nothing resolves (F44). The doc comment
    // scopes this function to pre-history use, but nothing enforces that — and
    // "hard-delete a lift and everything attached to it" has to mean it.
    const sessions = await db.sessions.where('liftId').equals(id).toArray()
    for (const session of sessions) {
      const sessionId = session.id!
      await db.sets.where('sessionId').equals(sessionId).delete()
      await db.accessorySets.where('sessionId').equals(sessionId).delete()
      await db.accessoryNotes.where('sessionId').equals(sessionId).delete()
      await db.sessions.delete(sessionId)
    }
    await db.assistanceDefaults.where('liftId').equals(id).delete()

    await db.lifts.delete(id)
  })
}

// Swap order with the adjacent active lift in the given direction.
export async function moveLift(db: TrainingDB, id: number, direction: 'up' | 'down'): Promise<void> {
  const active = (await db.lifts.orderBy('order').toArray()).filter(l => !l.archived)
  const idx = active.findIndex(l => l.id === id)
  if (idx === -1) return
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= active.length) return
  const a = active[idx]
  const b = active[swapIdx]
  await db.transaction(async () => {
    await db.lifts.update(a.id!, { order: b.order })
    await db.lifts.update(b.id!, { order: a.order })
  })
}

export async function addLiftSupplemental(
  db: TrainingDB,
  block: Omit<LiftSupplemental, 'id' | 'order'>,
): Promise<number> {
  const existing = await db.liftSupplementals.where('liftId').equals(block.liftId).toArray()
  const nextOrder = existing.reduce((m, b) => Math.max(m, b.order), -1) + 1
  return db.liftSupplementals.add({ ...block, order: nextOrder })
}

export async function updateLiftSupplemental(
  db: TrainingDB,
  id: number,
  patch: Partial<LiftSupplemental>,
): Promise<void> {
  await db.liftSupplementals.update(id, patch)
}

export async function removeLiftSupplemental(db: TrainingDB, id: number): Promise<void> {
  await db.liftSupplementals.delete(id)
}

/**
 * A cross-lift block as its training day runs it in a given week: what
 * composition needs (`CrossBlockPlan`), plus the block and movement lift the
 * screens label it with.
 */
export interface CrossBlockForDay extends CrossBlockPlan {
  block: LiftSupplemental
  movement: Lift
}

// The cross-lift blocks a training day runs in a given week, in block order —
// the one derivation behind both Today's preview and the Workout screen. Each
// kept its own copy of this loop, and the copies had drifted: a block with no
// sets was dropped from the preview but rendered on Workout as an empty section.
// Cross work follows the same effective week as self-supplemental (deload may
// remap or skip it), and each block is computed from its movement lift's
// current TM. A block whose movement lift is gone, or that prescribes no sets,
// is left out — and with the Settings switch off, every block is.
export async function loadCrossPlan(
  db: TrainingDB,
  liftId: number,
  week: 1 | 2 | 3 | 4,
  opts: { deloadSupplemental: DeloadSupplemental; barWeight: number; crossLiftSupplemental: boolean },
): Promise<CrossBlockForDay[]> {
  if (!opts.crossLiftSupplemental) return []
  const eff = effectiveSupplementalWeek(week, opts.deloadSupplemental)
  if (eff === null) return []
  const blocks = (await db.liftSupplementals.where('liftId').equals(liftId).toArray())
    .sort((a, b) => a.order - b.order)
  if (blocks.length === 0) return []
  const lifts = await db.lifts.toArray()
  const plan: CrossBlockForDay[] = []
  for (const block of blocks) {
    const movement = lifts.find(l => l.id === block.movementLiftId)
    if (!movement) continue
    const tm = await getCurrentTm(db, block.movementLiftId)
    const computed = calcCrossSets(block, tm, eff, liftWeightFloor(movement, opts.barWeight))
    if (computed.length === 0) continue
    plan.push({ block, movement, movementLiftId: block.movementLiftId, computed })
  }
  return plan
}
