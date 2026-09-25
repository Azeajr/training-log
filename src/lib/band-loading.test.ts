import { describe, it, expect } from 'vitest'
import type { BandProfile } from '../types/domain'
import { DEFAULT_BANDS, availableBeltLoads, bandNameError, bandProfileFor, bandStacks, validBandInventory, bandsLabel, defaultBandProfile, effectiveBandLoad, legacyBandFields, makeBandLoad, suggestBandLoad, suggestBandLoadDetailed, upgradeBandLoad, validBandLoad, validBandProfile } from './band-loading'

const pull = () => defaultBandProfile('Pull-ups')!
// One of each of the four measured bands — the default equipment.
const owned = DEFAULT_BANDS
// Green 141, Purple 161, both 111, unassisted 191 — few enough stacks to leave
// gaps a test can point at. The full four fill nearly every one of them.
const twoBands = (over: Partial<BandProfile> = {}): BandProfile =>
  ({ ...pull(), bands: pull().bands.filter(b => b.name === 'Green' || b.name === 'Purple'), ...over })
const plates = [{ weight: 45, count: 2 }, { weight: 10, count: 2 }, { weight: 5, count: 2 }, { weight: 2.5, count: 2 }]

describe('band loading', () => {
  it('keeps the original measurements and independent profiles', () => {
    const chin = defaultBandProfile('Chinups')!
    // The measured loads themselves, not a 5lb-grid approximation of them: the
    // calibration records 87 and 143, and `effectiveBandLoad` used to round
    // them to 85 and 145 — corrupting the very numbers the user measured.
    expect(effectiveBandLoad(makeBandLoad(chin, ['Orange']))).toBe(86)
    expect(effectiveBandLoad(makeBandLoad(chin, ['Green']))).toBe(141)
    expect(effectiveBandLoad(makeBandLoad(defaultBandProfile('Nordic curls')!, ['Green']))).toBe(105)
    chin.bands[0].assistance = 0
    expect(pull().bands[0].assistance).toBe(105)
    expect(bandProfileFor({ name: 'Pull-up', bandProfile: { ...chin, enabled: false } })).toBeNull()
    expect(bandProfileFor({ name: 'Bench' })).toBeNull()
  })
  it('keeps assistance fixed when raw load changes, and adds plates exactly', () => {
    const profile = { ...pull(), rawLoad: 201 }
    const load = makeBandLoad(profile, ['Green'], 10)
    expect(load).toEqual({
      bands: ['Green'], rawLoad: 201, assistance: 50, addedWeight: 10,
      // The whole table, not just the band used: editing which band a finished
      // set had needs the assistances that were in force at the time.
      calibration: profile.bands,
    })
    expect(load.calibration).not.toBe(profile.bands)
    expect(effectiveBandLoad(load)).toBe(161)
    expect(effectiveBandLoad(makeBandLoad(pull(), [], 25))).toBe(216)
    // 2.5 in, 2.5 out. A 5lb grid here swallowed every other press of the
    // added-weight stepper, so two sessions a plate apart logged the same
    // `sets.weight` and read back identical to e1RM, records and the TM prompt.
    const step = (added: number) => effectiveBandLoad(makeBandLoad(pull(), [], added))
    expect([0, 2.5, 5, 7.5].map(step)).toEqual([191, 193.5, 196, 198.5])
  })
  it('uses single plates and respects counts and the optional cap', () => {
    expect(availableBeltLoads([{ weight: 25, count: 1 }, { weight: 10, count: 2 }], null)).toEqual([0, 10, 20, 25, 35, 45])
    expect(availableBeltLoads(plates, 5)).toEqual([0, 2.5, 5])
  })
  it('chooses closest effective load, then least added weight', () => {
    // Purple + Red is 191 − 40 = 151, one pound over and less assisted than
    // Green with 10lb on the belt — the stack is what fills that gap now.
    expect(suggestBandLoad(pull(), 150, plates, owned)).toMatchObject({ bands: ['Purple', 'Red'], addedWeight: 0 })
    expect(suggestBandLoad(pull(), 145, plates, owned)).toMatchObject({ bands: ['Green'], addedWeight: 2.5 })
    const profile = { ...pull(), rawLoad: 150, bands: [{ name: 'Light', assistance: 10 }] }
    // 150 with no plates beats 140 + 5 for a midpoint target, even though heavier.
    expect(suggestBandLoad(profile, 147.5, [{ weight: 5, count: 1 }], [{ name: 'Light', count: 1 }])).toMatchObject({ bands: [], addedWeight: 0 })
    // With no plate allowed and only two bands, the nearest two are Green 141
    // (9 under) and Purple 161 (11 over), and their stack is far off at 111.
    // Both count as hitting a 150 target, so least assistance decides and the
    // LESS assisted band wins.
    expect(suggestBandLoad(twoBands({ maxAddedWeight: 0 }), 150, plates, owned)).toMatchObject({ bands: ['Purple'], addedWeight: 0 })
  })
  it('can progress from assisted to unassisted to weighted', () => {
    expect(suggestBandLoad(pull(), 145, plates, owned).bands).toEqual(['Green'])
    expect(suggestBandLoad(pull(), 190, plates, owned)).toMatchObject({ bands: [], addedWeight: 0 })
    expect(suggestBandLoad(pull(), 215, plates, owned)).toMatchObject({ bands: [], addedWeight: 22.5 })
  })
})

