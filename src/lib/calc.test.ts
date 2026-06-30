import { describe, it, expect } from 'vitest'
import {
  roundToNearest5,
  calcMainSets,
  calcFslSets,
  calcSslSets,
  calcBbbSets,
  calcFslBbbSets,
  calcSslBbbSets,
  calcBbsSets,
  calcAccessorySets,
  calcWarmup,
  estimated1RM,
  targetReps,
  calcAmrapTarget,
  median,
  seedE1Rm,
  toSeconds,
  fromSeconds,
  formatDuration,
  canAdvanceWeek,
  calcPlatesPerSide,
  calcPlates,
  calcNextJokerWeight,
  calcJokerSet,
  calcJokerIncrement,
  shouldShowJokerButton,
  jokerChainBaseWeight,
  supplementalSourceSetNumber,
  applySupplementalOverride,
  restStatus,
  REST_NORMAL_THRESHOLD,
  REST_TRANSITION_THRESHOLD,
  REST_FAIL_NUDGE,
  REST_FAIL_MAX,
  calcSupplementalSets,
  getSupplementalLabel,
  isSupplementalType,
  applyMainCascadeToSupplemental,
  est1RMFromTm,
  TM_PCT_OF_1RM,
  calcCrossSets,
  getCrossLabel,
  effectiveSupplementalWeek,
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
  it('returns 5 sets at the given first-set weight x 5 reps', () => {
    const sets = calcFslSets(130)
    expect(sets).toHaveLength(5)
    sets.forEach(s => {
      expect(s.weight).toBe(130)
      expect(s.reps).toBe(5)
      expect(s.type).toBe('fsl')
    })
  })

  it('numbers sets 1..5 in order (kills the buildFixedSets i+1 → i-1 mutant)', () => {
    expect(calcFslSets(130).map(s => s.setNumber)).toEqual([1, 2, 3, 4, 5])
  })

  it.each([1, 2, 3, 4] as const)('week %i: FSL weight matches first main set weight', (week) => {
    const main = calcMainSets(200, week)
    const fsl = calcFslSets(main[0].weight)
    fsl.forEach(s => expect(s.weight).toBe(main[0].weight))
  })
})

describe('calcSslSets', () => {
  it('returns 5 sets at second set weight x 5 reps', () => {
    const sets = calcSslSets(200)
    expect(sets).toHaveLength(5)
    sets.forEach(s => {
      expect(s.weight).toBe(200)
      expect(s.reps).toBe(5)
      expect(s.type).toBe('ssl')
    })
  })

  it('weight matches second main set weight', () => {
    const main = calcMainSets(200, 1)
    const ssl = calcSslSets(main[1].weight)
    ssl.forEach(s => expect(s.weight).toBe(main[1].weight))
  })
})

describe('calcBbbSets', () => {
  it('returns 5 sets x 10 reps at 50% TM', () => {
    const sets = calcBbbSets(300)
    expect(sets).toHaveLength(5)
    sets.forEach(s => {
      expect(s.weight).toBe(150)
      expect(s.reps).toBe(10)
      expect(s.type).toBe('bbb')
    })
  })

  it('rounds weight to nearest 5', () => {
    const sets = calcBbbSets(303)
    sets.forEach(s => expect(s.weight % 5).toBe(0))
  })

  it('floors to bar weight (45) for very low TMs', () => {
    const sets = calcBbbSets(50)
    sets.forEach(s => expect(s.weight).toBeGreaterThanOrEqual(45))
  })
})

describe('calcFslBbbSets', () => {
  it('returns 5 sets x 10 reps at first set weight', () => {
    const sets = calcFslBbbSets(170)
    expect(sets).toHaveLength(5)
    sets.forEach(s => {
      expect(s.weight).toBe(170)
      expect(s.reps).toBe(10)
      expect(s.type).toBe('fsl+bbb')
    })
  })

  it('weight matches first main set weight', () => {
    const main = calcMainSets(200, 1)
    const sets = calcFslBbbSets(main[0].weight)
    sets.forEach(s => expect(s.weight).toBe(main[0].weight))
  })
})

