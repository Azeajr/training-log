import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import type { Session, Set } from '../types/domain'
import {
  discardPendingSession, finalizePendingSession, hydrateSessionState,
  reconcileActiveSession, startOrResumePendingSession,
} from './session'

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

describe('startOrResumePendingSession', () => {
  const SLOT = { cycleId: 1, liftId: 1, week: 1 as const }
  const addPending = () => addSession('pending')

  it('creates the pending row when the slot is empty', async () => {
    const { session, created } = await startOrResumePendingSession(db, SLOT)
    expect(created).toBe(true)
    expect(session.id).toBeDefined()
    expect(await db.sessions.toArray()).toHaveLength(1)
  })

  it('resumes the existing pending row rather than creating a second', async () => {
    const id = await addPending()
    const { session, created } = await startOrResumePendingSession(db, SLOT)
    expect(created).toBe(false)
    expect(session.id).toBe(id)
    expect(await db.sessions.toArray()).toHaveLength(1)
  })

  it('two concurrent starts produce one pending row, and both see it', async () => {
    const [a, b] = await Promise.all([
      startOrResumePendingSession(db, SLOT),
      startOrResumePendingSession(db, SLOT),
    ])
    expect(a.session.id).toBe(b.session.id)
    expect((await db.sessions.toArray()).filter(s => s.status === 'pending')).toHaveLength(1)
  })

  it('leaves history alone — a completed row is not resumed', async () => {
    const done = await addSession('completed')
    const { session, created } = await startOrResumePendingSession(db, SLOT)
    expect(created).toBe(true)
    expect(session.id).not.toBe(done)
    expect((await db.sessions.get(done))?.status).toBe('completed')
  })

  it('recovers duplicate pending rows: the one with the work wins, the rest are retired', async () => {
    const empty = await addPending()
    const worked = await addPending()
    await db.sets.add({ sessionId: worked, type: 'main', setNumber: 1, weight: 185, reps: 5, isAmrap: false })

    const { session, created } = await startOrResumePendingSession(db, SLOT)

    expect(created).toBe(false)
    expect(session.id).toBe(worked)
    expect((await db.sessions.get(empty))?.status).toBe('skipped')
    // Retired, not deleted.
    expect(await db.sessions.get(empty)).toBeDefined()
  })

  it('breaks a tie between equally empty duplicates by age, stably', async () => {
    const first = await addPending()
    await addPending()

    const a = await startOrResumePendingSession(db, SLOT)
    const b = await startOrResumePendingSession(db, SLOT)

    expect(a.session.id).toBe(first)
    expect(b.session.id).toBe(first)
    expect((await db.sessions.toArray()).filter(s => s.status === 'pending')).toHaveLength(1)
  })
})

describe('finalizePendingSession', () => {
  it('applies the terminal status to a pending row and reports it did', async () => {
    const id = await addSession('pending')
    expect(await finalizePendingSession(db, id, { status: 'completed', notes: 'felt strong' })).toBe(true)
    const row = await db.sessions.get(id)
    expect(row?.status).toBe('completed')
    expect(row?.notes).toBe('felt strong')
  })

  it('refuses to rewrite a completed row as skipped, and keeps its saved fields', async () => {
    const id = await addSession('completed')
    await db.sessions.update(id, { notes: 'the real workout' })

    expect(await finalizePendingSession(db, id, { status: 'skipped' })).toBe(false)

    const row = await db.sessions.get(id)
    expect(row?.status).toBe('completed')
    expect(row?.notes).toBe('the real workout')
  })

  it('is idempotent — a second completion neither rewrites the row nor re-runs the child writes', async () => {
    const id = await addSession('pending')
    const saved = new Date('2026-01-06')
    const writeChildRows = async () => {
      await db.accessorySets.add({
        sessionId: id, exerciseId: 1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null,
      })
    }

    expect(await finalizePendingSession(db, id, { status: 'completed', date: saved }, writeChildRows)).toBe(true)
    expect(await finalizePendingSession(db, id, { status: 'completed', date: new Date('2026-02-01') }, writeChildRows)).toBe(false)

    const row = await db.sessions.get(id)
    expect(new Date(row!.date).getTime()).toBe(saved.getTime())
    expect(await db.accessorySets.where('sessionId').equals(id).toArray()).toHaveLength(1)
  })

  it('returns false when the row is gone', async () => {
    const id = await addSession('pending')
    await db.sessions.delete(id)
    expect(await finalizePendingSession(db, id, { status: 'completed' })).toBe(false)
  })

  it('does not write the child rows when the status write is refused', async () => {
    const id = await addSession('skipped')
    let ran = false
    expect(await finalizePendingSession(db, id, { status: 'completed' }, async () => { ran = true })).toBe(false)
    expect(ran).toBe(false)
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

describe('hydrateSessionState', () => {
  const pending = (): Session => ({ id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: 'left knee', status: 'pending' })

  const addSet = (type: Set['type'], setNumber: number, weight: number, liftId?: number) =>
    db.sets.add({ sessionId: 1, type, setNumber, weight, reps: 5, isAmrap: false, ...(liftId ? { liftId } : {}) })

  it('rebuilds the linear list in plan order, whatever order the rows come back in', async () => {
    await addSession('pending')
    // Inserted out of plan order on purpose: the store list is positional, so
    // supplemental rows sorting before main rows would point every logged set
    // at the wrong plan row.
    await addSet('fsl+bbb', 1, 130)
    await addSet('warmup', 2, 100)
    await addSet('main', 1, 130)
    await addSet('warmup', 1, 80)
    await addSet('joker', 1, 190)

    const state = await hydrateSessionState(db, pending())

    expect(state.loggedSets.map(s => `${s.type}${s.setNumber}`))
      .toEqual(['warmup1', 'warmup2', 'main1', 'joker1', 'fsl+bbb1'])
    expect(state.currentSetIndex).toBe(5)
    expect(state.restored).toBe(true)
  })

  it('keeps the database ids, so an edit addresses the saved row', async () => {
    await addSession('pending')
    const id = await addSet('warmup', 1, 80)
    const state = await hydrateSessionState(db, pending())
    expect(state.loggedSets[0].id).toBe(id)
  })

  it('splits cross sets out and leaves them off the linear cursor', async () => {
    await addSession('pending')
    await addSet('warmup', 1, 80)
    await addSet('cross', 1, 225, 2)
    await addSet('cross', 2, 225, 2)

    const state = await hydrateSessionState(db, pending())

    expect(state.loggedSets).toHaveLength(1)
    expect(state.loggedCrossSets.map(s => s.setNumber)).toEqual([1, 2])
    expect(state.currentSetIndex).toBe(1)
  })

  it('groups cross sets by their movement lift', async () => {
    await addSession('pending')
    await addSet('cross', 1, 225, 3)
    await addSet('cross', 1, 135, 2)
    await addSet('cross', 2, 135, 2)

    const state = await hydrateSessionState(db, pending())

    expect(state.loggedCrossSets.map(s => [s.liftId, s.setNumber]))
      .toEqual([[2, 1], [2, 2], [3, 1]])
  })

  it('restores the session notes and reports nothing to restore when there are no sets', async () => {
    await addSession('pending')
    const state = await hydrateSessionState(db, pending())
    expect(state.notes).toBe('left knee')
    expect(state.restored).toBe(false)
    expect(state.currentSetIndex).toBe(0)
  })
})
