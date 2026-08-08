// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import { getExerciseHistory } from './exercise-history'

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
