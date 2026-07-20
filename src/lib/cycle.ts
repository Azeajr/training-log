import type { TrainingDB } from '../db/index'
import type { Lift, TrainingMax } from '../types/domain'
import { roundToNearest5, SEED_WINDOW, cycleFinalWeek } from './calc'
import { getCycleDoublingCandidates } from './tm-recommendations'
import type { DoublingCandidate } from './tm-recommendations'

// Active = non-archived lifts, ordered. The number of active lifts is the
// per-week session target (one training day per lift). Archived lifts keep
// their history but no longer count toward completion.
async function activeLiftsOrdered(db: TrainingDB): Promise<Lift[]> {
  const lifts = await db.lifts.orderBy('order').toArray()
  return lifts.filter(l => !l.archived)
}

// The cycle's terminal week, from the global deload setting. Undefined/missing
// settings default to a 4-week cycle (deload on), preserving prior behavior.
async function getFinalWeek(db: TrainingDB): Promise<3 | 4> {
  const row = await db.settings.toCollection().first()
  return cycleFinalWeek(row?.hasDeloadWeek ?? true)
}

// A lift's week is complete only when it has at least one session and none are
// still pending. Reopening a week (backward nav) adds a fresh pending row next
// to the old completed history; requiring *no* pending row keeps that week open
// until the redo is finished, instead of the stale completed row re-closing it.
const weekComplete = (
  sessions: Array<{ week: number; liftId: number; status: string }>,
  week: number,
  activeLiftIds: number[],
): boolean =>
  activeLiftIds.length > 0 &&
  activeLiftIds.every(id => {
    const forLift = sessions.filter(s => s.week === week && s.liftId === id)
    return forLift.length > 0 && forLift.every(s => s.status !== 'pending')
  })

// Highest contiguous fully-completed week, never dropping below the stored
// high-water mark. Freezing closed weeks is what lets the lift roster change
// mid-cycle without reopening finished weeks (added lifts only owe later weeks)
// or prematurely completing them (archived lifts drop out of the active set).
export const computeClosedThroughWeek = (
  sessions: Array<{ week: number; liftId: number; status: string }>,
  activeLiftIds: number[],
  prevClosed: number,
  finalWeek = 4,
): number => {
  let closed = prevClosed
  for (let w = closed + 1; w <= finalWeek; w++) {
    if (weekComplete(sessions, w, activeLiftIds)) closed = w
    else break
  }
  return closed
}

// Recompute the high-water mark from sessions and persist it back when it has
// moved. Sessions are the source of truth; the stored closedThroughWeek is a
// cache. Routing every read (workout + Settings) through this keeps the cache
// self-healing, so a handler that mutates sessions without updating the mark
// (or a roster change that re-opens completion math) can't leave the two out
// of sync. Returns the resolved mark.
export const syncClosedThroughWeek = async (
  db: TrainingDB,
  cycleId: number,
  sessions: Array<{ week: number; liftId: number; status: string }>,
  activeLiftIds: number[],
  prevClosed: number,
  finalWeek = 4,
): Promise<number> => {
  const closed = computeClosedThroughWeek(sessions, activeLiftIds, prevClosed, finalWeek)
  if (closed !== prevClosed) await db.cycles.update(cycleId, { closedThroughWeek: closed })
  return closed
}

export interface TmChange {
  liftName: string
  oldWeight: number
  weight: number
}

async function progressTms(
  db: TrainingDB,
  nextWeight: (current: TrainingMax, lift: Lift) => number,
): Promise<TmChange[]> {
  const lifts = await activeLiftsOrdered(db)
  const changes: TmChange[] = []
  for (const lift of lifts) {
    const tms = await db.trainingMaxes.where('liftId').equals(lift.id!).sortBy('setAt')
    const current = tms[tms.length - 1]
    if (!current) continue
    const weight = nextWeight(current, lift)
    await db.trainingMaxes.add({ liftId: lift.id!, weight, setAt: new Date() })
    changes.push({ liftName: lift.name, oldWeight: current.weight, weight })
  }
  return changes
}

export async function advanceCycleIfComplete(db: TrainingDB): Promise<{
  advanced: boolean
  doublingCandidates: DoublingCandidate[]
  newTms: TmChange[]
}> {
  const cycle = await db.cycles.orderBy('number').last()
  if (!cycle?.id) return { advanced: false, doublingCandidates: [], newTms: [] }

  const finalWeek = await getFinalWeek(db)
  const sessions = await db.sessions.where('cycleId').equals(cycle.id).toArray()
  const activeLiftIds = (await activeLiftsOrdered(db)).map(l => l.id!)
  const closed = computeClosedThroughWeek(sessions, activeLiftIds, cycle.closedThroughWeek ?? 0, finalWeek)

  if (closed !== (cycle.closedThroughWeek ?? 0)) {
    await db.cycles.update(cycle.id, { closedThroughWeek: closed })
  }
  // A cycle ends when its final week (3 without a deload, 4 with) is complete
  // for every active lift.
  if (!weekComplete(sessions, finalWeek, activeLiftIds)) return { advanced: false, doublingCandidates: [], newTms: [] }

  // Compute before progression fires so TM bump detection sees pre-progression state
  const doublingCandidates = await getCycleDoublingCandidates(db, cycle)

  const cycleId = cycle.id!
  let newTms: TmChange[] = []
  await db.transaction(async () => {
    await db.cycles.update(cycleId, { endDate: new Date() })
    await db.cycles.add({ number: cycle.number + 1, startDate: new Date(), endDate: null, closedThroughWeek: 0 })
    newTms = await applyTmProgression(db)
    await applyAccessoryTmProgression(db, cycleId)
  })

  return { advanced: true, doublingCandidates, newTms }
}

