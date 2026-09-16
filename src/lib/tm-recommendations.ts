import { estimated1RM, TM_PCT_OF_1RM, roundToNearest5 } from './calc'
import { bestEstimatedPerformance, isWorkingPerformance } from './performance'
import { getCurrentTm } from './training-max'
import type { TrainingDB } from '../db/index'
import type { Cycle, HighRepDiscount } from '../types/domain'

export const SESSION_TM_BUMP_THRESHOLD = 0.15
export const CYCLE_DOUBLE_THRESHOLD = 0.10
const CYCLE_START_TOLERANCE_MS = 60_000

export interface SessionTmRecommendation {
  liftId: number
  liftName: string
  currentTm: number
  suggestedTm: number
}

export interface DoublingCandidate {
  liftId: number
  liftName: string
  progressionIncrement: number
}

// A session's best real work, attributed to one lift. Not just its AMRAP:
// jokers chain *above* the top set, so on a week they're run they're often the
// truer read on current strength, and judging a week by its best set is already
// how the AMRAP target seeds itself (see getRecentWorkingSets). This cuts both
// ways — estimated1RM short-circuits reps === 1 to the bare weight, so a joker
// single scores below a multi-rep AMRAP at the same load and simply doesn't
// win. Supplemental work is eligible too but sits far below either threshold at
// its prescribed percentages. Cross sets belong to the movement they train, so
// only the ones tagged with this lift count toward this lift's TM.
async function bestSessionPerformance(
  db: TrainingDB,
  sessionId: number,
  liftId: number,
  discount: HighRepDiscount,
) {
  const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
  return bestEstimatedPerformance(
    sets.filter(s => (s.type !== 'cross' || s.liftId === liftId) && isWorkingPerformance(s)),
    discount,
  )
}

export async function getSessionTmRecommendation(
  db: TrainingDB,
  sessionId: number,
  liftId: number,
  liftName: string,
  discount: HighRepDiscount = 'off',
): Promise<SessionTmRecommendation | null> {
  const best = await bestSessionPerformance(db, sessionId, liftId, discount)
  if (!best) return null

  const currentTm = await getCurrentTm(db, liftId)
  if (!currentTm) return null

  const e1rm = estimated1RM(best.weight, best.reps, discount)
  const suggestedTm = roundToNearest5(e1rm * TM_PCT_OF_1RM)
  const delta = (suggestedTm - currentTm) / currentTm

  if (delta < SESSION_TM_BUMP_THRESHOLD) return null

  return { liftId, liftName, currentTm, suggestedTm }
}

export async function getCycleDoublingCandidates(
  db: TrainingDB,
  cycle: Cycle,
  discount: HighRepDiscount = 'off',
): Promise<DoublingCandidate[]> {
  const sessions = await db.sessions.where('cycleId').equals(cycle.id!).toArray()
  const workingSessions = sessions.filter(s => s.week !== 4 && s.status === 'completed')

  const byLift = new Map<number, typeof workingSessions>()
  for (const s of workingSessions) {
    if (!byLift.has(s.liftId)) byLift.set(s.liftId, [])
    byLift.get(s.liftId)!.push(s)
  }

  // Active lifts only, the same population the progression itself walks. This
  // read every lift and never filtered `archived`, so an archived lift with
  // three qualifying weeks was offered a doubled increment it can never take —
  // `progressTms` goes through activeLiftsOrdered and skips it (F40).
  const lifts = (await db.lifts.orderBy('order').toArray()).filter(l => !l.archived)
  const candidates: DoublingCandidate[] = []
  const cycleStartTs = new Date(cycle.startDate).getTime()

  for (const [liftId, allLiftSessions] of byLift) {
    // Dedup to the latest completed session per week — a redo adds a second
    // completed row for the same week, and only the most recent attempt counts.
    // Without this, a redo inflates the count (3 rows across 2 weeks passes the
    // "all 3 weeks done" gate) and drags a superseded attempt into the check.
    const latestPerWeek = new Map<number, (typeof allLiftSessions)[number]>()
    for (const s of allLiftSessions) {
      const cur = latestPerWeek.get(s.week)
      if (!cur || new Date(s.date).getTime() > new Date(cur.date).getTime()) latestPerWeek.set(s.week, s)
    }
    const liftSessions = [...latestPerWeek.values()]
    if (liftSessions.length < 3) continue

    const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')

    // A mid-cycle bump disqualifies the lift: the user has already moved this
    // training max by hand, so the program should not also move it.
    //
    // This used to be inferred from a 60-second window around cycle creation,
    // which made the answer depend on how long the user took to tap. The CYCLE
    // COMPLETE modal opens immediately after the roll-over and writes training
    // maxes of its own, so the same data and the same user action landed on
    // either side of the window according to dwell time: tapped at 10s the lift
    // stayed a candidate, tapped at 61s it was silently disqualified (F39).
    //
    // `source` records it instead. Only `'manual'` counts — a progression row
    // opened this cycle and a deload lowered the max, neither of which is
    // evidence that the lifter raised it. Rows written before the column
    // existed carry null and keep the old inference, because for those the
    // provenance genuinely is unknown and guessing would be worse.
    const hasBump = tms.some(tm => {
      const ts = new Date(tm.setAt).getTime()
      // Legacy row, provenance genuinely unknown: keep the old inference rather
      // than guess in either direction.
      if (tm.source == null) return ts > cycleStartTs + CYCLE_START_TOLERANCE_MS
      // Recorded: the timestamp only places the row relative to the cycle's own
      // start, never inside a dwell window. A manual bump written after this
      // cycle opened disqualifies it whether the tap came at 10 seconds or ten
      // minutes; one written before belongs to the previous cycle.
      return tm.source === 'manual' && ts >= cycleStartTs
    })
    if (hasBump) continue

    // The TM in effect at cycle start (auto-progression entry)
    const cycleTm = [...tms].reverse().find(
      tm => new Date(tm.setAt).getTime() <= cycleStartTs + CYCLE_START_TOLERANCE_MS
    )
    if (!cycleTm) continue

    let allOver = true
    for (const session of liftSessions) {
      // Same best-working-set read as the session prompt — a week carried by a
      // joker still counts toward the gate, and every week must clear it.
      const best = await bestSessionPerformance(db, session.id!, liftId, discount)
      if (!best) { allOver = false; break }

      const e1rm = estimated1RM(best.weight, best.reps, discount)
      const suggestedTm = roundToNearest5(e1rm * TM_PCT_OF_1RM)
      const delta = (suggestedTm - cycleTm.weight) / cycleTm.weight
      if (delta < CYCLE_DOUBLE_THRESHOLD) { allOver = false; break }
    }

    if (!allOver) continue

    const lift = lifts.find(l => l.id === liftId)
    if (!lift) continue

    candidates.push({ liftId, liftName: lift.name, progressionIncrement: lift.progressionIncrement })
  }

  return candidates
}
