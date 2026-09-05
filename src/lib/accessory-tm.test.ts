import { describe, it, expect, beforeEach } from 'vitest'
import { db, dbReady } from '../db/index'
import { getAccessoryTmRecommendations, applyAccessoryTm } from './accessory-tm'
import { ACCESSORY_SETS } from './calc'

const acc = (over: Partial<{
  exerciseId: number
  exerciseName: string
  tm: number
  calculatedWeight: number
  loggedSets: Array<{ weight?: number | null }>
}> = {}) => ({
  exerciseId: 1,
  exerciseName: 'Dumbbell Row',
  tm: 60,
  calculatedWeight: 45,
  loggedSets: [],
  ...over,
})

const sets = (weight: number, n = ACCESSORY_SETS) =>
  Array.from({ length: n }, () => ({ weight }))

describe('getAccessoryTmRecommendations', () => {
  it('suggests a training max when the whole slate ran off-prescription', () => {
    const out = getAccessoryTmRecommendations([acc({ loggedSets: sets(60) })])
    expect(out).toEqual([{
      exerciseId: 1,
      exerciseName: 'Dumbbell Row',
      currentTm: 60,
      suggestedTm: 80, // 60 / 0.75
      workedWeight: 60,
    }])
  })

  // The whole point of the change: one heavier set is "the 45s were taken",
  // not a program decision.
  it('ignores a single off-prescription set', () => {
    expect(getAccessoryTmRecommendations([acc({ loggedSets: sets(60, 1) })])).toEqual([])
  })

  it('ignores a slate that disagrees with itself', () => {
    const loggedSets = [{ weight: 60 }, { weight: 45 }, { weight: 60 }]
    expect(getAccessoryTmRecommendations([acc({ loggedSets })])).toEqual([])
  })

  it('ignores work at the prescribed weight', () => {
    expect(getAccessoryTmRecommendations([acc({ loggedSets: sets(45) })])).toEqual([])
  })

  it('ignores a weight that rounds back to the current training max', () => {
    // 46 / 0.75 = 61.3 → rounds to 60, which is already the TM.
    expect(getAccessoryTmRecommendations([acc({ tm: 60, loggedSets: sets(46) })])).toEqual([])
  })

  it('skips sets with no weight recorded', () => {
    const loggedSets = [{ weight: null }, { weight: 60 }, { weight: 60 }]
    expect(getAccessoryTmRecommendations([acc({ loggedSets })])).toEqual([])
  })

  it('reports every drifting accessory in one pass', () => {
    const out = getAccessoryTmRecommendations([
      acc({ loggedSets: sets(60) }),
      acc({ exerciseId: 2, exerciseName: 'Dip', tm: 0, calculatedWeight: 0, loggedSets: sets(25) }),
      acc({ exerciseId: 3, exerciseName: 'Curl', loggedSets: sets(45) }),
    ])
    expect(out.map(r => r.exerciseId)).toEqual([1, 2])
  })
})

describe('applyAccessoryTm', () => {
  beforeEach(async () => {
    await dbReady
    await db.accessoryTrainingMaxes.clear()
  })

  it('appends a training max, inheriting the exercise increment', async () => {
    await db.accessoryTrainingMaxes.add({
      exerciseId: 7, weight: 60, incrementLb: 2.5, setAt: new Date(2026, 0, 1),
    })

    await applyAccessoryTm(db, 7, 80)

    const rows = await db.accessoryTrainingMaxes.where('exerciseId').equals(7).sortBy('setAt')
    expect(rows).toHaveLength(2)
    expect(rows[1].weight).toBe(80)
    expect(rows[1].incrementLb).toBe(2.5)
  })

  it('falls back to the default increment for an exercise with no history', async () => {
    await applyAccessoryTm(db, 9, 50)
    const rows = await db.accessoryTrainingMaxes.where('exerciseId').equals(9).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].incrementLb).toBe(5)
  })
})
