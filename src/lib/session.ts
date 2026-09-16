import type { TrainingDB } from '../db/index'
import type { Session, Set } from '../types/domain'

// Discard an in-progress attempt: delete its logged rows and the pending
// session row itself, so no empty husk is left to hold the week open
// (weekComplete treats any pending row as work still owed).
//
// Guarded on the *database* status, not the store's copy: handleComplete
// updates status only in the DB, so workout.activeSession still says
// 'pending' after a session completes. If the app is killed while a
// post-complete modal is open, the persisted store resurrects that stale
// session — an unguarded discard would then wipe a real completed workout.
//
// The status check lives *inside* the transaction so it and the deletes are
// one BEGIN/COMMIT — no await gap between reading the status and acting on it
// where a concurrent completeSession could flip the row to 'completed'.
/**
 * The cascade itself, WITHOUT a transaction of its own.
 *
 * Callers that are already inside a transaction use this one. Transactions are
 * serialized (see `db/transaction.ts`), so a nested `db.transaction` would wait
 * on a lock its own caller is holding — `archiveLift` calling the wrapper below
 * from inside its transaction deadlocked exactly that way.
 *
 * One definition of "discard an attempt", so the callers cannot drift.
 */
export async function discardPendingSessionRows(db: TrainingDB, sessionId: number): Promise<void> {
  const row = await db.sessions.get(sessionId)
  if (!row || row.status !== 'pending') return
  await db.sets.where('sessionId').equals(sessionId).delete()
  await db.accessorySets.where('sessionId').equals(sessionId).delete()
  await db.accessoryNotes.where('sessionId').equals(sessionId).delete()
  await db.sessions.delete(sessionId)
}

export async function discardPendingSession(db: TrainingDB, sessionId: number): Promise<void> {
  await db.transaction(async () => {
    await discardPendingSessionRows(db, sessionId)
  })
}

/** The slot a session occupies: one lift, one week, one cycle. */
export interface SessionSlot {
  cycleId: number
  liftId: number
  week: 1 | 2 | 3 | 4
}

// More than one pending row for a slot is not a state the app should be able to
// reach, but installs already carry them (F16), so one has to be chosen. The one
// holding the most logged sets is the attempt the user actually worked in;
// among equals the oldest id wins, so the choice is stable across calls. The
// losers are retired as `skipped` rather than deleted — whatever they hold was
// still lifted, and they stop holding the week open either way.
//
// Runs inside its caller's transaction: transactions are serialized, so opening
// its own would wait on a lock the caller holds.
async function resolveDuplicatePending(db: TrainingDB, pending: Session[]): Promise<Session> {
  if (pending.length === 1) return pending[0]
  const withCounts = await Promise.all(pending.map(async session => ({
    session,
    sets: (await db.sets.where('sessionId').equals(session.id!).toArray()).length,
  })))
  withCounts.sort((a, b) => b.sets - a.sets || a.session.id! - b.session.id!)
  for (const { session } of withCounts.slice(1)) {
    await db.sessions.update(session.id!, { status: 'skipped' })
  }
  return withCounts[0].session
}

/**
 * Resolve a slot to its one live pending attempt, creating it if there is none.
 *
 * START had no in-flight guard and no atomicity: it read "is there a pending
 * session?", and two taps before the insert settled both saw none and both
 * created one. Completing the active one then left the hidden second attempt
 * holding the week open, with no way to reach it. A component-level flag would
 * not have been enough — a second tab calls this too.
 *
 * So the read and the create are one transaction. A caller that lost the race
 * gets the winner's row back rather than a second one, and `created` says which
 * happened, because a resumed row needs its saved state hydrated and a fresh one
 * does not.
 */
export async function startOrResumePendingSession(
  db: TrainingDB,
  slot: SessionSlot,
): Promise<{ session: Session; created: boolean }> {
  let out!: { session: Session; created: boolean }
  await db.transaction(async () => {
    const pending = (await db.sessions.where('cycleId').equals(slot.cycleId).toArray())
      .filter(s => s.id != null && s.liftId === slot.liftId && s.week === slot.week && s.status === 'pending')
    if (pending.length > 0) {
      out = { session: await resolveDuplicatePending(db, pending), created: false }
      return
    }
    const draft: Omit<Session, 'id'> = {
      cycleId: slot.cycleId,
      liftId: slot.liftId,
      week: slot.week,
      date: new Date(),
      notes: null,
      status: 'pending',
    }
    const id = await db.sessions.add(draft)
    out = { session: { ...draft, id }, created: true }
  })
  return out
}

/**
 * The workout store's view of a session, rebuilt from what the database kept.
 */
