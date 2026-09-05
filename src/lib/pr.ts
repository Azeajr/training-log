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

export interface AmrapRecord {
  sessionId: number
  liftId: number
  date: Date
  weight: number
  reps: number
}

// Which sessions set a PR *at the time they were logged*. A PR used to exist
// only as a five-second toast mid-set; History can now badge the session that
// earned it. Evaluated against prior work only — a bigger AMRAP six weeks later
// must not retroactively un-PR the one that stood on the day.
//
// Same two flavours as detectAmrapPRs, and the same baseline rule: a lift's
// first successful AMRAP is a record. Ties within a single day are resolved by
// sessionId, so the order is stable rather than dependent on query order.
export function prSessionIds(
  records: ReadonlyArray<AmrapRecord>,
  discount: HighRepDiscount = 'off',
): Set<number> {
  const out = new Set<number>()
  const byLift = new Map<number, AmrapRecord[]>()
  for (const r of records) {
    if (r.reps < 1) continue
    const arr = byLift.get(r.liftId) ?? []
    arr.push(r)
    byLift.set(r.liftId, arr)
  }

  for (const arr of byLift.values()) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime() || a.sessionId - b.sessionId)
    let bestE1Rm = -Infinity
    const bestRepsAtWeight = new Map<number, number>()
    for (const r of arr) {
      const e1rm = estimated1RM(r.weight, r.reps, discount)
      const prevReps = bestRepsAtWeight.get(r.weight)
      const repPr = prevReps != null && r.reps > prevReps
      const e1RmPr = bestE1Rm === -Infinity || e1rm > bestE1Rm
      if (repPr || e1RmPr) out.add(r.sessionId)
      if (e1rm > bestE1Rm) bestE1Rm = e1rm
      if (prevReps == null || r.reps > prevReps) bestRepsAtWeight.set(r.weight, r.reps)
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