describe('calcSslBbbSets', () => {
  it('returns 5 sets x 10 reps at second set weight', () => {
    const sets = calcSslBbbSets(185)
    expect(sets).toHaveLength(5)
    sets.forEach(s => {
      expect(s.weight).toBe(185)
      expect(s.reps).toBe(10)
      expect(s.type).toBe('ssl+bbb')
    })
  })

  it('weight matches second main set weight', () => {
    const main = calcMainSets(200, 1)
    const sets = calcSslBbbSets(main[1].weight)
    sets.forEach(s => expect(s.weight).toBe(main[1].weight))
  })
})

describe('calcBbsSets', () => {
  it('week 1: 10 sets x 5 reps at 60% TM', () => {
    const sets = calcBbsSets(300, 1)
    expect(sets).toHaveLength(10)
    sets.forEach(s => {
      expect(s.weight).toBe(180)
      expect(s.reps).toBe(5)
      expect(s.type).toBe('bbs')
    })
  })

  it('week 2: 70% TM', () => {
    const sets = calcBbsSets(300, 2)
    expect(sets).toHaveLength(10)
    sets.forEach(s => expect(s.weight).toBe(210))
  })

  it('week 3: 80% TM', () => {
    const sets = calcBbsSets(300, 3)
    expect(sets).toHaveLength(10)
    sets.forEach(s => expect(s.weight).toBe(240))
  })

  it('week 4 (deload): returns empty array', () => {
    expect(calcBbsSets(300, 4)).toHaveLength(0)
  })

  it('rounds weight to nearest 5', () => {
    const sets = calcBbsSets(303, 1)
    sets.forEach(s => expect(s.weight % 5).toBe(0))
  })
})

describe('calcAccessorySets', () => {
  it('returns 3 sets at 75% TM x 10 reps', () => {
    const sets = calcAccessorySets(100)
    expect(sets).toHaveLength(3)
    sets.forEach(s => {
      expect(s.weight).toBe(75)
      expect(s.reps).toBe(10)
    })
  })

  it('numbers sets 1..3 in order (kills the i+1 → i-1 setNumber mutant)', () => {
    expect(calcAccessorySets(100).map(s => s.setNumber)).toEqual([1, 2, 3])
  })
})

