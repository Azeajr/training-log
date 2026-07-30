import { describe, it, expect } from 'vitest'
import { composeAllSets, composeCrossSets, amrapTargetsFor, type ComposeInput, type CrossBlockPlan } from './workout-compose'
import { calcCrossSets, calcMainSets, est1RMFromTm } from './calc'
import type { Set } from '../types/domain'

const BAR = 45

// A logged set as the store holds it. sessionId/isAmrap are required by the
// domain type but irrelevant to composition, so they get fixed filler.
const logged = (
  type: Set['type'],
  setNumber: number,
  weight: number,
  reps: number,
  liftId?: number,
): Set => ({ sessionId: 1, type, setNumber, weight, reps, isAmrap: false, liftId })

const input = (over: Partial<ComposeInput> = {}): ComposeInput => ({
  tm: 300,
  week: 1,
  template: 'fsl',
  barWeight: BAR,
  deloadSupplemental: 'skip',
  loggedSets: [],
  crossBlocks: [],
  loggedCrossSets: [],
  ...over,
})

describe('composeAllSets', () => {
  it('plans warmup, main, then supplemental in that order', () => {
    const { all, main } = composeAllSets(input())
    const types = [...new Set(all.map(s => s.type))]
    expect(types).toEqual(['warmup', 'main', 'fsl'])
    expect(main).toEqual(calcMainSets(300, 1, BAR))
  })

  it('cascades a logged main source set into the pending supplemental sets', () => {
    // fsl derives from main set 1. Logging it 10lb heavier than planned moves
    // every un-logged fsl set with it.
    const planned = calcMainSets(300, 1, BAR)[0].weight
    const { all } = composeAllSets(input({
      loggedSets: [logged('main', 1, planned + 10, 5)],
    }))
    const fsl = all.filter(s => s.type === 'fsl')
    expect(fsl.length).toBeGreaterThan(0)
    expect(fsl.every(s => s.weight === planned + 10)).toBe(true)
  })

  it('does not cascade when the deload remaps supplemental to another week', () => {
    // week 4 with deloadSupplemental 'normal' computes supplemental at week 1
    // percentages, so it is decoupled from the (much lighter) deload top set.
    const cascaded = composeAllSets(input({
      week: 4,
      deloadSupplemental: 'normal',
      loggedSets: [logged('main', 1, 999, 5)],
    }))
    expect(cascaded.all.filter(s => s.type === 'fsl').every(s => s.weight !== 999)).toBe(true)
  })

  it('drops supplemental entirely when the deload skips it', () => {
    const { all } = composeAllSets(input({ week: 4, deloadSupplemental: 'skip' }))
    expect(all.some(s => s.type === 'fsl')).toBe(false)
  })

  it('restores logged jokers between main and supplemental', () => {
    const { all } = composeAllSets(input({
      loggedSets: [logged('joker', 1, 320, 3), logged('joker', 2, 330, 2)],
    }))
    const jokers = all.filter(s => s.type === 'joker')
    expect(jokers.map(s => s.weight)).toEqual([320, 330])
    expect(jokers.map(s => s.setNumber)).toEqual([1, 2])
    // Position matters: jokers sit after the last main set, before supplemental.
    expect(all.findIndex(s => s.type === 'joker'))
      .toBeGreaterThan(all.map(s => s.type).lastIndexOf('main'))
    expect(all.findIndex(s => s.type === 'joker'))
      .toBeLessThan(all.findIndex(s => s.type === 'fsl'))
  })

  it('restores supplemental sets logged beyond the planned count', () => {
    const planned = composeAllSets(input()).all.filter(s => s.type === 'fsl').length
    const extras = Array.from({ length: planned + 2 }, (_, i) => logged('fsl', i + 1, 200, 5))
    const { all } = composeAllSets(input({ loggedSets: extras }))
    const fsl = all.filter(s => s.type === 'fsl')
    expect(fsl).toHaveLength(planned + 2)
    expect(fsl.map(s => s.setNumber)).toEqual(extras.map((_, i) => i + 1))
  })

  it('adds no supplemental for template "none", even with logged rows', () => {
    const { all } = composeAllSets(input({
      template: 'none',
      loggedSets: [logged('fsl', 1, 200, 5)],
    }))
    expect(all.some(s => s.type === 'fsl')).toBe(false)
  })
})

