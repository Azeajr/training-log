import { describe, it, expect } from 'vitest'
import {
  roundToNearest5,
  calcMainSets,
  calcFslSets,
  calcAccessorySets,
  calcWarmup,
  estimated1RM,
  targetReps,
  calcAmrapTargets,
  toSeconds,
  fromSeconds,
  formatDuration,
  canAdvanceWeek,
  calcPlatesPerSide,
  calcNextJokerWeight,
  calcJokerSet,
  calcJokerIncrement,
  shouldShowJokerButton,
} from './calc'
import { DEFAULT_PLATES } from '../store/settings-store'

describe('roundToNearest5', () => {
  it('rounds down at 162', () => expect(roundToNearest5(162)).toBe(160))
  it('rounds up at 163', () => expect(roundToNearest5(163)).toBe(165))
  it('leaves exact multiples unchanged', () => expect(roundToNearest5(175)).toBe(175))
})

describe('calcMainSets', () => {
  it('week 1: 5s at correct percentages', () => {
    const sets = calcMainSets(200, 1)
    expect(sets).toHaveLength(3)
    expect(sets[0]).toMatchObject({ weight: 130, reps: 5, isAmrap: false, type: 'main' })
    expect(sets[1]).toMatchObject({ weight: 150, reps: 5, isAmrap: false })
    expect(sets[2]).toMatchObject({ weight: 170, reps: 5, isAmrap: true })
  })
  it('week 2: 3s at correct percentages', () => {
    const sets = calcMainSets(200, 2)
    expect(sets[0]).toMatchObject({ weight: 140, reps: 3 })
    expect(sets[1]).toMatchObject({ weight: 160, reps: 3 })
    expect(sets[2]).toMatchObject({ weight: 180, reps: 3, isAmrap: true })
  })
  it('week 3: 5/3/1 at correct percentages', () => {
    const sets = calcMainSets(200, 3)
    expect(sets[0]).toMatchObject({ weight: 150, reps: 5 })
    expect(sets[1]).toMatchObject({ weight: 170, reps: 3 })
    expect(sets[2]).toMatchObject({ weight: 190, reps: 1, isAmrap: true })
  })
  it('week 4: deload, no AMRAP', () => {
    const sets = calcMainSets(200, 4)
    expect(sets[0]).toMatchObject({ weight: 80, reps: 5, isAmrap: false })
    expect(sets[2]).toMatchObject({ isAmrap: false })
  })
})

describe('calcFslSets', () => {
  it('returns 5 sets at the given first-set weight x 10 reps', () => {
    const sets = calcFslSets(130)
    expect(sets).toHaveLength(5)
    sets.forEach(s => {
      expect(s.weight).toBe(130)
      expect(s.reps).toBe(10)
      expect(s.type).toBe('fsl')
    })
  })

  it.each([1, 2, 3, 4] as const)('week %i: FSL weight matches first main set weight', (week) => {
    const main = calcMainSets(200, week)
    const fsl = calcFslSets(main[0].weight)
    fsl.forEach(s => expect(s.weight).toBe(main[0].weight))
  })
})

describe('calcAccessorySets', () => {
  it('returns 5 sets at 75% TM x 10 reps', () => {
    const sets = calcAccessorySets(100)
    expect(sets).toHaveLength(5)
    sets.forEach(s => {
      expect(s.weight).toBe(75)
      expect(s.reps).toBe(10)
    })
  })
})

