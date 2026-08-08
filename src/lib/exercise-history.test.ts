// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import { getExerciseHistory, getLiftHistory } from './exercise-history'

beforeEach(async () => {
  await __resetForTest()
})

afterEach(async () => {
  localStorage.clear()
})

describe('getExerciseHistory', () => {
  it('returns empty array when no sessions exist', async () => {
    expect(await getExerciseHistory(db, 1)).toEqual([])
  })

  it('returns empty array when no completed sessions exist', async () => {
    await db.sessions.add({
      id: 1, cycleId: 1, liftId: 1, week: 1,
      date: new Date('2026-01-06'), notes: null, status: 'pending',
    })
    await db.accessorySets.add({
      sessionId: 1, exerciseId: 1, setNumber: 1,
      weight: 100, reps: 10, duration: null, distance: null,
    })

    expect(await getExerciseHistory(db, 1)).toEqual([])
  })

  it('returns history entries for a specific exercise across completed sessions, newest first', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' },
      { id: 2, cycleId: 1, liftId: 1, week: 2, date: new Date('2026-01-13'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 10, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null },
      { id: 2, sessionId: 1, exerciseId: 10, setNumber: 2, weight: 50, reps: 8, duration: null, distance: null },
      { id: 3, sessionId: 2, exerciseId: 10, setNumber: 1, weight: 55, reps: 8, duration: null, distance: null },
    ])

    const result = await getExerciseHistory(db, 10)

    expect(result).toHaveLength(2)
    expect(result[0].sessionId).toBe(2)
    expect(result[0].sets).toHaveLength(1)
    expect(result[0].sets[0].weight).toBe(55)
    expect(result[1].sessionId).toBe(1)
    expect(result[1].sets).toHaveLength(2)
    expect(result[1].sets[0].weight).toBe(50)
    expect(result[1].sets[1].weight).toBe(50)
  })

  it('includes accessory notes in the history entry', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 10, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null },
    ])
    await db.accessoryNotes.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 10, notes: 'purple band' },
    ])

    const result = await getExerciseHistory(db, 10)

    expect(result).toHaveLength(1)
    expect(result[0].notes).toBe('purple band')
  })

  it('sets notes to null when no notes entry exists for the session+exercise', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 10, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null },
    ])

    const result = await getExerciseHistory(db, 10)

    expect(result).toHaveLength(1)
    expect(result[0].notes).toBeNull()
  })

  it('filters out sessions that have no sets for the given exercise', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' },
      { id: 2, cycleId: 1, liftId: 1, week: 2, date: new Date('2026-01-13'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 10, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null },
      // session 2 has sets for exercise 20, not 10
      { id: 2, sessionId: 2, exerciseId: 20, setNumber: 1, weight: 60, reps: 10, duration: null, distance: null },
    ])

    const result = await getExerciseHistory(db, 10)

    expect(result).toHaveLength(1)
    expect(result[0].sessionId).toBe(1)
  })

  it('sorts sets within an entry by setNumber ascending', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 10, setNumber: 3, weight: 50, reps: 8, duration: null, distance: null },
      { id: 2, sessionId: 1, exerciseId: 10, setNumber: 1, weight: 40, reps: 10, duration: null, distance: null },
      { id: 3, sessionId: 1, exerciseId: 10, setNumber: 2, weight: 45, reps: 9, duration: null, distance: null },
    ])

    const result = await getExerciseHistory(db, 10)

    expect(result[0].sets.map(s => s.setNumber)).toEqual([1, 2, 3])
  })

  it('handles timed exercise sets', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 10, setNumber: 1, weight: null, reps: null, duration: 60, distance: null },
    ])

    const result = await getExerciseHistory(db, 10)

    expect(result).toHaveLength(1)
    expect(result[0].sets[0].duration).toBe(60)
  })

  it('handles distance exercise sets', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 10, setNumber: 1, weight: null, reps: null, duration: null, distance: 100 },
    ])

    const result = await getExerciseHistory(db, 10)

    expect(result).toHaveLength(1)
    expect(result[0].sets[0].distance).toBe(100)
  })
})

describe('getLiftHistory', () => {
  it('returns empty array when no sessions exist', async () => {
    expect(await getLiftHistory(db, 1)).toEqual([])
  })

  it('returns empty array when no completed sessions exist for the lift', async () => {
    await db.sessions.add({
      id: 1, cycleId: 1, liftId: 1, week: 1,
      date: new Date('2026-01-06'), notes: null, status: 'pending',
    })
    await db.sets.add({
      sessionId: 1, type: 'main', setNumber: 3, weight: 170, reps: 5, isAmrap: true,
    })

    expect(await getLiftHistory(db, 1)).toEqual([])
  })

  it('returns lift history entries sorted newest first', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06T12:00:00'), notes: null, status: 'completed' },
      { id: 2, cycleId: 1, liftId: 1, week: 2, date: new Date('2026-01-13T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'main', setNumber: 3, weight: 170, reps: 13, isAmrap: true },
      { id: 2, sessionId: 2, type: 'main', setNumber: 3, weight: 180, reps: 11, isAmrap: true },
    ])

    const result = await getLiftHistory(db, 1)

    expect(result).toHaveLength(2)
    expect(result[0].week).toBe(2)
    expect(result[0].sets[0].weight).toBe(180)
    expect(result[1].week).toBe(1)
    expect(result[1].sets[0].weight).toBe(170)
  })

  it('includes week number and session notes', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 3, date: new Date('2026-01-20T12:00:00'), notes: 'felt strong', status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'main', setNumber: 1, weight: 130, reps: 5, isAmrap: false },
    ])

    const result = await getLiftHistory(db, 1)

    expect(result).toHaveLength(1)
    expect(result[0].week).toBe(3)
    expect(result[0].notes).toBe('felt strong')
  })

  it('filters out cross-lift sets belonging to other lifts', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false },
      { id: 2, sessionId: 1, type: 'cross', setNumber: 1, weight: 135, reps: 5, isAmrap: false, liftId: 2 },
      { id: 3, sessionId: 1, type: 'cross', setNumber: 2, weight: 135, reps: 5, isAmrap: false, liftId: 2 },
    ])

    const result = await getLiftHistory(db, 1)

    expect(result).toHaveLength(1)
    expect(result[0].sets).toHaveLength(1)
    expect(result[0].sets[0].type).toBe('warmup')
  })

  it('sorts sets within a session by setNumber', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'warmup', setNumber: 3, weight: 135, reps: 5, isAmrap: false },
      { id: 2, sessionId: 1, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false },
      { id: 3, sessionId: 1, type: 'warmup', setNumber: 2, weight: 95, reps: 5, isAmrap: false },
    ])

    const result = await getLiftHistory(db, 1)

    expect(result[0].sets.map(s => s.setNumber)).toEqual([1, 2, 3])
  })

  it('returns only completed sessions for the given liftId', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06T12:00:00'), notes: null, status: 'completed' },
      { id: 2, cycleId: 1, liftId: 2, week: 1, date: new Date('2026-01-07T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'main', setNumber: 3, weight: 170, reps: 8, isAmrap: true },
      { id: 2, sessionId: 2, type: 'main', setNumber: 3, weight: 100, reps: 10, isAmrap: true },
    ])

    const result = await getLiftHistory(db, 1)

    expect(result).toHaveLength(1)
    expect(result[0].sets[0].weight).toBe(170)
  })
})
