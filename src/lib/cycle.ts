import type { TrainingDB } from '../db/index'
import type { Lift, TrainingMax, HighRepDiscount, Set } from '../types/domain'
import { roundToNearest5, SEED_WINDOW, cycleFinalWeek } from './calc'
import { bestEstimatedPerformance, isWorkingPerformance } from './performance'
import { getCycleDoublingCandidates } from './tm-recommendations'
import type { DoublingCandidate } from './tm-recommendations'
import { getCurrentTm, setTm, noteTrainingMaxAdded } from './training-max'

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
  // Required, not defaulted: a `= 4` default silently gave 3-week cycles a
  // week 4 whenever a caller forgot to pass it. Keeping it required makes the
  // compiler enumerate every call site instead.
  finalWeek: 3 | 4,
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
  finalWeek: 3 | 4,
): Promise<number> => {
  const closed = computeClosedThroughWeek(sessions, activeLiftIds, prevClosed, finalWeek)
  if (closed !== prevClosed) await db.cycles.update(cycleId, { closedThroughWeek: closed })
  return closed
}

/**
 * Retire any session sitting past the cycle's final week.
 *
 * Cycle length is a setting, so the final week moves under sessions that already
 * exist: turning the deload off leaves week-4 rows describing a week the cycle
 * no longer has. A *pending* one is the damaging case — it is unreachable
 * (Today only ever offers the current cycle's next owed week) and invisible
 * (History renders completed rows only), yet it still holds a slot and its sets
 * still count toward records. Retiring it as `skipped` keeps the work the user
 * actually did while closing the week out.
 *
 * Completed rows are left exactly as they are: a deload day that was genuinely
 * lifted is history, and history does not stop being true when the setting
 * changes.
 *
 * This lived only in `Settings.handleCycleShapeChange`, which is one of the ways
 * the setting changes — a backup import is another. Calling it from
 * `advanceCycleIfComplete` makes the invariant hold however the shape moves.
 */
export async function retireWeeksPastFinalWeek(
  db: TrainingDB,
  cycleId: number,
  finalWeek: 3 | 4,
): Promise<number> {
  const stranded = (await db.sessions.where('cycleId').equals(cycleId).toArray())
    .filter(s => s.id != null && s.week > finalWeek && s.status === 'pending')
  if (stranded.length === 0) return 0
  await db.transaction(async () => {
    for (const s of stranded) await db.sessions.update(s.id!, { status: 'skipped' })
  })
  return stranded.length
}

export interface TmChange {
  /**
   * Carried alongside the name because `lifts.name` has no UNIQUE constraint:
   * with two lifts called "Bench", folding a summary row back by name rewrote
   * whichever one matched first (F34).
   */
  liftId: number
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
    noteTrainingMaxAdded()
    changes.push({ liftId: lift.id!, liftName: lift.name, oldWeight: current.weight, weight })
  }
  return changes
}