describe('validBandLoad and the calibration snapshot', () => {
  const base = { bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 }

  it('takes a row written before the snapshot existed', () => {
    // This is the import gate. Every banded set in an existing backup has no
    // calibration, and refusing those would reject the whole file.
    expect(validBandLoad(base)).toBe(true)
    expect(validBandLoad({ ...base, calibration: undefined })).toBe(true)
    expect(validBandLoad({ ...base, calibration: null })).toBe(true)
  })

  it('takes a repeated band, which is two of it, and refuses a blank one', () => {
    expect(validBandLoad({ ...base, bands: ['Green', 'Purple'] })).toBe(true)
    expect(validBandLoad({ ...base, bands: ['Green', 'Green'] })).toBe(true)
    expect(validBandLoad({ ...base, bands: [' '] })).toBe(false)
    expect(validBandLoad({ ...base, bands: 'Green' })).toBe(false)
  })

  it('takes a well-formed snapshot and refuses a malformed one', () => {
    expect(validBandLoad({ ...base, calibration: [{ name: 'Green', assistance: 48 }] })).toBe(true)
    expect(validBandLoad({ ...base, calibration: [] })).toBe(true)
    expect(validBandLoad({ ...base, calibration: 'Green' })).toBe(false)
    expect(validBandLoad({ ...base, calibration: [{ name: '', assistance: 48 }] })).toBe(false)
    expect(validBandLoad({ ...base, calibration: [{ name: 'Green', assistance: -1 }] })).toBe(false)
    expect(validBandLoad({ ...base, calibration: [{ name: 'Green' }] })).toBe(false)
  })
})

describe('seeded profiles vs. ones a person saved', () => {
  // `clearSeededBandProfiles` tells them apart by bytes, and the ONLY thing
  // separating an accepted template from the template is the flag. Pin it:
  // normalise the profile before that compare, or drop the flag from what
  // BandSettings writes, and every opt-in starts being undone on reload again.
  it('no seed template carries the accepted flag', () => {
    for (const name of ['Chinups', 'Pull-ups', 'Nordic Curls']) {
      const template = defaultBandProfile(name)!
      expect(template.accepted).toBeUndefined()
      expect(JSON.stringify({ ...template, accepted: true })).not.toBe(JSON.stringify(template))
    }
  })

  it('takes the flag through the import gate, and only as true', () => {
    const p = defaultBandProfile('Chinups')!
    expect(validBandProfile({ ...p, accepted: true })).toBe(true)
    expect(validBandProfile(p)).toBe(true)
    expect(validBandProfile({ ...p, accepted: false })).toBe(false)
    expect(validBandProfile({ ...p, accepted: 'yes' })).toBe(false)
  })
})

