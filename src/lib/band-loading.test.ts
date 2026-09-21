import { describe, it, expect } from 'vitest'
import { availableBeltLoads, bandProfileFor, defaultBandProfile, effectiveBandLoad, makeBandLoad, suggestBandLoad, validBandLoad, validBandProfile } from './band-loading'

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