describe('calcWarmup', () => {
  it('heavy WW opens at 135', () => {
    // targetOpener = e1RM(300,5)*0.45 = 350*0.45 = 157.5 → 135 ✓
    const sets = calcWarmup(400, 300, 5)
    expect(sets[0]).toMatchObject({ weight: 135, reps: 10, type: 'warmup' })
    expect(sets.length).toBeGreaterThan(1)
    const last = sets[sets.length - 1]
    expect(last.reps).toBe(3)
    expect(last.weight).toBeLessThan(300)
  })
  it('moderate WW opens at 95', () => {
    // targetOpener = e1RM(200,5)*0.45 = 233.3*0.45 = 105 → 95 ✓ (135 > 105)
    const sets = calcWarmup(300, 200, 5)
    expect(sets[0]).toMatchObject({ weight: 95, reps: 10, type: 'warmup' })
    expect(sets.length).toBeGreaterThan(1)
    const last = sets[sets.length - 1]
    expect(last.reps).toBe(3)
    expect(last.weight).toBeLessThan(200)
  })
  it('WW just below 95 threshold opens at 65', () => {
    // targetOpener = e1RM(180,5)*0.45 = 210*0.45 = 94.5 → 95 > 94.5 ✗, 65 ✓
    const sets = calcWarmup(250, 180, 5)
    expect(sets[0]).toMatchObject({ weight: 65, reps: 10 })
  })
  it('light WW opens at 45', () => {
    // targetOpener = e1RM(90,5)*0.45 = 105*0.45 = 47.25 → 65 > 47.25 ✗, 45 ✓
    const sets = calcWarmup(150, 90, 5)
    expect(sets[0]).toMatchObject({ weight: 45, reps: 10 })
  })
  it('WW too light returns empty', () => {
    // targetOpener = e1RM(65,5)*0.45 = 75.8*0.45 = 34.1 → 45 > 34.1 ✗ — no opener
    const sets = calcWarmup(100, 65, 5)
    expect(sets).toHaveLength(0)
  })
  it('opener-only when single step covers gap', () => {
    // WW=90, TM=300 → increment=30; effectiveBase=75 < 90 → one intermediate at 75×3
    const sets = calcWarmup(300, 90, 5)
    expect(sets).toHaveLength(2)
    expect(sets[0]).toMatchObject({ weight: 45, reps: 10 })
    expect(sets[1]).toMatchObject({ reps: 3 })
  })
  it('week-3 (1-rep) uses stricter threshold — opener lighter relative to WW', () => {
    // WW=270 week-3: targetOpener = e1RM(270,1)*0.45 = 270*0.45 = 121.5 → 95 ✓
    // same WW week-1 (5r): targetOpener = e1RM(270,5)*0.45 = 315*0.45 = 141.75 → 135 ✓
    expect(calcWarmup(400, 270, 1)[0].weight).toBe(95)
    expect(calcWarmup(400, 270, 5)[0].weight).toBe(135)
  })
})

describe('estimated1RM', () => {
  it('160lb x 17 reps = 250.67', () => {
    expect(estimated1RM(160, 17)).toBeCloseTo(250.67, 1)
  })
  it('1 rep returns exact weight lifted', () => {
    expect(estimated1RM(225, 1)).toBe(225)
  })
})

describe('targetReps', () => {
  it('250.67 target at 170lb rounds up to 15', () => {
    expect(targetReps(250.67, 170)).toBe(15)
  })
})

describe('calcAmrapTargets', () => {
  it('returns labeled targets with est1RM', () => {
    const targets = calcAmrapTargets(
      [{ weight: 160, reps: 17, label: 'Last session' }],
      170
    )
    expect(targets).toHaveLength(1)
    expect(targets[0].label).toBe('Last session')
    expect(targets[0].reps).toBe(15)
    expect(targets[0].est1RM).toBeCloseTo(250.67, 1)
  })
})

describe('toSeconds', () => {
  it('2:30 -> 150', () => expect(toSeconds(2, 30)).toBe(150))
})

describe('fromSeconds', () => {
  it('150 -> { mm: 2, ss: 30 }', () => expect(fromSeconds(150)).toEqual({ mm: 2, ss: 30 }))
})

describe('formatDuration', () => {
  it('150 -> "2:30"', () => expect(formatDuration(150)).toBe('2:30'))
  it('pads seconds', () => expect(formatDuration(65)).toBe('1:05'))
})

describe('canAdvanceWeek', () => {
  it('true at 4', () => expect(canAdvanceWeek(4)).toBe(true))
  it('false at 3', () => expect(canAdvanceWeek(3)).toBe(false))
})

