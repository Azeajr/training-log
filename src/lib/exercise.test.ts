// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import {
  createExercise, renameExercise, setExerciseCategory,
  archiveExercise, unarchiveExercise,
  addExerciseToLift, removeExerciseFromLift,
} from './exercise'

beforeEach(async () => { await __resetForTest() })

async function seedLift() {
  return db.lifts.add({ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
}

describe('createExercise', () => {
  it('adds exercise and returns its id', async () => {
    const id = await createExercise(db, 'Chinup', 'reps')
    const ex = await db.exercises.get(id)
    expect(ex?.name).toBe('Chinup')
    expect(ex?.type).toBe('reps')
  })

  it('supports all three exercise types', async () => {
    const repId   = await createExercise(db, 'Chinup', 'reps')
    const timedId = await createExercise(db, 'Plank',  'timed')
    const distId  = await createExercise(db, 'Run',    'distance')
    expect((await db.exercises.get(repId))?.type).toBe('reps')
    expect((await db.exercises.get(timedId))?.type).toBe('timed')
    expect((await db.exercises.get(distId))?.type).toBe('distance')
  })

  it('stores the assistance category when provided', async () => {
    const id = await createExercise(db, 'Dips', 'reps', 'push')
    expect((await db.exercises.get(id))?.category).toBe('push')
  })

  it('leaves category null when omitted', async () => {
    const id = await createExercise(db, 'Mystery', 'reps')
    expect((await db.exercises.get(id))?.category).toBeNull()
  })
})

describe('setExerciseCategory', () => {
  it('updates the category of an existing exercise', async () => {
    const id = await createExercise(db, 'Row', 'reps', 'push')
    await setExerciseCategory(db, id, 'pull')
    expect((await db.exercises.get(id))?.category).toBe('pull')
  })
})

describe('renameExercise', () => {
  it('updates exercise name', async () => {
    const id = await createExercise(db, 'OldName', 'reps')
    await renameExercise(db, id, 'NewName')
    const ex = await db.exercises.get(id)
    expect(ex?.name).toBe('NewName')
  })
})

describe('archiveExercise', () => {
  it('marks exercise as archived', async () => {
    const id = await createExercise(db, 'Chinup', 'reps')
    await archiveExercise(db, id)
    expect((await db.exercises.get(id))?.archived).toBe(true)
  })

  it('removes all liftAccessory rows for the exercise', async () => {
    const exId   = await createExercise(db, 'Chinup', 'reps')
    const liftId = await seedLift()
    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    await archiveExercise(db, exId)
    expect(await db.liftAccessories.count()).toBe(0)
  })

  it('only removes rows for the archived exercise, not others', async () => {
    const exId1  = await createExercise(db, 'Chinup', 'reps')
    const exId2  = await createExercise(db, 'Dip',    'reps')
    const liftId = await seedLift()
    await db.liftAccessories.add({ liftId, exerciseId: exId1, order: 0 })
    await db.liftAccessories.add({ liftId, exerciseId: exId2, order: 1 })
    await archiveExercise(db, exId1)
    const las = await db.liftAccessories.toArray()
    expect(las).toHaveLength(1)
    expect(las[0].exerciseId).toBe(exId2)
  })
})

describe('unarchiveExercise', () => {
  it('clears the archived flag', async () => {
    const id = await createExercise(db, 'Chinup', 'reps')
    await archiveExercise(db, id)
    await unarchiveExercise(db, id)
    expect((await db.exercises.get(id))?.archived).toBe(false)
  })
})

describe('addExerciseToLift', () => {
  it('creates a liftAccessory row at order 0 when none exist', async () => {
    const exId   = await createExercise(db, 'Chinup', 'reps')
    const liftId = await seedLift()
    await addExerciseToLift(db, liftId, exId)
    const las = await db.liftAccessories.toArray()
    expect(las).toHaveLength(1)
    expect(las[0]).toMatchObject({ liftId, exerciseId: exId, order: 0 })
  })

  it('appends after existing rows for the same lift', async () => {
    const exId1  = await createExercise(db, 'Chinup', 'reps')
    const exId2  = await createExercise(db, 'Dip',    'reps')
    const liftId = await seedLift()
    await addExerciseToLift(db, liftId, exId1)
    await addExerciseToLift(db, liftId, exId2)
    const las = (await db.liftAccessories.toArray() as { order: number }[]).sort((a, b) => a.order - b.order)
    expect(las[0].order).toBe(0)
    expect(las[1].order).toBe(1)
  })

  it('uses max(existing order) + 1, tolerating gaps', async () => {
    const exId  = await createExercise(db, 'Chinup', 'reps')
    const liftId = await seedLift()
    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 5 })
    await addExerciseToLift(db, liftId, exId)
    const orders = (await db.liftAccessories.toArray() as { order: number }[]).map(la => la.order).sort((a, b) => a - b)
    expect(orders).toEqual([5, 6])
  })

  it('scopes order to each lift independently', async () => {
    const exId = await createExercise(db, 'Chinup', 'reps')
    const liftA = await seedLift()
    const liftB = await db.lifts.add({ name: 'Bench', order: 2, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await addExerciseToLift(db, liftA, exId)
    await addExerciseToLift(db, liftA, exId)
    await addExerciseToLift(db, liftB, exId)
    const las = await db.liftAccessories.toArray() as { liftId: number; order: number }[]
    const ordersA = las.filter(la => la.liftId === liftA).map(la => la.order).sort()
    const ordersB = las.filter(la => la.liftId === liftB).map(la => la.order).sort()
    expect(ordersA).toEqual([0, 1])
    expect(ordersB).toEqual([0])
  })
})

describe('removeExerciseFromLift', () => {
  it('deletes the specified liftAccessory row', async () => {
    const exId   = await createExercise(db, 'Chinup', 'reps')
    const liftId = await seedLift()
    const laId   = await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    await removeExerciseFromLift(db, laId)
    expect(await db.liftAccessories.count()).toBe(0)
  })

  it('only deletes the specified row, leaves others intact', async () => {
    const exId1  = await createExercise(db, 'Chinup', 'reps')
    const exId2  = await createExercise(db, 'Dip',    'reps')
    const liftId = await seedLift()
    const laId1  = await db.liftAccessories.add({ liftId, exerciseId: exId1, order: 0 })
    await db.liftAccessories.add({ liftId, exerciseId: exId2, order: 1 })
    await removeExerciseFromLift(db, laId1)
    const remaining = await db.liftAccessories.toArray()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].exerciseId).toBe(exId2)
  })
})
