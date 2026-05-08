import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../db/db'
import { importFromRawData } from './exportImport'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('importFromRawData', () => {
  it('preserves explicit IDs so FK references stay valid after import', async () => {
    // Simulate lifts already existing (ids 1-4) before import, as seedDatabase creates them.
    // This replicates the bug scenario: clear() leaves sqlite_sequence at 4, then
    // bulkAdd with explicit ids 1-4 must not get reassigned to 5-8.
    await db.lifts.bulkAdd([
      { id: 1, name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
      { id: 2, name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
      { id: 3, name: 'Bench',    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
      { id: 4, name: 'Squat',    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
    ])

    await importFromRawData({
      lifts: [
        { id: 1, name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
        { id: 2, name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
        { id: 3, name: 'Bench',    order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' },
        { id: 4, name: 'Squat',    order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' },
      ],
      trainingMaxes: [
        { id: 8, liftId: 1, weight: 80,  setAt: '2026-03-23T04:00:00.000Z' },
        { id: 9, liftId: 3, weight: 105, setAt: '2026-03-25T04:00:00.000Z' },
      ],
      cycles: [
        { id: 1, number: 1, startDate: '2026-01-01T00:00:00.000Z', endDate: null },
      ],
      sessions: [
        { id: 1, cycleId: 1, liftId: 1, week: 1, date: '2026-01-06T00:00:00.000Z', notes: null, status: 'completed' },
        { id: 2, cycleId: 1, liftId: 3, week: 1, date: '2026-01-07T00:00:00.000Z', notes: null, status: 'completed' },
      ],
      sets: [
        { id: 1, sessionId: 1, type: 'main', setNumber: 1, weight: 55, reps: 5, isAmrap: false },
        { id: 2, sessionId: 2, type: 'main', setNumber: 1, weight: 75, reps: 5, isAmrap: false },
      ],
      exercises: [],
      liftAccessories: [],
      accessoryTrainingMaxes: [],
      accessorySets: [],
      settings: [],
    })

    const lifts = await db.lifts.toArray()
    const liftById = Object.fromEntries(lifts.map(l => [l.id!, l.name]))
    expect(liftById[1]).toBe('OHP')
    expect(liftById[4]).toBe('Squat')

    // trainingMaxes FK: liftId must resolve to a real lift
    const tms = await db.trainingMaxes.toArray()
    expect(tms).toHaveLength(2)
    for (const tm of tms) {
      expect(liftById[tm.liftId]).toBeDefined()
    }

    // sets FK: sessionId must resolve to a real session
    const sessions = await db.sessions.toArray()
    const sessionIds = new Set(sessions.map(s => s.id!))
    const sets = await db.sets.toArray()
    expect(sets).toHaveLength(2)
    for (const s of sets) {
      expect(sessionIds.has(s.sessionId)).toBe(true)
    }
  })

  it('replaces all existing data on import', async () => {
    await db.lifts.bulkAdd([
      { id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' },
    ])
    await db.trainingMaxes.add({ liftId: 1, weight: 999, setAt: new Date() })

    await importFromRawData({
      lifts: [{ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      trainingMaxes: [],
      cycles: [], sessions: [], sets: [], exercises: [],
      liftAccessories: [], accessoryTrainingMaxes: [], accessorySets: [], settings: [],
    })

    expect(await db.trainingMaxes.count()).toBe(0)
  })
})
