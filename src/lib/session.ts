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
export async function discardPendingSession(db: TrainingDB, sessionId: number): Promise<void> {
  await db.transaction(async () => {
    const row = await db.sessions.get(sessionId)
    if (!row || row.status !== 'pending') return
    await db.sets.where('sessionId').equals(sessionId).delete()
    await db.accessorySets.where('sessionId').equals(sessionId).delete()
    await db.accessoryNotes.where('sessionId').equals(sessionId).delete()
    await db.sessions.delete(sessionId)
  })
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
