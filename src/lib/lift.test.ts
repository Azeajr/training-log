// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import {
  createLift, updateLift, archiveLift, unarchiveLift, moveLift,
  addLiftSupplemental, updateLiftSupplemental, removeLiftSupplemental,
} from './lift'

beforeEach(async () => { await __resetForTest() })

describe('createLift', () => {
  it('creates an active lift with the next order and no assistance', async () => {
    await db.lifts.add({ name: 'A', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id = await createLift(db, { name: 'B', progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
    const lift = await db.lifts.get(id)
    expect(lift?.order).toBe(2)
    expect(lift?.archived).toBe(false)
    expect(await db.liftAccessories.where('liftId').equals(id).toArray()).toHaveLength(0)
  })

  it('orders the first lift at 1', async () => {
    const id = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    expect((await db.lifts.get(id))?.order).toBe(1)
  })
})

describe('updateLift', () => {
  it('patches name and increment', async () => {
    const id = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await updateLift(db, id, { name: 'Front Squat', progressionIncrement: 10 })
    const lift = await db.lifts.get(id)
    expect(lift?.name).toBe('Front Squat')
    expect(lift?.progressionIncrement).toBe(10)
  })
})

describe('archiveLift', () => {
  it('archives, deletes pending sessions, keeps completed history', async () => {
    const id = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const pending = await db.sessions.add({ cycleId, liftId: id, week: 2, date: new Date(), notes: null, status: 'pending' })
    const done = await db.sessions.add({ cycleId, liftId: id, week: 1, date: new Date(), notes: null, status: 'completed' })

    await archiveLift(db, id)

    expect((await db.lifts.get(id))?.archived).toBe(true)
    expect(await db.sessions.get(pending)).toBeUndefined()
    expect(await db.sessions.get(done)).toBeDefined()
  })

  it('unarchive restores it to the active roster', async () => {
    const id = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await archiveLift(db, id)
    await unarchiveLift(db, id)
    expect((await db.lifts.get(id))?.archived).toBe(false)
  })
})

describe('moveLift', () => {
  it('swaps order with the adjacent active lift', async () => {
    const a = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const b = await createLift(db, { name: 'B', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const aOrder = (await db.lifts.get(a))!.order
    const bOrder = (await db.lifts.get(b))!.order

    await moveLift(db, b, 'up')

    expect((await db.lifts.get(a))?.order).toBe(bOrder)
    expect((await db.lifts.get(b))?.order).toBe(aOrder)
  })

  it('is a no-op at the boundary', async () => {
    const a = await createLift(db, { name: 'A', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const before = (await db.lifts.get(a))!.order
    await moveLift(db, a, 'up')
    expect((await db.lifts.get(a))?.order).toBe(before)
  })
})

describe('cross-lift supplemental CRUD', () => {
  it('adds blocks with incrementing order and round-trips fields', async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id1 = await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'percent', percent: 0.7, sets: 5, reps: 10 })
    const id2 = await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'fsl', percent: null, sets: 3, reps: 8 })

    const b1 = await db.liftSupplementals.get(id1)
    expect(b1?.order).toBe(0)
    expect(b1?.percent).toBe(0.7)
    expect((await db.liftSupplementals.get(id2))?.order).toBe(1)
  })

  it('updates and removes a block', async () => {
    const day = await createLift(db, { name: 'Bench', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const mov = await createLift(db, { name: 'OHP', progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const id = await addLiftSupplemental(db, { liftId: day, movementLiftId: mov, weightMode: 'fsl', percent: null, sets: 5, reps: 10 })

    await updateLiftSupplemental(db, id, { sets: 3, reps: 12 })
    const b = await db.liftSupplementals.get(id)
    expect(b?.sets).toBe(3)
    expect(b?.reps).toBe(12)

    await removeLiftSupplemental(db, id)
    expect(await db.liftSupplementals.get(id)).toBeUndefined()
  })
})