describe('calcWarmup', () => {
  it('standard case — 3 sets at 40/50/60% TM', () => {
    // TM=300: 120×5, 150×5, 180×3; WW=210 so all three qualify
    const sets = calcWarmup(300, 210)
    expect(sets).toHaveLength(3)
    expect(sets[0]).toMatchObject({ weight: 120, reps: 5, type: 'warmup' })
    expect(sets[1]).toMatchObject({ weight: 150, reps: 5 })
    expect(sets[2]).toMatchObject({ weight: 180, reps: 3 })
  })
  it('drops sets at or above working weight', () => {
    // TM=200: 80×5, 100×5, 120×3; WW=115 → 120 ≥ 115, cut to 2 sets
    const sets = calcWarmup(200, 115)
    expect(sets).toHaveLength(2)
    expect(sets[0]).toMatchObject({ weight: 80, reps: 5 })
    expect(sets[1]).toMatchObject({ weight: 100, reps: 5 })
  })
  it('floors weight at 45lb (bar)', () => {
    // TM=95: 40%=38 → 45, 50%=47.5 → 45 (dedup), 60%=57→55; WW=70
    const sets = calcWarmup(95, 70)
    expect(sets[0]).toMatchObject({ weight: 45, reps: 5 })
    // dedup: second set also rounds to 45 → skipped
    expect(sets.every(s => s.weight >= 45)).toBe(true)
  })
  it('returns empty when all warmup weights meet or exceed WW', () => {
    // TM=200: 80×5, WW=75 → 80 ≥ 75, nothing qualifies
    const sets = calcWarmup(200, 75)
    expect(sets).toHaveLength(0)
  })
  it('drops a warmup that rounds to exactly the working weight (kills the >= → > break mutant)', () => {
    // TM=300 → 40/50/60% = 120/150/180. WW=180 equals the 60% warmup exactly:
    // `weight >= workingWeight` must break ON equality. A `>` mutant would emit a
    // 180lb "warmup" identical to the work set.
    const sets = calcWarmup(300, 180)
    expect(sets.map(s => s.weight)).toEqual([120, 150])
  })
  it('deduplicates consecutive identical weights', () => {
    // TM=75: 40%=30→45, 50%=37.5→40→45 (dedup), 60%=45 (dedup); WW=200
    const sets = calcWarmup(75, 200)
    const weights = sets.map(s => s.weight)
    expect(new Set(weights).size).toBe(weights.length)
  })
  it('setNumber increments correctly after dedup', () => {
    const sets = calcWarmup(300, 210)
    sets.forEach((s, i) => expect(s.setNumber).toBe(i + 1))
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
  it('returns 1 when today weight exceeds the target e1RM — never a negative target', () => {
    // 200×5 prior → e1RM 233.33; AMRAP weight bumped to 245 → raw back-calc is ceil(-1.43) = -1
    expect(targetReps(233.33, 245)).toBe(1)
  })
  it('returns 1 when today weight equals the target e1RM — never a 0-rep target', () => {
    expect(targetReps(200, 200)).toBe(1)
  })
  it('returns 1 for a non-positive today weight instead of Infinity', () => {
    expect(targetReps(200, 0)).toBe(1)
  })
  it('returns 2 when 1 rep would score below the target — estimated1RM reps===1 short-circuit', () => {
    // raw back-calc gives ceil(0.64) = 1, but estimated1RM(235, 1) = 235 < 240:
    // a 1-rep "target" can never reach the displayed est. 1RM
    expect(targetReps(240, 235)).toBe(2)
  })
})

describe('median', () => {
  it('empty -> 0', () => expect(median([])).toBe(0))
  it('odd count picks middle', () => expect(median([3, 1, 2])).toBe(2))
  it('even count averages middle two', () => expect(median([1, 2, 3, 4])).toBe(2.5))
})

describe('seedE1Rm', () => {
  it('empty -> 0', () => expect(seedE1Rm([])).toBe(0))

  it('is the median e1RM over the window, ignoring a single inflated set', () => {
    // most-recent-first. A lone high-rep crater/spike in the middle can't drag
    // the seed: 100×10 (133.3), 95×10 (126.7), 60×20 (100.0) -> median 126.7.
    const est = seedE1Rm([
      { weight: 100, reps: 10 },
      { weight: 95, reps: 10 },
      { weight: 60, reps: 20 },
    ])
    expect(est).toBeCloseTo(126.67, 1)
  })

  it('only considers the most recent `window` sets', () => {
    // 4th (oldest) set is ignored; median of the first three is taken.
    const est = seedE1Rm([
      { weight: 100, reps: 5 },
      { weight: 110, reps: 5 },
      { weight: 120, reps: 5 },
      { weight: 999, reps: 5 },
    ])
    expect(est).toBeCloseTo(estimated1RM(110, 5), 5)
  })
})

describe('calcAmrapTarget', () => {
  it('null when there is no history', () => {
    expect(calcAmrapTarget([], 170)).toBeNull()
  })

  it('seeds reps from the median e1RM of recent AMRAPs', () => {
    // e1RMs: 250.67 (160×17), 232.5 (155×15), 220.0 (150×14) -> median 232.5.
    // The high outlier (250.67) does not drive the seed.
    const target = calcAmrapTarget(
      [
        { weight: 160, reps: 17 },
        { weight: 155, reps: 15 },
        { weight: 150, reps: 14 },
      ],
      170,
    )!
    expect(target.label).toBe('target')
    expect(target.est1RM).toBeCloseTo(232.5, 1)
    expect(target.reps).toBe(targetReps(target.est1RM, 170))
  })

  it('clamps the rep target to 1 when today weight is above the seed e1RM', () => {
    // 200×5 -> e1RM 233.33; today's AMRAP overridden to 245 -> raw back-calc negative
    const target = calcAmrapTarget([{ weight: 200, reps: 5 }], 245)!
    expect(target.reps).toBe(1)
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

describe('jokerChainBaseWeight', () => {
  const logged = (type: string, weight: number) => ({ type, weight })

  it('falls back to the planned AMRAP weight when nothing is logged', () => {
    expect(jokerChainBaseWeight([], 170)).toBe(170)
  })

  it('falls back to the planned AMRAP weight when only warmups are logged', () => {
    expect(jokerChainBaseWeight([logged('warmup', 80), logged('warmup', 100)], 170)).toBe(170)
  })

  it('uses the logged AMRAP weight, not the plan — overridden AMRAP regression', () => {
    // Planned AMRAP 170, user lifted 175 → the joker chain must start at 175
    const sets = [logged('warmup', 80), logged('main', 130), logged('main', 150), logged('main', 175)]
    expect(jokerChainBaseWeight(sets, 170)).toBe(175)
  })

  it('uses the last logged joker weight once jokers are logged', () => {
    const sets = [logged('main', 175), logged('joker', 185), logged('joker', 195)]
    expect(jokerChainBaseWeight(sets, 170)).toBe(195)
  })

  it('chains off the logged joker weight even when the user overrode it', () => {
    // Joker prescribed 185 but logged at 190 → next joker starts at 190
    const sets = [logged('main', 170), logged('joker', 190)]
    expect(jokerChainBaseWeight(sets, 170)).toBe(190)
  })

  it('ignores supplemental sets logged after the mains', () => {
    const sets = [logged('main', 175), logged('fsl', 130)]
    expect(jokerChainBaseWeight(sets, 170)).toBe(175)
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

  it('falls back to 1 rep minimum when week value is not in JOKER_MIN_REPS', () => {
    // week 0 is not in JOKER_MIN_REPS {1,2,3}; ?? 1 fallback applies → min 1 rep
    const sets = [logged(1)]
    expect(shouldShowJokerButton({ week: 0 as unknown as 1, loggedSets: sets, jokerCount: 0, warmupCount: 0, mainCount: 1 })).toBe(true)
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

  it('does not mutate the caller plate list (sorts a copy)', () => {
    const plates = [
      { weight: 25, count: 4 },
      { weight: 45, count: 4 },
      { weight: 10, count: 4 },
    ]
    const snapshot = plates.map(p => ({ ...p }))
    calcPlatesPerSide(185, BAR, plates)
    expect(plates).toEqual(snapshot) // order + contents unchanged
  })

  it('selects largest plates first even when the plate list is unsorted (kills the b-a sort mutant)', () => {
    // Plates given ASCENDING. Greedy-from-smallest over-consumes the small plates
    // (capped at 3 pairs each) and strands 2.5lb → null; largest-first makes 50/side
    // cleanly as 45 + 5. Any non-descending order fails this exact breakdown.
    const ascending = [
      { weight: 2.5, count: 6 },
      { weight: 5, count: 6 },
      { weight: 25, count: 6 },
      { weight: 45, count: 6 },
    ]
    expect(calcPlatesPerSide(145, BAR, ascending)).toEqual([
      { weight: 45, count: 1 },
      { weight: 5, count: 1 },
    ])
  })
})

describe('calcPlates — total mode (single stack)', () => {
  it('subtracts base then loads singles, no pairing — 90 over base 0 → 2×45', () => {
    expect(calcPlates(90, 0, 'total', DEFAULT_PLATES)).toEqual([{ weight: 45, count: 2 }])
  })

  it('allows a lone plate (paired could not) — 25 over base 0 → 1×25', () => {
    expect(calcPlates(25, 0, 'total', DEFAULT_PLATES)).toEqual([{ weight: 25, count: 1 }])
  })

  it('honours a non-zero base (machine carriage) — 100 over base 10 → 2×45', () => {
    expect(calcPlates(100, 10, 'total', DEFAULT_PLATES)).toEqual([{ weight: 45, count: 2 }])
  })

  it('returns [] when target equals base (no added plates)', () => {
    expect(calcPlates(0, 0, 'total', DEFAULT_PLATES)).toEqual([])
  })

  it('returns null below base', () => {
    expect(calcPlates(5, 10, 'total', DEFAULT_PLATES)).toBeNull()
  })

  it('paired mode equals calcPlatesPerSide', () => {
    expect(calcPlates(185, 45, 'paired', DEFAULT_PLATES)).toEqual(calcPlatesPerSide(185, 45, DEFAULT_PLATES))
  })
})

describe('applySupplementalOverride', () => {
  const computed = [
    { type: 'fsl+bbb', setNumber: 1, weight: 130, reps: 10 },
    { type: 'fsl+bbb', setNumber: 2, weight: 130, reps: 10 },
    { type: 'fsl+bbb', setNumber: 3, weight: 130, reps: 10 },
  ]

  it('returns computed unchanged when template is none', () => {
    expect(applySupplementalOverride(computed, [], 'none')).toEqual(computed)
  })

  it('returns computed unchanged when no matching logged sets', () => {
    const logged = [{ type: 'main', weight: 200 }]
    expect(applySupplementalOverride(computed, logged, 'fsl+bbb')).toEqual(computed)
  })

  it('overrides unlogged tail with last logged weight (fsl+bbb)', () => {
    const logged = [
      { type: 'fsl+bbb', weight: 125 },
    ]
    const out = applySupplementalOverride(computed, logged, 'fsl+bbb')
    expect(out[0].weight).toBe(130) // already logged, leave computed in place
    expect(out[1].weight).toBe(125) // overridden
    expect(out[2].weight).toBe(125)
  })

  it('uses last logged weight when multiple logs differ', () => {
    const logged = [
      { type: 'fsl', weight: 125 },
      { type: 'fsl', weight: 120 },
    ]
    const fsl = [
      { type: 'fsl', setNumber: 1, weight: 130, reps: 5 },
      { type: 'fsl', setNumber: 2, weight: 130, reps: 5 },
      { type: 'fsl', setNumber: 3, weight: 130, reps: 5 },
    ]
    const out = applySupplementalOverride(fsl, logged, 'fsl')
    expect(out[0].weight).toBe(130)
    expect(out[1].weight).toBe(130)
    expect(out[2].weight).toBe(120)
  })

  it('filters logged sets by template, not by literal "fsl"', () => {
    const logged = [{ type: 'bbb', weight: 100 }]
    const bbb = [
      { type: 'bbb', setNumber: 1, weight: 90, reps: 10 },
      { type: 'bbb', setNumber: 2, weight: 90, reps: 10 },
    ]
    const out = applySupplementalOverride(bbb, logged, 'bbb')
    expect(out[1].weight).toBe(100)
  })
})

describe('restStatus', () => {
  describe('normal rest', () => {
    it('idle before threshold', () => {
      expect(restStatus(0,                            'normal')).toEqual({ phase: 'idle',  message: '' })
      expect(restStatus(REST_NORMAL_THRESHOLD - 1,    'normal')).toEqual({ phase: 'idle',  message: '' })
    })
    it('nudge at and after threshold', () => {
      expect(restStatus(REST_NORMAL_THRESHOLD,        'normal')).toEqual({ phase: 'nudge', message: 'TIME FOR YOUR NEXT SET' })
      expect(restStatus(REST_NORMAL_THRESHOLD + 30,   'normal')).toEqual({ phase: 'nudge', message: 'TIME FOR YOUR NEXT SET' })
    })
  })

  describe('transition rest', () => {
    it('idle before threshold', () => {
      expect(restStatus(0,                              'transition')).toEqual({ phase: 'idle',  message: '' })
      expect(restStatus(REST_TRANSITION_THRESHOLD - 1,  'transition')).toEqual({ phase: 'idle',  message: '' })
    })
    it('nudge at and after threshold', () => {
      expect(restStatus(REST_TRANSITION_THRESHOLD,      'transition')).toEqual({ phase: 'nudge', message: 'TIME FOR YOUR NEXT SET' })
      expect(restStatus(REST_NORMAL_THRESHOLD,          'transition')).toEqual({ phase: 'nudge', message: 'TIME FOR YOUR NEXT SET' })
    })
  })

  describe('fail rest', () => {
    it('idle before nudge threshold', () => {
      expect(restStatus(0,                  'fail')).toEqual({ phase: 'idle',     message: '' })
      expect(restStatus(REST_FAIL_NUDGE - 1, 'fail')).toEqual({ phase: 'idle',    message: '' })
    })
    it('warning between nudge and max thresholds', () => {
      expect(restStatus(REST_FAIL_NUDGE,    'fail')).toEqual({ phase: 'warning', message: 'TIME FOR YOUR NEXT SET' })
      expect(restStatus(REST_FAIL_MAX - 1,  'fail')).toEqual({ phase: 'warning', message: 'TIME FOR YOUR NEXT SET' })
    })
    it('critical at and after max threshold', () => {
      expect(restStatus(REST_FAIL_MAX,       'fail')).toEqual({ phase: 'critical', message: 'REST UP — SET FAILED' })
      expect(restStatus(REST_FAIL_MAX + 60,   'fail')).toEqual({ phase: 'critical', message: 'REST UP — SET FAILED' })
    })
  })
})

describe('est1RMFromTm', () => {
  it('is inverse of multiplying by TM_PCT_OF_1RM', () => {
    const e1rm = 250
    expect(est1RMFromTm(e1rm * TM_PCT_OF_1RM)).toBeCloseTo(e1rm, 10)
  })

  it('est1RMFromTm(180) ≈ 200 (90% of 200 = 180)', () => {
    expect(est1RMFromTm(180)).toBeCloseTo(200, 1)
  })

  it('est1RMFromTm(200) = 200 / 0.9', () => {
    expect(est1RMFromTm(200)).toBeCloseTo(200 / TM_PCT_OF_1RM, 5)
  })
})

describe('isSupplementalType', () => {
  it.each(['fsl', 'ssl', 'bbb', 'fsl+bbb', 'ssl+bbb', 'bbs'])('"%s" → true', (type) => {
    expect(isSupplementalType(type)).toBe(true)
  })

  it.each(['main', 'warmup', 'joker', '', 'unknown'])('"%s" → false', (type) => {
    expect(isSupplementalType(type)).toBe(false)
  })
})

describe('applyMainCascadeToSupplemental', () => {
  const fslSets = [
    { type: 'fsl', weight: 130 },
    { type: 'fsl', weight: 130 },
  ]

  it('fsl: updates all fsl sets to mainSet1Weight', () => {
    const out = applyMainCascadeToSupplemental(fslSets, 'fsl', 125)
    expect(out).toEqual([
      { type: 'fsl', weight: 125 },
      { type: 'fsl', weight: 125 },
    ])
  })

  it('fsl+bbb: updates all fsl+bbb sets', () => {
    const sets = [{ type: 'fsl+bbb', weight: 130 }, { type: 'fsl+bbb', weight: 130 }]
    const out = applyMainCascadeToSupplemental(sets, 'fsl+bbb', 120)
    out.forEach(s => expect(s.weight).toBe(120))
  })

  it('ssl: updates all ssl sets to the source-set weight — overridden main set 2 regression', () => {
    const sets = [{ type: 'ssl', weight: 150 }, { type: 'ssl', weight: 150 }]
    expect(applyMainCascadeToSupplemental(sets, 'ssl', 155)).toEqual([
      { type: 'ssl', weight: 155 },
      { type: 'ssl', weight: 155 },
    ])
  })

  it('ssl+bbb: updates all ssl+bbb sets', () => {
    const sets = [{ type: 'ssl+bbb', weight: 150 }, { type: 'ssl+bbb', weight: 150 }]
    const out = applyMainCascadeToSupplemental(sets, 'ssl+bbb', 155)
    out.forEach(s => expect(s.weight).toBe(155))
  })

  it('bbb: returns original sets unchanged (TM-based, no main-set source)', () => {
    const sets = [{ type: 'bbb', weight: 100 }]
    expect(applyMainCascadeToSupplemental(sets, 'bbb', 125)).toEqual(sets)
  })

  it('bbs: returns original sets unchanged (TM-based, no main-set source)', () => {
    const sets = [{ type: 'bbs', weight: 120 }]
    expect(applyMainCascadeToSupplemental(sets, 'bbs', 125)).toEqual(sets)
  })

  it('none: returns original sets unchanged', () => {
    expect(applyMainCascadeToSupplemental(fslSets, 'none', 125)).toEqual(fslSets)
  })

  it('does not mutate the original array', () => {
    const original = [{ type: 'fsl', weight: 130 }]
    applyMainCascadeToSupplemental(original, 'fsl', 125)
    expect(original[0].weight).toBe(130)
  })
})

describe('supplementalSourceSetNumber', () => {
  it('FSL variants follow main set 1', () => {
    expect(supplementalSourceSetNumber('fsl')).toBe(1)
    expect(supplementalSourceSetNumber('fsl+bbb')).toBe(1)
  })
  it('SSL variants follow main set 2', () => {
    expect(supplementalSourceSetNumber('ssl')).toBe(2)
    expect(supplementalSourceSetNumber('ssl+bbb')).toBe(2)
  })
  it('TM-based templates have no source set', () => {
    expect(supplementalSourceSetNumber('bbb')).toBeNull()
    expect(supplementalSourceSetNumber('bbs')).toBeNull()
    expect(supplementalSourceSetNumber('none')).toBeNull()
  })
})

describe('calcSupplementalSets', () => {
  const main = calcMainSets(200, 1) // [130×5, 150×5, 170×5amrap]
  const tm = 200

  it('none: returns []', () => {
    expect(calcSupplementalSets('none', main, tm, 1)).toHaveLength(0)
  })

  it('empty main: returns [] regardless of template', () => {
    expect(calcSupplementalSets('fsl', [], tm, 1)).toHaveLength(0)
  })

  it('fsl: 5 sets at first main set weight', () => {
    const sets = calcSupplementalSets('fsl', main, tm, 1)
    expect(sets).toHaveLength(5)
    sets.forEach(s => expect(s.weight).toBe(130))
    expect(sets[0].type).toBe('fsl')
  })

  it('ssl: 5 sets at second main set weight', () => {
    const sets = calcSupplementalSets('ssl', main, tm, 1)
    expect(sets).toHaveLength(5)
    sets.forEach(s => expect(s.weight).toBe(150))
    expect(sets[0].type).toBe('ssl')
  })

  it('bbb: 5 × 10 at 50% TM', () => {
    const sets = calcSupplementalSets('bbb', main, tm, 1)
    expect(sets).toHaveLength(5)
    expect(sets[0].reps).toBe(10)
    expect(sets[0].weight).toBe(100) // 200 * 0.50 = 100
  })

  it('fsl+bbb: 5 × 10 at first main set weight', () => {
    const sets = calcSupplementalSets('fsl+bbb', main, tm, 1)
    expect(sets).toHaveLength(5)
    expect(sets[0].reps).toBe(10)
    expect(sets[0].weight).toBe(130)
    expect(sets[0].type).toBe('fsl+bbb')
  })

  it('ssl+bbb: 5 × 10 at second main set weight', () => {
    const sets = calcSupplementalSets('ssl+bbb', main, tm, 1)
    expect(sets).toHaveLength(5)
    expect(sets[0].reps).toBe(10)
    expect(sets[0].weight).toBe(150)
  })

  it('bbs week 1: 10 × 5 at 60% TM', () => {
    const sets = calcSupplementalSets('bbs', main, tm, 1)
    expect(sets).toHaveLength(10)
    expect(sets[0].weight).toBe(120) // 200 * 0.60 = 120
    expect(sets[0].reps).toBe(5)
  })

  it('bbs week 4 (deload): returns []', () => {
    expect(calcSupplementalSets('bbs', main, tm, 4)).toHaveLength(0)
  })
})

describe('getSupplementalLabel', () => {
  it('returns null when sets is empty', () => {
    expect(getSupplementalLabel('fsl', [], 1)).toBeNull()
  })

  it('fsl: returns FSL count string', () => {
    const sets = calcFslSets(130)
    expect(getSupplementalLabel('fsl', sets, 1)).toBe('FSL  5 × 5')
  })

  it('ssl: returns SSL count string', () => {
    const sets = calcSslSets(150)
    expect(getSupplementalLabel('ssl', sets, 1)).toBe('SSL  5 × 5')
  })

  it('bbb: includes 50% TM label', () => {
    const sets = calcBbbSets(200)
    expect(getSupplementalLabel('bbb', sets, 1)).toBe('BBB  5 × 10  50% TM')
  })

  it('fsl+bbb: returns FSL+BBB count string', () => {
    const sets = calcFslBbbSets(130)
    expect(getSupplementalLabel('fsl+bbb', sets, 1)).toBe('FSL+BBB  5 × 10')
  })

  it('ssl+bbb: returns SSL+BBB count string', () => {
    const sets = calcSslBbbSets(150)
    expect(getSupplementalLabel('ssl+bbb', sets, 1)).toBe('SSL+BBB  5 × 10')
  })

  it('bbs week 1: includes 60% TM label', () => {
    const sets = calcBbsSets(200, 1)
    expect(getSupplementalLabel('bbs', sets, 1)).toBe('BBS  10 × 5  60% TM')
  })

  it('bbs week 2: includes 70% TM label', () => {
    const sets = calcBbsSets(200, 2)
    expect(getSupplementalLabel('bbs', sets, 2)).toBe('BBS  10 × 5  70% TM')
  })

  it('bbs week 4 deload: returns null (empty set array)', () => {
    expect(getSupplementalLabel('bbs', [], 4)).toBeNull()
  })

  it('bbs week 4 with non-empty sets: still returns null (BBS_PERCENTAGES[4] is null)', () => {
    // Guards the pct !== null check itself, not just the empty-sets early return.
    const sets = calcBbsSets(200, 1)
    expect(getSupplementalLabel('bbs', sets, 4)).toBeNull()
  })

  it('none with non-empty sets: returns null', () => {
    const sets = calcFslSets(130)
    expect(getSupplementalLabel('none', sets, 1)).toBeNull()
  })
})

describe('calcCrossSets', () => {
  const block = (over: Partial<Parameters<typeof calcCrossSets>[0]> = {}) => ({
    movementLiftId: 7, weightMode: 'fsl' as const, percent: null, sets: 5, reps: 10, ...over,
  })

  it('fsl mode uses the movement lift first main set for the week', () => {
    // week 1 first main set = round5(200 * 0.65) = 130
    const sets = calcCrossSets(block({ weightMode: 'fsl' }), 200, 1)
    expect(sets).toHaveLength(5)
    expect(sets.every(s => s.weight === 130 && s.reps === 10 && s.type === 'cross' && s.liftId === 7)).toBe(true)
    expect(sets.map(s => s.setNumber)).toEqual([1, 2, 3, 4, 5])
  })

  it('fsl mode scales the first main set by week (week 3 = 75%)', () => {
    const sets = calcCrossSets(block({ weightMode: 'fsl' }), 200, 3)
    expect(sets[0].weight).toBe(150) // round5(200 * 0.75)
  })

  it('percent mode uses a straight percentage of the movement TM', () => {
    const sets = calcCrossSets(block({ weightMode: 'percent', percent: 0.75, sets: 3 }), 200, 1)
    expect(sets).toHaveLength(3)
    expect(sets.every(s => s.weight === 150)).toBe(true) // round5(200 * 0.75)
  })

  it('percent mode floors at the bar weight', () => {
    const sets = calcCrossSets(block({ weightMode: 'percent', percent: 0.1 }), 100, 1, 45)
    expect(sets[0].weight).toBe(45) // round5(100 * 0.1) = 10 → max(45, 10)
  })

  it('returns no sets when sets count is zero', () => {
    expect(calcCrossSets(block({ sets: 0 }), 200, 1)).toHaveLength(0)
  })

  it('percent mode with a null percent degrades to the bar weight, not NaN (kills the ?? 0 fallback)', () => {
    const sets = calcCrossSets(block({ weightMode: 'percent', percent: null, sets: 2 }), 200, 1, 45)
    expect(sets).toHaveLength(2)
    expect(sets.every(s => s.weight === 45)).toBe(true)
  })
})

describe('getCrossLabel', () => {
  it('fsl mode labels with FSL', () => {
    expect(getCrossLabel({ sets: 5, reps: 10, weightMode: 'fsl', percent: null }, 'OHP')).toBe('OHP  5 × 10  FSL')
  })

  it('percent mode labels with the rounded percentage', () => {
    expect(getCrossLabel({ sets: 3, reps: 10, weightMode: 'percent', percent: 0.75 }, 'Deadlift')).toBe('DEADLIFT  3 × 10  75% TM')
  })

  it('percent mode with a null percent labels 0% TM, not NaN% (kills the ?? 0 fallback)', () => {
    expect(getCrossLabel({ sets: 3, reps: 10, weightMode: 'percent', percent: null }, 'Row')).toBe('ROW  3 × 10  0% TM')
  })
})

describe('effectiveSupplementalWeek', () => {
  it('weeks 1-3 always use their own week regardless of mode', () => {
    for (const w of [1, 2, 3] as const) {
      expect(effectiveSupplementalWeek(w, 'skip')).toBe(w)
      expect(effectiveSupplementalWeek(w, 'deload')).toBe(w)
      expect(effectiveSupplementalWeek(w, 'normal')).toBe(w)
    }
  })

  it('week 4 skip → null (no supplemental)', () => {
    expect(effectiveSupplementalWeek(4, 'skip')).toBeNull()
  })

  it('week 4 deload → week 4 (deload percentages)', () => {
    expect(effectiveSupplementalWeek(4, 'deload')).toBe(4)
  })

  it('week 4 normal → week 1 (~65% percentages)', () => {
    expect(effectiveSupplementalWeek(4, 'normal')).toBe(1)
  })
})