// ── B3 ──────────────────────────────────────────────────────────────────────
// `Prescribed: 45lb effective` rendered next to an 86lb suggestion and a button
// that cannot close the gap: `suggestBandLoad` can only pick a band and ADD
// weight, so it can never go below the strongest band's assisted load. The
// suggestion now returns its reasoning, so the control can say which of the two
// reasons applies — and they are independent, so both can apply at once.
describe('suggestBandLoadDetailed', () => {
  const pulling = () => defaultBandProfile('Pull-ups')!
  // Orange 86, Green 141, Purple 161, Red 181, unassisted 191.
  const noPlates: { weight: number; count: number }[] = []

  it('selects exactly what the existing algorithm selects', () => {
    for (const target of [45, 86, 145, 150, 190, 215, 500]) {
      for (const plateSet of [plates, noPlates]) {
        expect(suggestBandLoadDetailed(pulling(), target, plateSet, owned).selected)
          .toEqual(suggestBandLoad(pulling(), target, plateSet, owned))
      }
    }
  })

  it('reports an exact hit as reachable, with nothing to explain', () => {
    const s = suggestBandLoadDetailed(pulling(), 141, noPlates, owned)
    expect(s.nearestDistance).toBe(0)
    expect(s.nearestEffectiveLoad).toBe(141)
    expect(s.preferenceUsed).toBe(false)
    // Orange + Green + Purple: 191 − 185. All four assist 195, more than the
    // movement weighs, so that stack is not a load at all.
    expect(s.minAchievable).toBe(6)
    expect(s.maxAchievable).toBe(191)
  })

  /**
   * The tolerance rule is `closest + 2.5`, not `target ± 2.5` — it makes no
   * promise that the selection is near the target. A gap and a preference are
   * separate facts and a caller must be able to say both.
   */
  it('separates an increment gap from a preference tradeoff', () => {
    // 150: nearest is Green 141 (9 under) — nothing lands on 150 without plates.
    // Preference then takes Purple 161, which is further away but less assisted.
    const s = suggestBandLoadDetailed(twoBands({ maxAddedWeight: 0 }), 150, plates, owned)
    expect(s.selected).toMatchObject({ bands: ['Purple'], addedWeight: 0 })
    expect(s.nearestDistance).toBe(9)
    expect(s.nearestEffectiveLoad).toBe(141)
    expect(s.preferenceUsed).toBe(true)
  })

  it('names a target below everything achievable', () => {
    // Both bands on is the floor: 191 − 80.
    const s = suggestBandLoadDetailed(twoBands(), 45, plates, owned)
    expect(s.minAchievable).toBe(111)
    expect(45).toBeLessThan(s.minAchievable)
    expect(s.nearestEffectiveLoad).toBe(111)
    expect(s.nearestDistance).toBe(66)
  })

  it('names a target above everything achievable', () => {
    const s = suggestBandLoadDetailed(pulling(), 500, plates, owned)
    // 191 raw plus every plate on the belt.
    expect(s.maxAchievable).toBe(191 + 125)
    expect(500).toBeGreaterThan(s.maxAchievable)
    expect(s.nearestEffectiveLoad).toBe(s.maxAchievable)
  })

  /**
   * The nearest load is reported so a caller can say which side of the target
   * it falls on. An unsigned distance cannot, and `selected` may be a different
   * candidate entirely.
   */
  it('reports the nearest load above, below, and on an equal-distance tie', () => {
    const bare = twoBands({ maxAddedWeight: 0 })
    // 145 sits 4 above Green 141 and 16 below Purple 161: nearest is below.
    expect(suggestBandLoadDetailed(bare, 145, plates, owned).nearestEffectiveLoad).toBe(141)
    // 158 sits 17 above Green and 3 below Purple: nearest is above.
    expect(suggestBandLoadDetailed(bare, 158, plates, owned).nearestEffectiveLoad).toBe(161)
    // 151 is exactly 10 from each. The tie goes to the lower load.
    const tie = suggestBandLoadDetailed(bare, 151, plates, owned)
    expect(tie.nearestDistance).toBe(10)
    expect(tie.nearestEffectiveLoad).toBe(141)
  })

  it('reports a profile with nothing achievable without inventing a range', () => {
    const empty = { enabled: true, rawLoad: 0, maxAddedWeight: 0, bands: [] }
    const s = suggestBandLoadDetailed(empty, 100, noPlates, owned)
    expect(s.selected).toEqual(makeBandLoad(empty, []))
    expect(s.minAchievable).toBe(0)
    expect(s.maxAchievable).toBe(0)
  })
})

