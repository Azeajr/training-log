import type { TrainingDB } from '../db/index'
import type { HighRepDiscount } from '../types/domain'
import { estimated1RM } from './calc'
import { isWorkingPerformance } from './performance'

export interface PrResult {
  repPr: boolean
  e1RmPr: boolean
  newE1Rm: number
  prevBestReps?: number
  prevBestE1Rm?: number
}

// One logged working set, already attributed to the lift it trains (a cross
// block belongs to its movement, not to the session it was logged in).
export interface PerformanceRecord {
  sessionId: number
  liftId: number
  date: Date
  weight: number
  reps: number
}

// Which sessions set a PR *at the time they were logged*. A PR used to exist
// only as a five-second toast mid-set; History can now badge the session that
// earned it. Evaluated against prior work only — a bigger session six weeks
// later must not retroactively un-PR the one that stood on the day.
//
// The record is estimated 1RM, which is the strength measure. Heaviest weight
// moved is tracked for the log (see RecordsPanel.maxWeight) but is not a claim
// about strength — a heavy single at a load that estimates below the standing
// record does not earn a badge.
//
// e1RM is not an AMRAP-specific idea, so every working set counts — a joker
// chained above the top set is exactly the kind of set that takes the record,
// and reading only the AMRAP missed it. That also retires the old "more reps at
// this exact weight" flavour, which was only ever a proxy for progress on the
// AMRAP set.
//
// Sets are folded into their session first, so a session is a record if its
// best set beats every earlier session — within-session logging order never
// matters. A lift's first session is its baseline record. Ties within a single
// day are resolved by sessionId, so the order is stable rather than dependent
// on query order.
export function prSessionIds(
  records: ReadonlyArray<PerformanceRecord>,
  discount: HighRepDiscount = 'off',
): Set<number> {
  const byLift = new Map<number, Map<number, { date: Date; e1rm: number }>>()
  for (const r of records) {
    if (r.reps < 1 || r.weight <= 0) continue
    let sessions = byLift.get(r.liftId)
    if (!sessions) { sessions = new Map(); byLift.set(r.liftId, sessions) }
    const e1rm = estimated1RM(r.weight, r.reps, discount)
    const held = sessions.get(r.sessionId)
    if (!held) sessions.set(r.sessionId, { date: r.date, e1rm })
    else if (e1rm > held.e1rm) held.e1rm = e1rm
  }

  const out = new Set<number>()
  for (const sessions of byLift.values()) {
    const ordered = [...sessions.entries()].sort(
      (a, b) => a[1].date.getTime() - b[1].date.getTime() || a[0] - b[0]
    )
    let bestE1Rm = -Infinity
    for (const [sessionId, best] of ordered) {
      if (best.e1rm > bestE1Rm) { out.add(sessionId); bestE1Rm = best.e1rm }
    }
  }
  return out
}

// Detect whether (weight × reps) is a new PR for a given lift, relative to every
// working set already recorded for it. `excludeSetId` skips the just-saved set
// when the caller has already written it to the DB.
//
// Not AMRAPs alone. A joker chained above the top set is the likeliest set of the
// day to take a record, and the History badge already scores it (see
// prSessionIds) — the toast has to read the same history or the two disagree
// about the same session. Widening the *trigger* without widening this baseline
// would be worse than either: a joker scored against AMRAP-only history is
// measured against a past that excludes every previous joker, so almost any of
// them would look like a record. Cross blocks belong to the movement they train,
// so they count toward that lift and never toward the session's own.
//
// Two flavors of PR are reported independently:
//   - repPr: strictly more reps than any prior working set at this exact weight
//   - e1RmPr: strictly higher Wathan estimated 1RM than any prior working set
//
// A lift's first recorded work returns e1RmPr=true (sets the baseline record).
// A 0-rep set (failed) is never a PR and never a record: the reps < 1 guard
// below returns early, and isWorkingPerformance keeps prior failures out of the
// baseline, so a lift that was never completed can't be credited with an e1RM
// regardless of what the formula returns at reps=0.
export async function detectPRs(
  db: TrainingDB,
  liftId: number,
  weight: number,
  reps: number,
  excludeSetId?: number,
  discount: HighRepDiscount = 'off',
): Promise<PrResult> {
  const newE1Rm = estimated1RM(weight, reps, discount)
  if (reps < 1) return { repPr: false, e1RmPr: false, newE1Rm }

  const sessions = await db.sessions.where('liftId').equals(liftId).toArray()
  const sessionIds = sessions.map(s => s.id!).filter(Boolean)
  if (sessionIds.length === 0) {
    return { repPr: false, e1RmPr: false, newE1Rm }
  }

  const ownSets = await db.sets
    .where('sessionId').anyOf(sessionIds)
    .filter(s => s.type !== 'cross' && isWorkingPerformance(s))
    .toArray()
  const crossSets = await db.sets
    .where('liftId').equals(liftId)
    .filter(s => s.type === 'cross' && isWorkingPerformance(s))
    .toArray()
  let prior = [...ownSets, ...crossSets]
  if (excludeSetId != null) {
    prior = prior.filter(s => s.id !== excludeSetId)
  }
  if (prior.length === 0) {
    return { repPr: false, e1RmPr: true, newE1Rm }
  }

  const sameWeight = prior.filter(s => s.weight === weight)
  const prevBestReps = sameWeight.length > 0
    ? Math.max(...sameWeight.map(s => s.reps))
    : undefined
  const repPr = prevBestReps != null && reps > prevBestReps

  const prevBestE1Rm = Math.max(...prior.map(s => estimated1RM(s.weight, s.reps, discount)))
  const e1RmPr = newE1Rm > prevBestE1Rm

  return { repPr, e1RmPr, newE1Rm, prevBestReps, prevBestE1Rm }
}