describe('calcJokerIncrement', () => {
  it('returns 5% when amrap reps equal double the goal', () => {
    expect(calcJokerIncrement(10, 5)).toBe(0.05)  // 10 === 2*5, not strictly greater
  })
  it('returns 5% when amrap reps are below double the goal', () => {
    expect(calcJokerIncrement(6, 5)).toBe(0.05)   // week 1: hit 6, goal 5
    expect(calcJokerIncrement(6, 3)).toBe(0.05)   // week 2: hit 6 === 2*3
    expect(calcJokerIncrement(2, 1)).toBe(0.05)   // week 3: hit 2 === 2*1
  })
  it('returns 10% when amrap reps surpass double the goal', () => {
    expect(calcJokerIncrement(11, 5)).toBe(0.10)  // week 1: hit 11 > 10
    expect(calcJokerIncrement(7, 3)).toBe(0.10)   // week 2: hit 7 > 6
    expect(calcJokerIncrement(3, 1)).toBe(0.10)   // week 3: hit 3 > 2
  })
})

describe('calcNextJokerWeight', () => {
  it('adds 5% and rounds to nearest 5', () => {
    expect(calcNextJokerWeight(170, 0.05)).toBe(180)  // 170 * 1.05 = 178.5 → 180
  })
  it('adds 10% and rounds to nearest 5', () => {
    expect(calcNextJokerWeight(170, 0.10)).toBe(185)  // 170 * 1.10 = 187 → 185
  })
  it('170lb chains correctly at 5%', () => {
    const j1 = calcNextJokerWeight(170, 0.05)   // 180
    const j2 = calcNextJokerWeight(j1, 0.05)    // 180 * 1.05 = 189 → 190
    expect(j1).toBe(180)
    expect(j2).toBe(190)
  })
})

describe('calcJokerSet', () => {
  it('produces a correctly shaped JokerSet at 5%', () => {
    const s = calcJokerSet(170, 1, 5, 0.05)
    expect(s).toEqual({ type: 'joker', setNumber: 1, weight: 180, reps: 5, isAmrap: false })
  })
  it('produces a correctly shaped JokerSet at 10%', () => {
    const s = calcJokerSet(170, 1, 5, 0.10)
    expect(s).toEqual({ type: 'joker', setNumber: 1, weight: 185, reps: 5, isAmrap: false })
  })
  it('setNumber is preserved', () => {
    expect(calcJokerSet(170, 3, 3, 0.05).setNumber).toBe(3)
  })
})

describe('shouldShowJokerButton', () => {
  // layout: 1 warmup, 3 main sets (last is AMRAP), 0+ jokers
  const base = { warmupCount: 1, mainCount: 3 }

  const logged = (reps: number, type = 'main') => ({ reps, type })

  it('false when AMRAP not yet logged', () => {
    expect(shouldShowJokerButton({ week: 1, loggedSets: [], jokerCount: 0, ...base })).toBe(false)
  })

  it('false on deload week (week 4) regardless of reps', () => {
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(5)]
    expect(shouldShowJokerButton({ week: 4, loggedSets: sets, jokerCount: 0, ...base })).toBe(false)
  })

  it('true when AMRAP logged at minimum reps — week 1 (≥5)', () => {
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(5)]
    expect(shouldShowJokerButton({ week: 1, loggedSets: sets, jokerCount: 0, ...base })).toBe(true)
  })

  it('true when AMRAP logged above minimum — week 1', () => {
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(8)]
    expect(shouldShowJokerButton({ week: 1, loggedSets: sets, jokerCount: 0, ...base })).toBe(true)
  })

  it('false when AMRAP logged below minimum — week 1 (4 < 5)', () => {
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(4)]
    expect(shouldShowJokerButton({ week: 1, loggedSets: sets, jokerCount: 0, ...base })).toBe(false)
  })

  it('true when AMRAP logged at minimum — week 2 (≥3)', () => {
    const sets = [logged(10, 'warmup'), logged(3), logged(3), logged(3)]
    expect(shouldShowJokerButton({ week: 2, loggedSets: sets, jokerCount: 0, ...base })).toBe(true)
  })

  it('false when AMRAP below minimum — week 2 (2 < 3)', () => {
    const sets = [logged(10, 'warmup'), logged(3), logged(3), logged(2)]
    expect(shouldShowJokerButton({ week: 2, loggedSets: sets, jokerCount: 0, ...base })).toBe(false)
  })

  it('true when AMRAP logged at minimum — week 3 (≥1)', () => {
    const sets = [logged(10, 'warmup'), logged(5), logged(3), logged(1)]
    expect(shouldShowJokerButton({ week: 3, loggedSets: sets, jokerCount: 0, ...base })).toBe(true)
  })

  it('false while joker set is pending (added but not logged)', () => {
    // jokerCount=1 means a joker was added; loggedSets has only warmup+main
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(5)]
    expect(shouldShowJokerButton({ week: 1, loggedSets: sets, jokerCount: 1, ...base })).toBe(false)
  })

  it('true after joker logged with sufficient reps', () => {
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(5), logged(5, 'joker')]
    expect(shouldShowJokerButton({ week: 1, loggedSets: sets, jokerCount: 1, ...base })).toBe(true)
  })

  it('false after joker logged below minimum — bug fix: checks joker reps not AMRAP reps', () => {
    // AMRAP had 8 reps (well above min), but joker had 4 reps (below week 1 min of 5)
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(8), logged(4, 'joker')]
    expect(shouldShowJokerButton({ week: 1, loggedSets: sets, jokerCount: 1, ...base })).toBe(false)
  })

  it('cascades correctly: second joker pending hides button', () => {
    // two jokers added, only first logged
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(5), logged(5, 'joker')]
    expect(shouldShowJokerButton({ week: 1, loggedSets: sets, jokerCount: 2, ...base })).toBe(false)
  })

  it('false once any FSL set has been logged (prevents index corruption)', () => {
    // warmup(1) + main(3) + jokers(0) = 4; loggedSets has 5 entries → FSL started
    const sets = [logged(10, 'warmup'), logged(5), logged(5), logged(5), logged(10, 'fsl')]
    expect(shouldShowJokerButton({ week: 1, loggedSets: sets, jokerCount: 0, ...base })).toBe(false)
  })
})

