import { describe, it, expect, beforeEach } from 'vitest'
import type { Exercise } from '../types/domain'
import {
  sectionForCategory, groupByAssistanceSection, accessoryRecencyRanks,
  getAssistanceDefaults, setAssistanceDefault, getAssistanceDefaultPicks,
  syncAssistanceDefaultsForCategory,
} from './assistance'
import { db } from '../db/index'
import { __resetForTest } from '../db/sqlite-client'

const ex = (name: string, category?: Exercise['category']): { exercise: Exercise } => ({
  exercise: { name, type: 'reps', category },
})

describe('sectionForCategory', () => {
  it('maps push and pull to their own sections', () => {
    expect(sectionForCategory('push')).toBe('push')
    expect(sectionForCategory('pull')).toBe('pull')
  })

  it('merges legs and core into one section', () => {
    expect(sectionForCategory('legs')).toBe('legs_core')
    expect(sectionForCategory('core')).toBe('legs_core')
  })

  it('returns null for an untagged exercise', () => {
    expect(sectionForCategory(undefined)).toBeNull()
  })
})

describe('groupByAssistanceSection', () => {
  it('buckets items into push / pull / legs_core / uncategorized', () => {
    const groups = groupByAssistanceSection([
      ex('Dips', 'push'),
      ex('Chinups', 'pull'),
      ex('Bulgarian Split Squat', 'legs'),
      ex('Plank', 'core'),
      ex('Mystery'),
    ])
    expect(groups.push.map(i => i.exercise.name)).toEqual(['Dips'])
    expect(groups.pull.map(i => i.exercise.name)).toEqual(['Chinups'])
    expect(groups.legs_core.map(i => i.exercise.name)).toEqual(['Bulgarian Split Squat', 'Plank'])
    expect(groups.uncategorized.map(i => i.exercise.name)).toEqual(['Mystery'])
  })

  it('preserves input order within a bucket', () => {
    const groups = groupByAssistanceSection([ex('A', 'pull'), ex('B', 'pull'), ex('C', 'pull')])
    expect(groups.pull.map(i => i.exercise.name)).toEqual(['A', 'B', 'C'])
  })
})

describe('accessoryRecencyRanks', () => {
  // sessions are passed newest-first; rank 0 = most recent session.
  const sessions = [{ id: 30 }, { id: 20 }, { id: 10 }]

  it('ranks each accessory by its most recent session', () => {
    const ranks = accessoryRecencyRanks(sessions, [
      { sessionId: 10, exerciseId: 1 }, // oldest only
      { sessionId: 30, exerciseId: 2 }, // newest
      { sessionId: 20, exerciseId: 1 }, // exercise 1 also in middle → best (lower) wins
    ])
    expect(ranks.get(2)).toBe(0)
    expect(ranks.get(1)).toBe(1)
  })

  it('omits exercises never logged for the lift', () => {
    const ranks = accessoryRecencyRanks(sessions, [{ sessionId: 10, exerciseId: 5 }])
    expect(ranks.has(99)).toBe(false)
    expect(ranks.get(5)).toBe(2)
  })

  it('ignores accessory sets from unrelated sessions', () => {
    const ranks = accessoryRecencyRanks(sessions, [{ sessionId: 999, exerciseId: 7 }])
    expect(ranks.has(7)).toBe(false)
  })

  it('only considers the most recent maxSessions sessions', () => {
    // exercise 8 lives only in the 3rd-newest session → excluded when capped at 2.
    const accSets = [
      { sessionId: 30, exerciseId: 1 }, // newest
      { sessionId: 10, exerciseId: 8 }, // oldest, beyond the cap
    ]
    const ranks = accessoryRecencyRanks(sessions, accSets, 2)
    expect(ranks.get(1)).toBe(0)
    expect(ranks.has(8)).toBe(false)
  })
})