describe('composeCrossSets', () => {
  const block = (movementLiftId: number, sets: number, weight: number): CrossBlockPlan => ({
    movementLiftId,
    computed: calcCrossSets(
      { movementLiftId, weightMode: 'percent', percent: weight / 100, sets, reps: 5 },
      100, 1, BAR,
    ),
  })

  it('returns the plan untouched when nothing is logged', () => {
    const b = block(7, 3, 200)
    expect(composeCrossSets([b], [])).toEqual(b.computed)
  })

  it("overrides only the remaining sets with the last logged set's weight", () => {
    const b = block(7, 4, 200)
    const out = composeCrossSets([b], [
      logged('cross', 1, 111, 5, 7),
      logged('cross', 2, 222, 5, 7),
    ])
    // Sets 1-2 are done, so they keep the plan's weight (the readout of what was
    // actually lifted comes from the store); 3-4 follow the last logged weight.
    expect(out.slice(0, 2).map(s => s.weight)).toEqual(b.computed.slice(0, 2).map(s => s.weight))
    expect(out.slice(2).every(s => s.weight === 222)).toBe(true)
  })

  it('appends extra sets logged beyond the plan', () => {
    const b = block(7, 2, 200)
    const out = composeCrossSets([b], [
      logged('cross', 1, 100, 5, 7),
      logged('cross', 2, 100, 5, 7),
      logged('cross', 3, 105, 3, 7),
    ])
    expect(out).toHaveLength(3)
    expect(out[2]).toMatchObject({ setNumber: 3, weight: 105, reps: 3, type: 'cross', liftId: 7 })
  })

  it('keeps blocks independent — a log against one never moves the other', () => {
    const a = block(7, 2, 200)
    const b = block(9, 2, 300)
    const out = composeCrossSets([a, b], [logged('cross', 1, 999, 5, 7)])
    expect(out.filter(s => s.liftId === 9).map(s => s.weight))
      .toEqual(b.computed.map(s => s.weight))
  })

  it('flattens every block in order', () => {
    const out = composeCrossSets([block(7, 2, 200), block(9, 3, 300)], [])
    expect(out.map(s => s.liftId)).toEqual([7, 7, 9, 9, 9])
  })
})

describe('amrapTargetsFor', () => {
  it('prefers a target derived from matching AMRAP history', () => {
    const out = amrapTargetsFor(255, [{ weight: 255, reps: 8 }, { weight: 255, reps: 9 }], 300)
    expect(out).toHaveLength(1)
    expect(out[0].reps).toBeGreaterThan(0)
  })

  it('falls back to the TM-implied e1RM goal when there is no history', () => {
    const out = amrapTargetsFor(255, [], 300)
    expect(out).toHaveLength(1)
    expect(out[0].label).toBe('goal')
    expect(out[0].est1RM).toBe(Math.round(est1RMFromTm(300)))
  })

  it('returns nothing when the TM is unset', () => {
    expect(amrapTargetsFor(255, [], 0)).toEqual([])
  })

  it('returns nothing when the weight is too light to imply a rep target', () => {
    // Below the Wathan curve's asymptote the inverse has no solution — there is
    // no finite rep count that would make 50lb estimate a 333lb 1RM.
    expect(amrapTargetsFor(50, [], 300)).toEqual([])
  })

  it('targets a single rep once the weight reaches the estimated 1RM', () => {
    expect(amrapTargetsFor(10_000, [], 300)).toEqual([
      { label: 'goal', reps: 1, est1RM: Math.round(est1RMFromTm(300)) },
    ])
  })
})
