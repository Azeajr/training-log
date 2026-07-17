import type { TrainingDB } from '../db/index'
import { estimated1RM } from './calc'

export interface AmrapPrResult {
  repPr: boolean
  e1RmPr: boolean
  newE1Rm: number
  prevBestReps?: number
  prevBestE1Rm?: number
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
): Promise<AmrapPrResult> {
  const newE1Rm = estimated1RM(weight, reps)
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

  const prevBestE1Rm = Math.max(...amrapSets.map(s => estimated1RM(s.weight, s.reps)))
  const e1RmPr = newE1Rm > prevBestE1Rm

  return { repPr, e1RmPr, newE1Rm, prevBestReps, prevBestE1Rm }
}