describe('stacked bands', () => {
  it('assists the sum of the bands on, in calibration order', () => {
    // Green 50 + Purple 30, asked for in the other order.
    const load = makeBandLoad(pull(), ['Purple', 'Green'])
    expect(load).toMatchObject({ bands: ['Green', 'Purple'], assistance: 80 })
    expect(effectiveBandLoad(load)).toBe(111)
    expect(bandsLabel(load.bands)).toBe('Green + Purple')
    // Unknown names fall away, as a single unknown band always did.
    expect(makeBandLoad(pull(), ['Blue', 'Red']).bands).toEqual(['Red'])
    expect(makeBandLoad(pull(), [])).toMatchObject({ bands: [], assistance: 0 })
  })

  it('sums in hundredths, so fractional assistances stay exact', () => {
    const profile = { ...pull(), bands: [{ name: 'A', assistance: 0.1 }, { name: 'B', assistance: 0.2 }] }
    expect(makeBandLoad(profile, ['A', 'B']).assistance).toBe(0.3)
  })

  it('lists each total once, with the fewest bands that give it', () => {
    const stacks = bandStacks([
      { name: 'A', assistance: 30 }, { name: 'B', assistance: 10 },
      { name: 'C', assistance: 20 }, { name: 'D', assistance: 30 },
    ], ['A', 'B', 'C', 'D'].map(name => ({ name, count: 1 })))
    const byTotal = new Map(stacks.map(s => [s.reduce((t, n) => t + ({ A: 30, B: 10, C: 20, D: 30 } as Record<string, number>)[n], 0), s]))
    expect(byTotal.size).toBe(stacks.length)
    expect(stacks).toContainEqual([])
    // 30 is A alone, not B + C; D alone ties A and loses on order.
    expect(byTotal.get(30)).toEqual(['A'])
    expect(byTotal.get(90)).toEqual(['A', 'B', 'C', 'D'])
    // A band that assists nothing adds a band and no load.
    expect(bandStacks([{ name: 'Z', assistance: 0 }], [{ name: 'Z', count: 3 }])).toEqual([[]])
  })

  it('fills the gap between single bands before reaching for plates', () => {
    // 111 is exactly Green + Purple. Orange + 25lb is also 111, but carries
    // 105 of assistance to Green + Purple's 80.
    expect(suggestBandLoad(pull(), 111, plates, owned)).toMatchObject({ bands: ['Green', 'Purple'], addedWeight: 0 })
    // Well below any single band: Orange 86 was the floor before stacking.
    expect(suggestBandLoad(pull(), 36, plates, owned)).toMatchObject({ bands: ['Orange', 'Green'], addedWeight: 0 })
    expect(suggestBandLoadDetailed(pull(), 36, plates, owned).nearestDistance).toBe(0)
  })

  it('never offers a stack that assists more than the movement weighs', () => {
    // All four assist 195 against a raw load of 191.
    const s = suggestBandLoadDetailed(pull(), 0, [], owned)
    expect(s.selected.bands).toEqual(['Orange', 'Green', 'Purple'])
    expect(effectiveBandLoad(s.selected)).toBe(6)
  })
})

