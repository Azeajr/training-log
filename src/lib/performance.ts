import type { TrainingDB } from '../db/index'
import type { HighRepDiscount, Session, Set } from '../types/domain'
import { estimated1RM } from './calc'

// ── What counts as a record ─────────────────────────────────────────────────
//
// One rule, one reader. Three features used to answer this three different
// ways against the same database: the mid-set PR toast (`detectPRs`) filtered
// nothing but `liftId`, the History badge (`prSessionIds`) took `completed`
// sessions only, and the Stats panel (`RecordsPanel`) also filtered nothing —
// so Stats could show a permanent record from a session History would never
// display, and the toast could stay silent about a session History badged.
//
// The rule: **a set counts once its session is completed, plus the session
// currently being logged.** That second clause is not decoration — during a
// workout the live session is `pending` by definition, and without it the
// toast is measured against a history that excludes everything done today, in
// the one session it exists to report on. Callers that are not logging pass no
// session and get the completed-only view the History badge uses.
//
// Two joins that were missing everywhere:
//   - a cross set belongs to the movement it trains, so it is attributed by its
//     own `liftId` — but its SESSION still decides whether it counts.
//   - `db.sets.where('liftId')` has no session join at all, so sets orphaned by
//     `archiveLift` (which deletes the session row and not its sets) scored
//     permanent records no screen could ever display.

const countsForRecords = (s: Session, liveSessionId?: number): boolean =>
  s.status === 'completed' || (liveSessionId != null && s.id === liveSessionId)

export type BaselineSets = {
  /** Non-cross work from this lift's own qualifying sessions. */
  own: Set[]
  /** Cross work tagged for this lift, from any qualifying session. */
  cross: Set[]
  /** Every qualifying session that contributed, by id. */
  sessionsById: Map<number, Session>
}

/**
 * Every set that counts toward `liftId`'s records, with the ownership rule
 * applied once. `liveSessionId` opts the session being logged into the
 * baseline; omit it for a completed-only view.
 */
export async function baselineSets(
  db: TrainingDB,
  liftId: number,
  liveSessionId?: number,
): Promise<BaselineSets> {
  const sessionsById = new Map<number, Session>()

  const ownSessions = (await db.sessions.where('liftId').equals(liftId).toArray())
    .filter((s) => countsForRecords(s, liveSessionId))
  for (const s of ownSessions) if (s.id != null) sessionsById.set(s.id, s)

  const ownIds = ownSessions.map((s) => s.id!).filter(Boolean)
  const own = ownIds.length
    ? (await db.sets.where('sessionId').anyOf(ownIds).toArray()).filter((s) => s.type !== 'cross')
    : []

  // Cross sets live in other lifts' sessions, so resolve those separately and
  // hold them to the same rule. This is also what drops orphans: a set whose
  // session row is gone resolves to nothing and is excluded.
  const taggedCross = (await db.sets.where('liftId').equals(liftId).toArray())
    .filter((s) => s.type === 'cross')
  const crossSessionIds = [...new Set(taggedCross.map((s) => s.sessionId))]
    .filter((id) => id != null && !sessionsById.has(id))
  if (crossSessionIds.length > 0) {
    const crossSessions = (await db.sessions.where('id').anyOf(crossSessionIds).toArray())
      .filter((s) => countsForRecords(s, liveSessionId))
    for (const s of crossSessions) if (s.id != null) sessionsById.set(s.id, s)
  }
  const cross = taggedCross.filter((s) => sessionsById.has(s.sessionId))

  return { own, cross, sessionsById }
}

/** The flat list of qualifying working sets — what the record readers score. */
export async function baselineWorkingSets(
  db: TrainingDB,
  liftId: number,
  liveSessionId?: number,
): Promise<Set[]> {
  const { own, cross } = await baselineSets(db, liftId, liveSessionId)
  return [...own, ...cross].filter(isWorkingPerformance)
}

// A completed lift performance: anything that represents real loaded work.
// Callers decide ownership/attribution (a cross set belongs to its movement
// lift); this rule excludes warmups, failures, and unloaded rows. The weight
// guard matters because the weight stepper bottoms out at 0: a 0lb set scores
// an e1RM of 0, which would otherwise drag a median seed down (or, as a week's
// only set, zero it out) and read as a real record.
export const isWorkingPerformance = (set: Set): boolean =>
  set.type !== 'warmup' && set.reps >= 1 && set.weight > 0

export const bestEstimatedPerformance = (
  sets: readonly Set[],
  discount: HighRepDiscount = 'off',
): Set | undefined => sets.reduce<Set | undefined>((best, set) =>
  !best || estimated1RM(set.weight, set.reps, discount) > estimated1RM(best.weight, best.reps, discount)
    ? set
    : best,
undefined)
