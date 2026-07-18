import type { TrainingDB } from '../db/index'

// Discard an in-progress attempt: delete its logged rows and the pending
// session row itself, so no empty husk is left to hold the week open
// (weekComplete treats any pending row as work still owed).
//
// Guarded on the *database* status, not the store's copy: handleComplete
// updates status only in the DB, so workout.activeSession still says
// 'pending' after a session completes. If the app is killed while a
// post-complete modal is open, the persisted store resurrects that stale
// session — an unguarded discard would then wipe a real completed workout.
export async function discardPendingSession(db: TrainingDB, sessionId: number): Promise<void> {
  const row = await db.sessions.get(sessionId)
  if (!row || row.status !== 'pending') return
  await db.transaction(async () => {
    await db.sets.where('sessionId').equals(sessionId).delete()
    await db.accessorySets.where('sessionId').equals(sessionId).delete()
    await db.accessoryNotes.where('sessionId').equals(sessionId).delete()
    await db.sessions.delete(sessionId)
  })
}