export interface HydratedSession {
  loggedSets: Set[]
  loggedCrossSets: Set[]
  currentSetIndex: number
  notes: string
  /** True when there was saved work to restore, so the caller can say so. */
  restored: boolean
}

// The linear set list is positional: index i of `loggedSets` is the set at
// position i of the composed plan, which runs warmup → main → joker →
// supplemental. Rebuilding it in any other order would point every logged set
// at the wrong row. Anything unrecognised sorts with the supplemental tail,
// where extra logged sets already live.
const LINEAR_RANK: Record<string, number> = { warmup: 0, main: 1, joker: 2 }
const linearRank = (type: string): number => LINEAR_RANK[type] ?? 3

/**
 * Rebuild the workout store's state for a session from its saved rows.
 *
 * Resuming a pending session used to run through `startSession`, which resets
 * the store to empty. Workout then derives all its progress from those empty
 * arrays, so a session with four sets already in the database looked untouched:
 * the cursor sat at zero and the next LOG inserted a second warmup set 1
 * alongside the row already there. A backup restore reaches this every time,
 * since a restored install has database rows and no local workout state at all.
 *
 * Sets come back with their database ids, so an edit or an undo addresses the
 * row it means rather than inserting a new one. The cursor is the count of
 * linear sets — cross sets carry their own per-block cursors and never move it.
 *
 * Assistance work is deliberately not rebuilt: it is held in the local store and
 * only written at COMPLETE, so for a pending session there is nothing saved to
 * rebuild. The caller seeds the lift's defaults and says so, rather than letting
 * an empty assistance section imply the earlier attempt logged none.
 */
export async function hydrateSessionState(
  db: TrainingDB,
  session: Session,
): Promise<HydratedSession> {
  if (session.id == null) {
    return { loggedSets: [], loggedCrossSets: [], currentSetIndex: 0, notes: session.notes ?? '', restored: false }
  }
  const sets = await db.sets.where('sessionId').equals(session.id).toArray()

  const byId = (a: Set, b: Set) => (a.id ?? 0) - (b.id ?? 0)
  const loggedSets = sets
    .filter(s => s.type !== 'cross')
    .sort((a, b) => linearRank(a.type) - linearRank(b.type) || a.setNumber - b.setNumber || byId(a, b))
  // Grouped by movement lift, because every cross consumer filters by liftId and
  // then reads the list positionally within that group.
  const loggedCrossSets = sets
    .filter(s => s.type === 'cross')
    .sort((a, b) => (a.liftId ?? 0) - (b.liftId ?? 0) || a.setNumber - b.setNumber || byId(a, b))

  return {
    loggedSets,
    loggedCrossSets,
    currentSetIndex: loggedSets.length,
    notes: session.notes ?? '',
    restored: sets.length > 0,
  }
}

/**
 * End a session, but only if it is still the pending attempt.
 *
 * Both ways a session ends — COMPLETE and SKIP — used to write their status
 * unconditionally, which made them destructive against a stale store. The
 * persisted workout store outlives its row: kill the app while a post-complete
 * modal is open and it comes back holding a session the database already
 * finished. SKIP then rewrote a completed workout as `skipped`, and COMPLETE
 * appended a second copy of every accessory set while overwriting the date and
 * notes that were saved the first time.
 *
 * So the status check and the writes are one transaction, and the answer comes
 * back to the caller: `true` means this call is the one that ended the session,
 * `false` means it was already over and nothing was written. `writeChildRows`
 * runs inside the same transaction, so the accessory rows and the status flip
 * commit together or not at all.
 */
export async function finalizePendingSession(
  db: TrainingDB,
  sessionId: number,
  update: Partial<Omit<Session, 'id' | 'status'>> & { status: 'completed' | 'skipped' },
  writeChildRows?: () => Promise<void>,
): Promise<boolean> {
  let applied = false
  await db.transaction(async () => {
    const row = await db.sessions.get(sessionId)
    if (!row || row.status !== 'pending') return
    await db.sessions.update(sessionId, update)
    if (writeChildRows) await writeChildRows()
    applied = true
  })
  return applied
}

// The persisted workout store can drift from its DB row. Two ways: the app is
// killed while a post-complete modal is open (store still 'pending', DB row
// 'completed'), or an exit deleted the row out from under a store that a crash
// then failed to clear (store points at a gone id). Returns the live pending
// row when it's safe to resume, or null when the stored session is stale and
// must not be resumed into. One reconciliation point for every entry that
// resumes from workout.activeSession (Today's START, Workout's loadData).
export async function reconcileActiveSession(
  db: TrainingDB,
  session: Session,
): Promise<Session | null> {
  if (!session.id) return null
  const row = await db.sessions.get(session.id)
  if (!row || row.status !== 'pending') return null
  return row
}
