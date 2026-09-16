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
      exerciseNamesToArchive: [],
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

// ── F45 ─────────────────────────────────────────────────────────────────────
// "In use" was defined as "has a surviving logged accessorySet", so CLEANUP
// archived every never-logged exercise — including one the user had just
// configured as a lift's assistance default and given an accessory training max.
// After archiving, getAssistanceDefaults returns {} for that slot and Today's
// push slot is empty. Recovery works (the assistanceDefaults row survives), but
// nothing on screen says so: the toast reports a bare count.
describe('buildCleanupPlan respects configuration, not just logged sets (F45)', () => {
  it('keeps an exercise that is a live assistance default', () => {
    const plan = buildCleanupPlan(
      [{ id: 1 }],
      [],
      [],
      [],
      [{ exerciseId: 1 }],
    )
    expect(plan.exercisesToArchive).toEqual([])
  })

  it('keeps an exercise that has an accessory training max', () => {
    const plan = buildCleanupPlan(
      [{ id: 1 }],
      [{ id: 5, exerciseId: 1 }],
      [],
      [],
      [],
    )
    expect(plan.exercisesToArchive).toEqual([])
  })

  it('still archives an exercise that is neither logged nor configured', () => {
    const plan = buildCleanupPlan([{ id: 1 }], [], [], [], [])
    expect(plan.exercisesToArchive).toEqual([1])
  })

  it('names what it will archive so the dialog can list it', () => {
    const plan = buildCleanupPlan(
      [{ id: 1, name: 'Dips' }, { id: 2, name: 'Plank' }],
      [],
      [],
      [],
      [{ exerciseId: 1 }],
    )
    expect(plan.exercisesToArchive).toEqual([2])
    expect(plan.exerciseNamesToArchive).toEqual(['Plank'])
  })
})