export async function applyTmProgression(db: TrainingDB): Promise<TmChange[]> {
  return progressTms(db, (current, lift) => current.weight + lift.progressionIncrement)
}

export async function applyAccessoryTmProgression(db: TrainingDB, cycleId: number) {
  const sessions = await db.sessions.where('cycleId').equals(cycleId).toArray()
  const sessionIds = sessions.map(s => s.id!)
  const accessorySets = await db.accessorySets
    .where('sessionId').anyOf(sessionIds)
    .toArray()

  const usedExerciseIds = [...new Set(accessorySets.map(a => a.exerciseId))]

  for (const exerciseId of usedExerciseIds) {
    const tms = await db.accessoryTrainingMaxes
      .where('exerciseId').equals(exerciseId)
      .sortBy('setAt')
    const currentTm = tms[tms.length - 1]
    if (currentTm) {
      await db.accessoryTrainingMaxes.add({
        exerciseId,
        weight: currentTm.weight + currentTm.incrementLb,
        incrementLb: currentTm.incrementLb,
        setAt: new Date(),
      })
    }
  }
}

export async function deloadTms(db: TrainingDB, pct = 0.10): Promise<TmChange[]> {
  return progressTms(db, current => roundToNearest5(current.weight * (1 - pct)))
}

export async function getNextSessionAdvancingIfDone(db: TrainingDB): Promise<{
  liftId: number
  week: 1 | 2 | 3 | 4
  cycleId: number
}> {
  let cycle = await db.cycles.orderBy('number').last()
  if (!cycle?.id) {
    const cycleId = await db.cycles.add({
      number: 1,
      startDate: new Date(),
      endDate: null,
      closedThroughWeek: 0,
    })
    const lifts = await activeLiftsOrdered(db)
    if (lifts.length === 0) throw new Error('No active lifts')
    return { liftId: lifts[0].id!, week: 1, cycleId }
  }

  let sessions = await db.sessions
    .where('cycleId').equals(cycle.id)
    .toArray()

  const finalWeek = await getFinalWeek(db)
  let lifts = await activeLiftsOrdered(db)
  if (lifts.length === 0) throw new Error('No active lifts')
  const activeLiftIds = lifts.map(l => l.id!)
  let closed = await syncClosedThroughWeek(db, cycle.id, sessions, activeLiftIds, cycle.closedThroughWeek ?? 0, finalWeek)

  if (closed >= finalWeek) {
    await advanceCycleIfComplete(db)
    cycle = await db.cycles.orderBy('number').last()
    if (!cycle?.id) throw new Error('Cycle advance failed')
    sessions = []
    lifts = await activeLiftsOrdered(db)
    if (lifts.length === 0) throw new Error('No active lifts')
    closed = 0
  }

  const currentWeek = Math.min(finalWeek, closed + 1) as 1 | 2 | 3 | 4

  // A lift still owes this week if it has a pending session or no session yet.
  // Mirrors weekComplete: after a reopen the old completed row coexists with a
  // fresh pending one, so checking "has any non-pending row" would wrongly skip
  // it and land the highlight on whichever lift lacks old history (issue: new
  // mid-cycle lifts). Selecting by lift order keeps the first owed lift first.
  const owesWork = (liftId: number) => {
    const forLift = sessions.filter(s => s.week === currentWeek && s.liftId === liftId)
    return forLift.length === 0 || forLift.some(s => s.status === 'pending')
  }

  const nextLift = lifts.find(l => owesWork(l.id!))

  return {
    liftId: nextLift?.id ?? lifts[0].id!,
    week: currentWeek,
    cycleId: cycle.id,
  }
}

// Most-recent-first AMRAP performances for a lift, used to seed a robust e1RM
// (median over the window — see calc.seedE1Rm). Only completed, non-deload
// sessions count: a deload or in-progress session is not a real top-set effort
// and would drag the estimate. Returns at most `window` entries.
export async function getRecentAmraps(
  db: TrainingDB,
  liftId: number,
  window = SEED_WINDOW,
): Promise<Array<{ weight: number; reps: number }>> {
  const sessions = await db.sessions
    .where('liftId').equals(liftId)
    .filter(s => s.status === 'completed' && s.week !== 4)
    .toArray()

  sessions.sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  // Dedup to the newest completed session per (cycle, week) before windowing —
  // a redo adds a second completed row for the same cycle+week, and two such
  // AMRAPs in a 3-slot window would skew the median e1RM seed. Keyed by cycle+
  // week, not week alone: week numbers repeat across cycles and those are
  // distinct real sessions. Sessions are date-desc, so first-seen wins (newest).
  const byCycleWeek = new Map<string, (typeof sessions)[number]>()
  for (const s of sessions) {
    const key = `${s.cycleId}-${s.week}`
    if (!byCycleWeek.has(key)) byCycleWeek.set(key, s)
  }
  const deduped = [...byCycleWeek.values()]

  const recent: Array<{ weight: number; reps: number }> = []
  for (const session of deduped) {
    if (recent.length >= window) break
    if (!session.id) continue
    const amrap = await db.sets
      .where('sessionId').equals(session.id)
      .filter(s => s.isAmrap)
      .first()
    if (amrap) recent.push({ weight: amrap.weight, reps: amrap.reps })
  }
  return recent
}
