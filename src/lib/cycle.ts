import type { TrainingDB } from '../db/index'
import type { Lift, TrainingMax } from '../types/domain'
import { roundToNearest5 } from './calc'
import { getCycleDoublingCandidates } from './tm-recommendations'
import type { DoublingCandidate } from './tm-recommendations'

// Active = non-archived lifts, ordered. The number of active lifts is the
// per-week session target (one training day per lift). Archived lifts keep
// their history but no longer count toward completion.
async function activeLiftsOrdered(db: TrainingDB): Promise<Lift[]> {
  const lifts = await db.lifts.orderBy('order').toArray()
  return lifts.filter(l => !l.archived)
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
): number => {
  let closed = prevClosed
  for (let w = closed + 1; w <= 4; w++) {
    if (weekComplete(sessions, w, activeLiftIds)) closed = w
    else break
  }
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

  const sessions = await db.sessions.where('cycleId').equals(cycle.id).toArray()
  const activeLiftIds = (await activeLiftsOrdered(db)).map(l => l.id!)
  const closed = computeClosedThroughWeek(sessions, activeLiftIds, cycle.closedThroughWeek ?? 0)

  if (closed !== (cycle.closedThroughWeek ?? 0)) {
    await db.cycles.update(cycle.id, { closedThroughWeek: closed })
  }
  // A cycle ends when its final week is complete for every active lift.
  if (!weekComplete(sessions, 4, activeLiftIds)) return { advanced: false, doublingCandidates: [], newTms: [] }

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

  let lifts = await activeLiftsOrdered(db)
  if (lifts.length === 0) throw new Error('No active lifts')
  const activeLiftIds = lifts.map(l => l.id!)
  let closed = computeClosedThroughWeek(sessions, activeLiftIds, cycle.closedThroughWeek ?? 0)
  if (closed !== (cycle.closedThroughWeek ?? 0)) {
    await db.cycles.update(cycle.id, { closedThroughWeek: closed })
  }

  if (closed >= 4) {
    await advanceCycleIfComplete(db)
    cycle = await db.cycles.orderBy('number').last()
    if (!cycle?.id) throw new Error('Cycle advance failed')
    sessions = []
    lifts = await activeLiftsOrdered(db)
    if (lifts.length === 0) throw new Error('No active lifts')
    closed = 0
  }

  const currentWeek = Math.min(4, closed + 1) as 1 | 2 | 3 | 4

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

export async function getAmrapTargets(
  db: TrainingDB,
  liftId: number,
  currentWeek: number,
  currentCycleId: number,
): Promise<Array<{ weight: number; reps: number; label: string }>> {
  const allSessions = await db.sessions
    .where('liftId').equals(liftId)
    .filter(s => s.status === 'completed' && s.week !== 4)
    .toArray()

  allSessions.sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const getAmrapSet = (sessionId: number) =>
    db.sets
      .where('sessionId').equals(sessionId)
      .filter(s => s.isAmrap)
      .first()

  const targets: Array<{ weight: number; reps: number; label: string }> = []

  const lastSession = allSessions[0]
  if (lastSession?.id) {
    const amrap = await getAmrapSet(lastSession.id)
    if (amrap) targets.push({ weight: amrap.weight, reps: amrap.reps, label: 'Last session' })
  }

  const prevCycleSession = allSessions.find(s =>
    s.cycleId !== currentCycleId && s.week === currentWeek
  )
  // Skip when it's the same session already shown as "Last session" — otherwise
  // the targets list shows the identical set twice under two labels.
  if (prevCycleSession?.id && prevCycleSession.id !== lastSession?.id) {
    const amrap = await getAmrapSet(prevCycleSession.id)
    if (amrap) targets.push({ weight: amrap.weight, reps: amrap.reps, label: 'Last cycle' })
  }

  return targets
}