describe('assistance defaults (db-backed)', () => {
  const LIFT = 1

  beforeEach(async () => {
    await __resetForTest()
  })

  const addExercise = (name: string, category: Exercise['category'], archived = false) =>
    db.exercises.add({ name, type: 'reps', category, archived })

  const setAtm = (exerciseId: number, weight: number, setAt: Date) =>
    db.accessoryTrainingMaxes.add({ exerciseId, weight, incrementLb: 5, setAt })

  describe('getAssistanceDefaults', () => {
    it('returns the picked exercise per section, keyed by section', async () => {
      const dips = await addExercise('Dips', 'push')
      const chin = await addExercise('Chinups', 'pull')
      await setAssistanceDefault(db, LIFT, 'push', dips)
      await setAssistanceDefault(db, LIFT, 'pull', chin)

      const defaults = await getAssistanceDefaults(db, LIFT)
      expect(defaults.push).toEqual({ exerciseId: dips, name: 'Dips' })
      expect(defaults.pull).toEqual({ exerciseId: chin, name: 'Chinups' })
      expect(defaults.legs_core).toBeUndefined()
    })

    it('drops a default whose exercise was archived', async () => {
      const dips = await addExercise('Dips', 'push')
      await setAssistanceDefault(db, LIFT, 'push', dips)
      await db.exercises.update(dips, { archived: true })
      expect(await getAssistanceDefaults(db, LIFT)).toEqual({})
    })

    it('returns {} for a lift with no defaults', async () => {
      expect(await getAssistanceDefaults(db, LIFT)).toEqual({})
    })
  })

  describe('setAssistanceDefault', () => {
    it('replaces the pick for a section instead of accumulating rows (last wins)', async () => {
      const dips = await addExercise('Dips', 'push')
      const cgbp = await addExercise('Close-Grip Bench', 'push')
      await setAssistanceDefault(db, LIFT, 'push', dips)
      await setAssistanceDefault(db, LIFT, 'push', cgbp)

      const rows = await db.assistanceDefaults.where('liftId').equals(LIFT).toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0].exerciseId).toBe(cgbp)
    })

    it('keeps a separate default per (lift, section)', async () => {
      const dips = await addExercise('Dips', 'push')
      const chin = await addExercise('Chinups', 'pull')
      await setAssistanceDefault(db, LIFT, 'push', dips)
      await setAssistanceDefault(db, LIFT, 'pull', chin)
      await setAssistanceDefault(db, 2, 'push', dips)
      expect(await db.assistanceDefaults.toArray()).toHaveLength(3)
    })
  })

  describe('getAssistanceDefaultPicks', () => {
    it('resolves picks with the latest TM and its working weight', async () => {
      const dips = await addExercise('Dips', 'push')
      await setAtm(dips, 90, new Date('2026-01-01'))
      await setAtm(dips, 100, new Date('2026-02-01')) // latest wins
      await setAssistanceDefault(db, LIFT, 'push', dips)

      const picks = await getAssistanceDefaultPicks(db, LIFT)
      expect(picks).toEqual([
        { section: 'push', exerciseId: dips, exerciseName: 'Dips', tm: 100, calculatedWeight: 75 },
      ])
    })

    it('skips a default that has no accessory training max yet', async () => {
      const dips = await addExercise('Dips', 'push')
      await setAssistanceDefault(db, LIFT, 'push', dips)
      expect(await getAssistanceDefaultPicks(db, LIFT)).toEqual([])
    })

    it('skips an archived default even when it has a TM', async () => {
      const dips = await addExercise('Dips', 'push', true)
      await setAtm(dips, 100, new Date('2026-01-01'))
      await setAssistanceDefault(db, LIFT, 'push', dips)
      expect(await getAssistanceDefaultPicks(db, LIFT)).toEqual([])
    })
  })

  describe('syncAssistanceDefaultsForCategory (re-tag cascade)', () => {
    it('moves a default to the section its new category maps to when the slot is free', async () => {
      const dips = await addExercise('Dips', 'push')
      await setAssistanceDefault(db, LIFT, 'push', dips)

      await syncAssistanceDefaultsForCategory(db, dips, 'pull')

      const defaults = await getAssistanceDefaults(db, LIFT)
      expect(defaults.push).toBeUndefined()
      expect(defaults.pull).toEqual({ exerciseId: dips, name: 'Dips' })
    })

    it('collapses legs and core into the same section — a legs↔core re-tag is a no-op', async () => {
      const squat = await addExercise('Split Squat', 'legs')
      await setAssistanceDefault(db, LIFT, 'legs_core', squat)

      await syncAssistanceDefaultsForCategory(db, squat, 'core')

      expect((await getAssistanceDefaults(db, LIFT)).legs_core).toEqual({ exerciseId: squat, name: 'Split Squat' })
      expect(await db.assistanceDefaults.where('exerciseId').equals(squat).toArray()).toHaveLength(1)
    })

    it('drops the default when the target section is already taken, without clobbering the occupant', async () => {
      const dips = await addExercise('Dips', 'push')
      const chin = await addExercise('Chinups', 'pull')
      await setAssistanceDefault(db, LIFT, 'push', dips)
      await setAssistanceDefault(db, LIFT, 'pull', chin)

      // Dips re-tagged to pull, but pull is already Chinups → Dips's default is dropped.
      await syncAssistanceDefaultsForCategory(db, dips, 'pull')

      const defaults = await getAssistanceDefaults(db, LIFT)
      expect(defaults.push).toBeUndefined()
      expect(defaults.pull).toEqual({ exerciseId: chin, name: 'Chinups' })
      expect(await db.assistanceDefaults.where('exerciseId').equals(dips).toArray()).toHaveLength(0)
    })

    it('only touches the re-tagged exercise, across all lifts that defaulted it', async () => {
      const dips = await addExercise('Dips', 'push')
      await setAssistanceDefault(db, 1, 'push', dips)
      await setAssistanceDefault(db, 2, 'push', dips)

      await syncAssistanceDefaultsForCategory(db, dips, 'pull')

      expect((await getAssistanceDefaults(db, 1)).pull).toEqual({ exerciseId: dips, name: 'Dips' })
      expect((await getAssistanceDefaults(db, 2)).pull).toEqual({ exerciseId: dips, name: 'Dips' })
    })
  })
})
