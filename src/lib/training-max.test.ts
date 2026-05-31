// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import { getCurrentTm, setTm, getAllCurrentTms } from './training-max'

beforeEach(async () => { await __resetForTest() })

async function seedLift(name: 'OHP' | 'Bench' | 'Squat' | 'Deadlift' = 'OHP') {
  return db.lifts.add({ name, order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
}

describe('getCurrentTm', () => {
  it('returns 0 when no TMs exist for lift', async () => {
    const liftId = await seedLift()
    expect(await getCurrentTm(db, liftId)).toBe(0)
  })

  it('returns the most recent TM weight', async () => {
    const liftId = await seedLift()
    await db.trainingMaxes.add({ liftId, weight: 100, setAt: new Date('2026-01-01') })
    await db.trainingMaxes.add({ liftId, weight: 105, setAt: new Date('2026-02-01') })
    expect(await getCurrentTm(db, liftId)).toBe(105)
  })

  it('uses setAt order — not insertion order', async () => {
    const liftId = await seedLift()
    await db.trainingMaxes.add({ liftId, weight: 115, setAt: new Date('2026-03-01') })
    await db.trainingMaxes.add({ liftId, weight: 100, setAt: new Date('2026-01-01') })
    expect(await getCurrentTm(db, liftId)).toBe(115)
  })
})

describe('setTm', () => {
  it('adds a new TM row and returns its id', async () => {
    const liftId = await seedLift()
    const id = await setTm(db, liftId, 200)
    expect(typeof id).toBe('number')
    const tms = await db.trainingMaxes.toArray()
    expect(tms).toHaveLength(1)
    expect(tms[0].weight).toBe(200)
    expect(tms[0].liftId).toBe(liftId)
  })

  it('does not overwrite existing TMs', async () => {
    const liftId = await seedLift()
    await setTm(db, liftId, 200)
    await setTm(db, liftId, 205)
    const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
    expect(tms).toHaveLength(2)
    expect(tms[0].weight).toBe(200)
    expect(tms[1].weight).toBe(205)
  })
})

describe('getAllCurrentTms', () => {
  it('returns empty object when no lifts exist', async () => {
    expect(await getAllCurrentTms(db)).toEqual({})
  })

  it('returns latest TM for each lift', async () => {
    const id1 = await db.lifts.add({ name: 'OHP',   order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id2 = await db.lifts.add({ name: 'Bench', order: 2, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId: id1, weight: 100, setAt: new Date('2026-01-01') })
    await db.trainingMaxes.add({ liftId: id1, weight: 105, setAt: new Date('2026-02-01') })
    await db.trainingMaxes.add({ liftId: id2, weight: 150, setAt: new Date('2026-01-01') })
    const result = await getAllCurrentTms(db)
    expect(result[id1]).toBe(105)
    expect(result[id2]).toBe(150)
  })

  it('omits lifts with no TMs', async () => {
    const id1 = await db.lifts.add({ name: 'OHP',   order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id2 = await db.lifts.add({ name: 'Bench', order: 2, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId: id1, weight: 100, setAt: new Date('2026-01-01') })
    const result = await getAllCurrentTms(db)
    expect(result[id1]).toBe(100)
    expect(result[id2]).toBeUndefined()
  })

  it('handles multiple lifts each with multiple TMs', async () => {
    const ids = await Promise.all([
      db.lifts.add({ name: 'OHP',      order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' }),
      db.lifts.add({ name: 'Deadlift', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' }),
    ])
    for (const [i, id] of ids.entries()) {
      await db.trainingMaxes.add({ liftId: id, weight: 100 + i * 50, setAt: new Date('2026-01-01') })
      await db.trainingMaxes.add({ liftId: id, weight: 105 + i * 50, setAt: new Date('2026-02-01') })
    }
    const result = await getAllCurrentTms(db)
    expect(result[ids[0]]).toBe(105)
    expect(result[ids[1]]).toBe(155)
  })

  it('keeps newer TM when an older TM is encountered after it (ts > latestAt false branch)', async () => {
    // Insert newer TM first so toArray() likely returns it first.
    // Second iteration: Jan timestamp < Mar timestamp → condition is FALSE → no update.
    // A mutant changing > to < or >= would return 200 (the older weight) instead of 210.
    const liftId = await seedLift()
    await db.trainingMaxes.add({ liftId, weight: 210, setAt: new Date('2026-03-01') }) // newer, first
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: new Date('2026-01-01') }) // older, second
    const result = await getAllCurrentTms(db)
    expect(result[liftId]).toBe(210)
  })
})
