import { describe, it, expect } from 'vitest'
import { buildCleanupPlan } from './cleanup'

const ex = (id: number, archived = false) => ({ id, archived })
const atm = (id: number, exerciseId: number) => ({ id, exerciseId })
const aset = (id: number, sessionId: number, exerciseId: number) => ({ id, sessionId, exerciseId })
const sess = (id: number) => ({ id })

describe('buildCleanupPlan', () => {
  it('returns empty plan for empty DB', () => {
    expect(buildCleanupPlan([], [], [], [])).toEqual({
      orphanAtmIds: [],
      orphanSetIds: [],
      exercisesToArchive: [],
    })
  })

  it('detects orphan accessoryTrainingMax (exerciseId missing from exercises)', () => {
    const plan = buildCleanupPlan([ex(1)], [atm(20, 999)], [], [])
    expect(plan.orphanAtmIds).toEqual([20])
  })

  it('does not flag valid accessoryTrainingMax', () => {
    const plan = buildCleanupPlan([ex(1)], [atm(20, 1)], [], [])
    expect(plan.orphanAtmIds).toEqual([])
  })

  it('detects orphan accessorySet (sessionId missing from sessions)', () => {
    const plan = buildCleanupPlan([ex(1)], [], [aset(30, 999, 1)], [sess(1)])
    expect(plan.orphanSetIds).toEqual([30])
  })

  it('does not flag valid accessorySet', () => {
    const plan = buildCleanupPlan([ex(1)], [], [aset(30, 1, 1)], [sess(1)])
    expect(plan.orphanSetIds).toEqual([])
  })

  // Roster gone: relevance is logged-set history only. ex 1 has a surviving set,
  // ex 2 has none, so only ex 2 is an archive candidate.
  it('archives an exercise with no logged set history', () => {
    const plan = buildCleanupPlan([ex(1), ex(2)], [], [aset(30, 1, 1)], [sess(1)])
    expect(plan.exercisesToArchive).toEqual([2])
  })

  it('does not archive an exercise with valid accessorySet history', () => {
    const plan = buildCleanupPlan([ex(1)], [], [aset(30, 1, 1)], [sess(1)])
    expect(plan.exercisesToArchive).toEqual([])
  })

  it('does not archive an already-archived exercise', () => {
    const plan = buildCleanupPlan([ex(1, true)], [], [], [])
    expect(plan.exercisesToArchive).toEqual([])
  })

  it('archives an exercise whose only set rows are orphaned (sessionId not in sessions)', () => {
    const plan = buildCleanupPlan([ex(1)], [], [aset(30, 999, 1)], [])
    expect(plan.exercisesToArchive).toEqual([1])
    expect(plan.orphanSetIds).toEqual([30])
  })
})
