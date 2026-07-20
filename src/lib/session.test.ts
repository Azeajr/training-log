import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import type { Session } from '../types/domain'
import { discardPendingSession, reconcileActiveSession } from './session'

beforeEach(async () => { await __resetForTest() })

const addSession = (status: Session['status']) =>
  db.sessions.add({ cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status })

// A store-shaped session object pointing at a given row id (or none).
const storeSession = (id?: number): Session => ({
  id, cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending',
})

describe('reconcileActiveSession', () => {
  it('returns the live row when the DB session is still pending', async () => {
    const id = await addSession('pending')
    const row = await reconcileActiveSession(db, storeSession(id))
    expect(row?.id).toBe(id)
    expect(row?.status).toBe('pending')
  })

  it('returns null when the store session has no id', async () => {
    expect(await reconcileActiveSession(db, storeSession(undefined))).toBeNull()
  })

  it('returns null when the DB row is gone (deleted out from under the store)', async () => {
    const id = await addSession('pending')
    await db.sessions.delete(id)
    expect(await reconcileActiveSession(db, storeSession(id))).toBeNull()
  })

  it('returns null when the DB row already completed (stale store after a killed modal)', async () => {
    const id = await addSession('completed')
    expect(await reconcileActiveSession(db, storeSession(id))).toBeNull()
  })

  it('returns null when the DB row was skipped', async () => {
    const id = await addSession('skipped')
    expect(await reconcileActiveSession(db, storeSession(id))).toBeNull()
  })
})

describe('discardPendingSession', () => {
  async function seedChildRows(sessionId: number) {
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    await db.accessorySets.add({ sessionId, exerciseId: 1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    await db.accessoryNotes.add({ sessionId, exerciseId: 1, notes: 'band assisted' })
  }

  it('deletes a pending session and all its child rows', async () => {
    const id = await addSession('pending')
    await seedChildRows(id)

    await discardPendingSession(db, id)

    expect(await db.sessions.get(id)).toBeUndefined()
    expect(await db.sets.where('sessionId').equals(id).toArray()).toHaveLength(0)
    expect(await db.accessorySets.where('sessionId').equals(id).toArray()).toHaveLength(0)
    expect(await db.accessoryNotes.where('sessionId').equals(id).toArray()).toHaveLength(0)
  })

  it('no-ops on a completed session — keeps the row and its data', async () => {
    const id = await addSession('completed')
    await seedChildRows(id)

    await discardPendingSession(db, id)

    expect((await db.sessions.get(id))?.status).toBe('completed')
    expect(await db.sets.where('sessionId').equals(id).toArray()).toHaveLength(1)
    expect(await db.accessorySets.where('sessionId').equals(id).toArray()).toHaveLength(1)
    expect(await db.accessoryNotes.where('sessionId').equals(id).toArray()).toHaveLength(1)
  })
})
