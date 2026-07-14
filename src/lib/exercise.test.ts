// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import {
  createExercise, renameExercise, setExerciseCategory,
  archiveExercise, unarchiveExercise,
} from './exercise'

beforeEach(async () => { await __resetForTest() })

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

  it('rejects a duplicate name regardless of case, whitespace, or archive status', async () => {
    const id = await createExercise(db, 'Chinup', 'reps')
    await archiveExercise(db, id)

    await expect(createExercise(db, '  CHINUP  ', 'timed')).rejects.toThrow(
      'An exercise named "CHINUP" already exists'
    )
    expect(await db.exercises.count()).toBe(1)
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

  it('rejects a rename that duplicates another exercise name', async () => {
    await createExercise(db, 'Chinup', 'reps')
    const rowId = await createExercise(db, 'Row', 'reps')

    await expect(renameExercise(db, rowId, 'chinup')).rejects.toThrow(/already exists/)
    expect((await db.exercises.get(rowId))?.name).toBe('Row')
  })
})

describe('archiveExercise', () => {
  it('marks exercise as archived', async () => {
    const id = await createExercise(db, 'Chinup', 'reps')
    await archiveExercise(db, id)
    expect((await db.exercises.get(id))?.archived).toBe(true)
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
