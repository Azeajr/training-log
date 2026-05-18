// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { TrainingDB } from '../db/db'
import {
  createExercise, renameExercise,
  archiveExercise, unarchiveExercise,
  addExerciseToLift, removeExerciseFromLift,
} from './exercise'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any

beforeEach(() => { db = new TrainingDB() })
afterEach(async () => { await db.delete() })

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
  it('creates a liftAccessory row with correct fields', async () => {
    const exId   = await createExercise(db, 'Chinup', 'reps')
    const liftId = await seedLift()
    await addExerciseToLift(db, liftId, exId, 0)
    const las = await db.liftAccessories.toArray()
    expect(las).toHaveLength(1)
    expect(las[0]).toMatchObject({ liftId, exerciseId: exId, order: 0 })
  })

  it('uses currentCount as order value for subsequent additions', async () => {
    const exId1  = await createExercise(db, 'Chinup', 'reps')
    const exId2  = await createExercise(db, 'Dip',    'reps')
    const liftId = await seedLift()
    await addExerciseToLift(db, liftId, exId1, 0)
    await addExerciseToLift(db, liftId, exId2, 1)
    const las = (await db.liftAccessories.toArray() as { order: number }[]).sort((a: { order: number }, b: { order: number }) => a.order - b.order)
    expect(las[0].order).toBe(0)
    expect(las[1].order).toBe(1)
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
