import { describe, it, expect } from 'vitest'
import { buildCleanupPlan } from './cleanup'

const ex = (id: number, archived = false) => ({ id, archived })
const la = (id: number, exerciseId: number) => ({ id, exerciseId })
const atm = (id: number, exerciseId: number) => ({ id, exerciseId })
const aset = (id: number, sessionId: number, exerciseId: number) => ({ id, sessionId, exerciseId })
const sess = (id: number) => ({ id })

describe('buildCleanupPlan', () => {
  it('returns empty plan for empty DB', () => {
    expect(buildCleanupPlan([], [], [], [], [])).toEqual({
      orphanLaIds: [],
      orphanAtmIds: [],
      orphanSetIds: [],
      exercisesToArchive: [],
    })
  })

  it('detects orphan liftAccessory (exerciseId missing from exercises)', () => {
    const plan = buildCleanupPlan([ex(1)], [la(10, 999)], [], [], [])
    expect(plan.orphanLaIds).toEqual([10])
  })

  it('does not flag valid liftAccessory', () => {
    const plan = buildCleanupPlan([ex(1)], [la(10, 1)], [], [], [])
    expect(plan.orphanLaIds).toEqual([])
  })

  it('detects orphan accessoryTrainingMax (exerciseId missing from exercises)', () => {
    const plan = buildCleanupPlan([ex(1)], [], [atm(20, 999)], [], [])
    expect(plan.orphanAtmIds).toEqual([20])
  })

  it('does not flag valid accessoryTrainingMax', () => {
    const plan = buildCleanupPlan([ex(1)], [], [atm(20, 1)], [], [])
    expect(plan.orphanAtmIds).toEqual([])
  })

  it('detects orphan accessorySet (sessionId missing from sessions)', () => {
    const plan = buildCleanupPlan([ex(1)], [], [], [aset(30, 999, 1)], [sess(1)])
    expect(plan.orphanSetIds).toEqual([30])
  })

  it('does not flag valid accessorySet', () => {
    const plan = buildCleanupPlan([ex(1)], [], [], [aset(30, 1, 1)], [sess(1)])
    expect(plan.orphanSetIds).toEqual([])
  })

  it('archives exercise with no liftAccessory and no set history', () => {
    const plan = buildCleanupPlan([ex(1), ex(2)], [la(10, 1)], [], [], [])
    expect(plan.exercisesToArchive).toEqual([2])
  })

  it('does not archive exercise with active liftAccessory', () => {
    const plan = buildCleanupPlan([ex(1)], [la(10, 1)], [], [], [])
    expect(plan.exercisesToArchive).toEqual([])
  })

  it('does not archive exercise with valid accessorySet history', () => {
    const plan = buildCleanupPlan([ex(1)], [], [], [aset(30, 1, 1)], [sess(1)])
    expect(plan.exercisesToArchive).toEqual([])
  })

  it('does not archive already-archived exercise', () => {
    const plan = buildCleanupPlan([ex(1, true)], [], [], [], [])
    expect(plan.exercisesToArchive).toEqual([])
  })

  it('archives exercise whose only set rows are orphaned (sessionId not in sessions)', () => {
    // Exercise 1's only set row references a deleted session — post-cleanup it has no history
    const plan = buildCleanupPlan([ex(1)], [], [], [aset(30, 999, 1)], [])
    expect(plan.exercisesToArchive).toEqual([1])
    expect(plan.orphanSetIds).toEqual([30])
  })

  it('does not archive exercise whose liftAccessory is orphaned by invalid exerciseId', () => {
    // La row 10 points to ex 999 (not in exercises) — ex 1 has no la or sets
    // La row 11 points to ex 1 (valid)
    const plan = buildCleanupPlan([ex(1)], [la(10, 999), la(11, 1)], [], [], [])
    expect(plan.orphanLaIds).toEqual([10])
    expect(plan.exercisesToArchive).toEqual([])
  })
})