describe('calcPlatesPerSide', () => {
  const BAR = 45

  it('returns [] when target equals bar weight', () => {
    expect(calcPlatesPerSide(45, BAR, DEFAULT_PLATES)).toEqual([])
  })

  it('returns null when target is below bar weight', () => {
    expect(calcPlatesPerSide(35, BAR, DEFAULT_PLATES)).toBeNull()
  })

  it('185lb → 1×45 + 1×25 per side (70 per side)', () => {
    expect(calcPlatesPerSide(185, BAR, DEFAULT_PLATES)).toEqual([
      { weight: 45, count: 1 },
      { weight: 25, count: 1 },
    ])
  })

  it('275lb → 2×45 + 1×25 per side (115 per side)', () => {
    expect(calcPlatesPerSide(275, BAR, DEFAULT_PLATES)).toEqual([
      { weight: 45, count: 2 },
      { weight: 25, count: 1 },
    ])
  })

  it('135lb → 1×45 per side', () => {
    expect(calcPlatesPerSide(135, BAR, DEFAULT_PLATES)).toEqual([
      { weight: 45, count: 1 },
    ])
  })

  it('handles fractional plates — 190lb → 45 + 25 + 2.5 per side (72.5 per side)', () => {
    expect(calcPlatesPerSide(190, BAR, DEFAULT_PLATES)).toEqual([
      { weight: 45, count: 1 },
      { weight: 25, count: 1 },
      { weight: 2.5, count: 1 },
    ])
  })

  it('returns null when weight cannot be made with available plates', () => {
    const limitedPlates = [{ weight: 45, count: 4 }]
    expect(calcPlatesPerSide(160, BAR, limitedPlates)).toBeNull()
  })

  it('respects count limit — falls through to smaller plates', () => {
    // only 1 pair of 45s available; 235lb needs 95/side = 45+25+25
    const plates = [
      { weight: 45, count: 2 },
      { weight: 25, count: 4 },
    ]
    expect(calcPlatesPerSide(235, BAR, plates)).toEqual([
      { weight: 45, count: 1 },
      { weight: 25, count: 2 },
    ])
  })

  it('ignores plates with count < 2', () => {
    const plates = [
      { weight: 45, count: 1 },
      { weight: 25, count: 4 },
    ]
    expect(calcPlatesPerSide(95, BAR, plates)).toEqual([
      { weight: 25, count: 1 },
    ])
  })
})