describe('loads written before bands stacked', () => {
  const legacy = { band: 'Green', rawLoad: 191, assistance: 48, addedWeight: 0 }

  it('names its one band as a list of one, and none as an empty list', () => {
    expect(upgradeBandLoad(legacy)).toEqual({ bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 })
    expect(upgradeBandLoad({ ...legacy, band: null })).toMatchObject({ bands: [] })
    // What the old select wrote for None, had anything ever kept it.
    expect(upgradeBandLoad({ ...legacy, band: '' })).toMatchObject({ bands: [] })
    expect(validBandLoad(upgradeBandLoad(legacy))).toBe(true)
  })

  it('leaves a current load, and anything that is not a load, exactly as it was', () => {
    const current = makeBandLoad(pull(), ['Green'])
    expect(upgradeBandLoad(current)).toBe(current)
    expect(upgradeBandLoad(null)).toBeNull()
    expect(upgradeBandLoad('Green')).toBe('Green')
    // Malformed stays malformed, so the import gate still refuses it.
    expect(validBandLoad(upgradeBandLoad({ ...legacy, band: 7 }))).toBe(false)
  })

  it('is not itself a valid load: every reader sees one shape', () => {
    expect(validBandLoad(legacy)).toBe(false)
  })

  it('upgrades a row and its drop rounds, and reports a current row as needing nothing', () => {
    const current = makeBandLoad(pull(), ['Purple'])
    expect(legacyBandFields({ bandLoad: legacy, dropRounds: [{ weight: 1, reps: 1, bandLoad: legacy }, { weight: 1, reps: 1, bandLoad: current }] }))
      .toEqual({
        bandLoad: { bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 },
        dropRounds: [{ weight: 1, reps: 1, bandLoad: { bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 } }, { weight: 1, reps: 1, bandLoad: current }],
      })
    // Only the field that needs it: a current parent keeps its own value.
    expect(legacyBandFields({ bandLoad: current, dropRounds: [{ weight: 1, reps: 1, bandLoad: legacy }] })).not.toHaveProperty('bandLoad')
    expect(legacyBandFields({ bandLoad: current, dropRounds: [{ weight: 1, reps: 1, bandLoad: null }] })).toBeNull()
    expect(legacyBandFields({})).toBeNull()
  })
})

describe('owning more than one of a band', () => {
  const twoGreens = DEFAULT_BANDS.map(b => b.name === 'Green' ? { ...b, count: 2 } : b)

  it('assists once per band on, and writes the repeat as a count', () => {
    const load = makeBandLoad(pull(), ['Green', 'Purple', 'Green'])
    expect(load).toMatchObject({ bands: ['Green', 'Green', 'Purple'], assistance: 130 })
    expect(effectiveBandLoad(load)).toBe(61)
    expect(bandsLabel(load.bands)).toBe('Green ×2 + Purple')
  })

  it('stacks a band only as many times as you own it', () => {
    const totals = (inventory: typeof owned) => bandStacks(pull().bands, inventory)
      .map(stack => makeBandLoad(pull(), stack).assistance)
    // Two Greens: 100 is reachable, 150 (three) is not.
    expect(totals(twoGreens)).toContain(100)
    expect(totals(twoGreens)).not.toContain(150)
    expect(totals(owned)).not.toContain(100)
  })

  it('offers only bands you own', () => {
    const noOrange = DEFAULT_BANDS.map(b => b.name === 'Orange' ? { ...b, count: 0 } : b)
    const stacks = bandStacks(pull().bands, noOrange)
    expect(stacks.flat()).not.toContain('Orange')
    expect(bandStacks(pull().bands, [])).toEqual([[]])
  })

  it('suggests the second band where it fits', () => {
    // 91 is Green ×2 exactly (100 of assistance), or Orange + 5lb (105).
    expect(suggestBandLoad(pull(), 91, plates, twoGreens)).toMatchObject({ bands: ['Green', 'Green'], addedWeight: 0 })
    expect(suggestBandLoad(pull(), 91, plates, owned).bands).not.toEqual(['Green', 'Green'])
  })
})

describe('the band inventory', () => {
  it('takes names and non-negative whole counts, each name once in any case', () => {
    expect(validBandInventory(DEFAULT_BANDS)).toBe(true)
    expect(validBandInventory([])).toBe(true)
    expect(validBandInventory([{ name: 'Green', count: 0 }])).toBe(true)
    expect(validBandInventory([{ name: 'Green', count: -1 }])).toBe(false)
    expect(validBandInventory([{ name: 'Green', count: 1.5 }])).toBe(false)
    expect(validBandInventory([{ name: ' ', count: 1 }])).toBe(false)
    expect(validBandInventory([{ name: 'Green', count: 1 }, { name: 'green ', count: 1 }])).toBe(false)
    expect(validBandInventory({ name: 'Green', count: 1 })).toBe(false)
  })

  it('says why a name cannot be used, and lets a band keep its own', () => {
    expect(bandNameError(DEFAULT_BANDS, '  ')).toMatch(/needs a name/)
    expect(bandNameError(DEFAULT_BANDS, ' green')).toMatch(/cannot share/)
    expect(bandNameError(DEFAULT_BANDS, 'Green', 'Green')).toBeNull()
    expect(bandNameError(DEFAULT_BANDS, 'Olive', 'Green')).toBeNull()
  })
})