export async function advanceCycleIfComplete(db: TrainingDB, discount: HighRepDiscount = 'off'): Promise<{
  advanced: boolean
  doublingCandidates: DoublingCandidate[]
  newTms: TmChange[]
}> {
  const cycle = await db.cycles.orderBy('number').last()
  if (!cycle?.id) return { advanced: false, doublingCandidates: [], newTms: [] }

  const finalWeek = await getFinalWeek(db)
  // Before anything reads the cycle's sessions: a week past `finalWeek` no
  // longer exists, so a row still pending there has to be closed out rather
  // than silently stepped over when the cycle rolls.
  await retireWeeksPastFinalWeek(db, cycle.id, finalWeek)
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
  const doublingCandidates = await getCycleDoublingCandidates(db, cycle, discount)

  const cycleId = cycle.id!
  let newTms: TmChange[] = []
  let advanced = false
  await db.transaction(async () => {
    // Everything above — reading the cycle, testing weekComplete — happens
    // before any transaction opens, so two callers can both get this far. The
    // post-session modals are the live path: their ACCEPT and dismiss handlers
    // both reach here, and one tap plus Escape is enough to run both.
    //
    // Re-read inside the transaction and abort if another caller already did the
    // work. Transactions are serialized (db/transaction.ts), so the second
    // caller arrives here only after the first has committed and sees its
    // endDate — this guard would not hold while independent transactions could
    // interleave.
    const fresh = await db.cycles.get(cycleId)
    if (!fresh || fresh.endDate) return
    const next = await db.cycles.where('number').equals(cycle.number + 1).first()
    if (next) return

    await db.cycles.update(cycleId, { endDate: new Date() })
    await db.cycles.add({ number: cycle.number + 1, startDate: new Date(), endDate: null, closedThroughWeek: 0 })
    newTms = await applyTmProgression(db)
    await applyAccessoryTmProgression(db, cycleId)
    advanced = true
  })

  return { advanced, doublingCandidates: advanced ? doublingCandidates : [], newTms }
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

// The end-of-cycle summary: what every TM moved to, plus which lifts earned the
// option of a doubled increment. Lives here rather than next to the modal that
// renders it — Workout and Settings both build and mutate this shape, and the
// helper below operates on it, so it belongs with the cycle logic.
export interface CycleCompleteData {
  newTms: TmChange[]
  doublingCandidates: DoublingCandidate[]
}

// Accept the doubled increment for one lift: write the new TM, then fold the
// result back into the summary so the row shows the doubled weight and the lift
// drops out of the offer list (it can't be taken twice).
//
// Both Workout and Settings used to carry their own copy of this, and they had
// already drifted: one rounded with `roundToNearest5`, the other reimplemented
// the same formula inline. One implementation now, called from both.
export async function applyCycleDoubling(
  db: TrainingDB,
  data: CycleCompleteData | null,
  liftId: number,
  progressionIncrement: number,
): Promise<CycleCompleteData | null> {
  // Derive the target from the SUMMARY row, not from the current TM. Reading
  // the current TM made this a relative operation, so a second tap read its own
  // first write and compounded: 205 -> 210 -> 215 for one "+10 LBS" the user
  // asked for once. Against the summary the target is the same every time.
  const summaryRow = data?.newTms.find(t => t.liftId === liftId)
  const base = summaryRow?.weight ?? await getCurrentTm(db, liftId)
  const newTm = roundToNearest5(base + progressionIncrement)

  // Skip the write when it would be a no-op. Repeating it is harmless for the
  // weight but appends a second row at the same instant, which is exactly the
  // tie the two "current TM" helpers used to resolve differently (F36).
  if (await getCurrentTm(db, liftId) !== newTm) {
    await setTm(db, liftId, newTm)
  }
  if (!data) return null
  return {
    ...data,
    // Folded back by id: `lifts.name` is not unique, so matching on the name
    // rewrote the wrong lift's summary row when two shared one.
    newTms: data.newTms.map(t => t.liftId === liftId ? { ...t, weight: newTm } : t),
    doublingCandidates: data.doublingCandidates.filter(c => c.liftId !== liftId),
  }
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

  const finalWeek = await getFinalWeek(db)
  // Read the sessions only after retiring the stranded ones, so `closed` and
  // `owesWork` below both see the reconciled cycle. The cycle may not be
  // complete — a week that no longer exists is stranded either way.
  await retireWeeksPastFinalWeek(db, cycle.id, finalWeek)

  let sessions = await db.sessions
    .where('cycleId').equals(cycle.id)
    .toArray()

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

// Most-recent-first best working performances for a lift, used to seed a robust
// e1RM (median over the window — see calc.seedE1Rm). Only completed, non-deload
// sessions count. One best set per cycle/week keeps a long supplemental tail or
// a redo from crowding out the recent training signal.
export async function getRecentWorkingSets(
  db: TrainingDB,
  liftId: number,
  discount: HighRepDiscount = 'off',
  window = SEED_WINDOW,
): Promise<Array<{ weight: number; reps: number }>> {
  const sessions = await db.sessions
    .filter(s => s.status === 'completed' && s.week !== 4)
    .toArray()

  sessions.sort((a, b) =>
    new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const sessionById = new Map<number, typeof sessions[number]>()
  for (const session of sessions) if (session.id != null) sessionById.set(session.id, session)
  const ownIds = sessions.filter(s => s.liftId === liftId && s.id != null).map(s => s.id!)
  const ownSets = ownIds.length > 0 ? await db.sets.where('sessionId').anyOf(ownIds).toArray() : []
  const crossSets = await db.sets.where('liftId').equals(liftId).toArray()
  const setsBySession = new Map<number, Set[]>()
  const add = (set: Set) => {
    const sets = setsBySession.get(set.sessionId) ?? []
    sets.push(set)
    setsBySession.set(set.sessionId, sets)
  }
  ownSets.filter(s => s.type !== 'cross' && isWorkingPerformance(s)).forEach(add)
  crossSets.filter(s => s.type === 'cross' && isWorkingPerformance(s) && sessionById.has(s.sessionId)).forEach(add)

  // At most one performance per (cycle, week) in the window. Two things decide
  // which session in a week supplies it:
  //
  //   1. The lift's own session outranks another lift's session that merely
  //      carries cross work for this lift. Cross blocks are prescribed volume,
  //      so without this rank a cross-lift day later in the same week would
  //      claim the week's slot and hide the real top set — seeding the target
  //      from submaximal work.
  //   2. Sessions are date-desc, so among equally ranked sessions the newer one
  //      wins: a redo supersedes the attempt it replaces, and a redo with no
  //      qualifying work falls through to the older attempt.
  //
  // Weeks are ordered by their newest qualifying session, then cut to the
  // window — an own-session upgrade never moves a week's position.
  const byWeek = new Map<string, { own: boolean; perf: { weight: number; reps: number } }>()
  const weekOrder: string[] = []
  for (const session of sessions) {
    if (!session.id) continue
    const best = bestEstimatedPerformance(setsBySession.get(session.id) ?? [], discount)
    if (!best) continue
    const key = `${session.cycleId}-${session.week}`
    const own = session.liftId === liftId
    const held = byWeek.get(key)
    if (!held) weekOrder.push(key)
    else if (held.own || !own) continue
    byWeek.set(key, { own, perf: { weight: best.weight, reps: best.reps } })
  }
  return weekOrder.slice(0, window).map(key => byWeek.get(key)!.perf)
}
