import { describe, it, expect } from 'vitest'
import { availableBeltLoads, bandProfileFor, defaultBandProfile, effectiveBandLoad, makeBandLoad, suggestBandLoad, suggestBandLoadDetailed, validBandLoad, validBandProfile } from './band-loading'

const pull = () => defaultBandProfile('Pull-ups')!
const plates = [{ weight: 45, count: 2 }, { weight: 10, count: 2 }, { weight: 5, count: 2 }, { weight: 2.5, count: 2 }]

describe('band loading', () => {
  it('keeps the original measurements and independent profiles', () => {
    const chin = defaultBandProfile('Chinups')!
    // The measured loads themselves, not a 5lb-grid approximation of them: the
    // calibration records 87 and 143, and `effectiveBandLoad` used to round
    // them to 85 and 145 — corrupting the very numbers the user measured.
    expect(effectiveBandLoad(makeBandLoad(chin, 'Orange'))).toBe(86)
    expect(effectiveBandLoad(makeBandLoad(chin, 'Green'))).toBe(141)
    expect(effectiveBandLoad(makeBandLoad(defaultBandProfile('Nordic curls')!, 'Green'))).toBe(105)
    chin.bands[0].assistance = 0
    expect(pull().bands[0].assistance).toBe(105)
    expect(bandProfileFor({ name: 'Pull-up', bandProfile: { ...chin, enabled: false } })).toBeNull()
    expect(bandProfileFor({ name: 'Bench' })).toBeNull()
  })
  it('keeps assistance fixed when raw load changes, and adds plates exactly', () => {
    const profile = { ...pull(), rawLoad: 201 }
    const load = makeBandLoad(profile, 'Green', 10)
    expect(load).toEqual({
      band: 'Green', rawLoad: 201, assistance: 50, addedWeight: 10,
      // The whole table, not just the band used: editing which band a finished
      // set had needs the assistances that were in force at the time.
      calibration: profile.bands,
    })
    expect(load.calibration).not.toBe(profile.bands)
    expect(effectiveBandLoad(load)).toBe(161)
    expect(effectiveBandLoad(makeBandLoad(pull(), null, 25))).toBe(216)
    // 2.5 in, 2.5 out. A 5lb grid here swallowed every other press of the
    // added-weight stepper, so two sessions a plate apart logged the same
    // `sets.weight` and read back identical to e1RM, records and the TM prompt.
    const step = (added: number) => effectiveBandLoad(makeBandLoad(pull(), null, added))
    expect([0, 2.5, 5, 7.5].map(step)).toEqual([191, 193.5, 196, 198.5])
  })
  it('uses single plates and respects counts and the optional cap', () => {
    expect(availableBeltLoads([{ weight: 25, count: 1 }, { weight: 10, count: 2 }], null)).toEqual([0, 10, 20, 25, 35, 45])
    expect(availableBeltLoads(plates, 5)).toEqual([0, 2.5, 5])
  })
  it('chooses closest effective load, then least added weight', () => {
    expect(suggestBandLoad(pull(), 150, plates)).toMatchObject({ band: 'Green', addedWeight: 7.5 })
    expect(suggestBandLoad(pull(), 145, plates)).toMatchObject({ band: 'Green', addedWeight: 2.5 })
    const profile = { ...pull(), rawLoad: 150, bands: [{ name: 'Light', assistance: 10 }] }
    // 150 with no plates beats 140 + 5 for a midpoint target, even though heavier.
    expect(suggestBandLoad(profile, 147.5, [{ weight: 5, count: 1 }])).toMatchObject({ band: null, addedWeight: 0 })
    // With no plate allowed the nearest two are Green 141 (9 under) and Purple
    // 161 (11 over). Both count as hitting a 150 target, so least assistance
    // decides and the LESS assisted band wins.
    expect(suggestBandLoad({ ...pull(), maxAddedWeight: 0 }, 150, plates)).toMatchObject({ band: 'Purple', addedWeight: 0 })
  })
  it('can progress from assisted to unassisted to weighted', () => {
    expect(suggestBandLoad(pull(), 145, plates).band).toBe('Green')
    expect(suggestBandLoad(pull(), 190, plates)).toMatchObject({ band: null, addedWeight: 0 })
    expect(suggestBandLoad(pull(), 215, plates)).toMatchObject({ band: null, addedWeight: 22.5 })
  })
})

describe('validBandLoad and the calibration snapshot', () => {
  const base = { band: 'Green', rawLoad: 191, assistance: 48, addedWeight: 0 }

  it('takes a row written before the snapshot existed', () => {
    // This is the import gate. Every banded set in an existing backup has no
    // calibration, and refusing those would reject the whole file.
    expect(validBandLoad(base)).toBe(true)
    expect(validBandLoad({ ...base, calibration: undefined })).toBe(true)
    expect(validBandLoad({ ...base, calibration: null })).toBe(true)
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
        expect(suggestBandLoadDetailed(pulling(), target, plateSet).selected)
          .toEqual(suggestBandLoad(pulling(), target, plateSet))
      }
    }
  })

  it('reports an exact hit as reachable, with nothing to explain', () => {
    const s = suggestBandLoadDetailed(pulling(), 141, noPlates)
    expect(s.nearestDistance).toBe(0)
    expect(s.nearestEffectiveLoad).toBe(141)
    expect(s.preferenceUsed).toBe(false)
    expect(s.minAchievable).toBe(86)
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
    const s = suggestBandLoadDetailed({ ...pulling(), maxAddedWeight: 0 }, 150, plates)
    expect(s.selected).toMatchObject({ band: 'Purple', addedWeight: 0 })
    expect(s.nearestDistance).toBe(9)
    expect(s.nearestEffectiveLoad).toBe(141)
    expect(s.preferenceUsed).toBe(true)
  })

  it('names a target below everything achievable', () => {
    const s = suggestBandLoadDetailed(pulling(), 45, plates)
    expect(s.minAchievable).toBe(86)
    expect(45).toBeLessThan(s.minAchievable)
    expect(s.nearestEffectiveLoad).toBe(86)
    expect(s.nearestDistance).toBe(41)
  })

  it('names a target above everything achievable', () => {
    const s = suggestBandLoadDetailed(pulling(), 500, plates)
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
    const bare = { ...pulling(), maxAddedWeight: 0 }
    // 145 sits 4 above Green 141 and 16 below Purple 161: nearest is below.
    expect(suggestBandLoadDetailed(bare, 145, plates).nearestEffectiveLoad).toBe(141)
    // 158 sits 17 above Green and 3 below Purple: nearest is above.
    expect(suggestBandLoadDetailed(bare, 158, plates).nearestEffectiveLoad).toBe(161)
    // 151 is exactly 10 from each. The tie goes to the lower load.
    const tie = suggestBandLoadDetailed(bare, 151, plates)
    expect(tie.nearestDistance).toBe(10)
    expect(tie.nearestEffectiveLoad).toBe(141)
  })

  it('reports a profile with nothing achievable without inventing a range', () => {
    const empty = { enabled: true, rawLoad: 0, maxAddedWeight: 0, bands: [] }
    const s = suggestBandLoadDetailed(empty, 100, noPlates)
    expect(s.selected).toEqual(makeBandLoad(empty, null))
    expect(s.minAchievable).toBe(0)
    expect(s.maxAchievable).toBe(0)
  })
})
