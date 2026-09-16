import type { TrainingDB } from '../db/index'
import type { Session } from '../types/domain'

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
