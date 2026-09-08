import type { TrainingDB } from '../db/index'
import type { HighRepDiscount } from '../types/domain'
import { estimated1RM } from './calc'

export interface AmrapPrResult {
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
// The badge tracks the two records a lifter actually keeps: **best estimated
// 1RM** and **heaviest weight moved**. Neither is an AMRAP-specific idea, so
// every working set counts — a joker chained above the top set is exactly the
// kind of thing that sets both, and judging only the AMRAP missed it. The
// heaviest-weight flavour replaces the old "more reps at this exact weight"
// rule, which was only ever a proxy for progress on the AMRAP set.
//
// Sets are folded into their session first, so a session is a record if its
// best set beats every earlier session — within-session logging order never
// matters. A lift's first session is a record on both counts. Ties within a
// single day are resolved by sessionId, so the order is stable rather than
// dependent on query order.
export function prSessionIds(
  records: ReadonlyArray<PerformanceRecord>,
  discount: HighRepDiscount = 'off',
): Set<number> {
  interface SessionBest { date: Date; e1rm: number; weight: number }
  const byLift = new Map<number, Map<number, SessionBest>>()
  for (const r of records) {
    if (r.reps < 1 || r.weight <= 0) continue
    let sessions = byLift.get(r.liftId)
    if (!sessions) { sessions = new Map(); byLift.set(r.liftId, sessions) }
    const e1rm = estimated1RM(r.weight, r.reps, discount)
    const held = sessions.get(r.sessionId)
    if (!held) sessions.set(r.sessionId, { date: r.date, e1rm, weight: r.weight })
    else {
      if (e1rm > held.e1rm) held.e1rm = e1rm
      if (r.weight > held.weight) held.weight = r.weight
    }
  }

  const out = new Set<number>()
  for (const sessions of byLift.values()) {
    const ordered = [...sessions.entries()].sort(
      (a, b) => a[1].date.getTime() - b[1].date.getTime() || a[0] - b[0]
    )
    let bestE1Rm = -Infinity
    let bestWeight = -Infinity
    for (const [sessionId, best] of ordered) {
      if (best.e1rm > bestE1Rm || best.weight > bestWeight) out.add(sessionId)
      if (best.e1rm > bestE1Rm) bestE1Rm = best.e1rm
      if (best.weight > bestWeight) bestWeight = best.weight
    }
  }
  return out
}

// Detect whether (weight × reps) is a new PR for a given lift, relative to all
// prior AMRAP sets recorded for that lift. `excludeSetId` skips the just-saved
// set when the caller has already written it to the DB.
//
// Two flavors of PR are reported independently:
//   - repPr: strictly more reps than any prior AMRAP at this exact weight
//   - e1RmPr: strictly higher Wathan estimated 1RM than any prior AMRAP
//
// First-ever AMRAP for a lift returns e1RmPr=true (sets the baseline record).
// A 0-rep AMRAP (failed set) is never a PR and never a record: the reps < 1
// guard below returns early, so a lift that was never completed can't be
// credited with an e1RM regardless of what the formula returns at reps=0.
export async function detectAmrapPRs(
  db: TrainingDB,
  liftId: number,
  weight: number,
  reps: number,
  excludeSetId?: number,
  discount: HighRepDiscount = 'off',
): Promise<AmrapPrResult> {
  const newE1Rm = estimated1RM(weight, reps, discount)
  if (reps < 1) return { repPr: false, e1RmPr: false, newE1Rm }

  const sessions = await db.sessions.where('liftId').equals(liftId).toArray()
  const sessionIds = sessions.map(s => s.id!).filter(Boolean)
  if (sessionIds.length === 0) {
    return { repPr: false, e1RmPr: false, newE1Rm }
  }

  let amrapSets = await db.sets
    .where('sessionId').anyOf(sessionIds)
    .filter(s => s.isAmrap && s.reps >= 1)
    .toArray()
  if (excludeSetId != null) {
    amrapSets = amrapSets.filter(s => s.id !== excludeSetId)
  }
  if (amrapSets.length === 0) {
    return { repPr: false, e1RmPr: true, newE1Rm }
  }

  const sameWeight = amrapSets.filter(s => s.weight === weight)
  const prevBestReps = sameWeight.length > 0
    ? Math.max(...sameWeight.map(s => s.reps))
    : undefined
  const repPr = prevBestReps != null && reps > prevBestReps

  const prevBestE1Rm = Math.max(...amrapSets.map(s => estimated1RM(s.weight, s.reps, discount)))
  const e1RmPr = newE1Rm > prevBestE1Rm

  return { repPr, e1RmPr, newE1Rm, prevBestReps, prevBestE1Rm }
}
