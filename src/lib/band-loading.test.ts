import { describe, it, expect } from 'vitest'
import { availableBeltLoads, bandProfileFor, defaultBandProfile, effectiveBandLoad, makeBandLoad, suggestBandLoad } from './band-loading'

const pull = () => defaultBandProfile('Pull-ups')!
const plates = [{ weight: 45, count: 2 }, { weight: 10, count: 2 }, { weight: 5, count: 2 }, { weight: 2.5, count: 2 }]

describe('band loading', () => {
  it('keeps the original measurements and independent profiles', () => {
    const chin = defaultBandProfile('Chinups')!
    expect(effectiveBandLoad(makeBandLoad(chin, 'Orange'))).toBe(85)
    expect(effectiveBandLoad(makeBandLoad(chin, 'Green'))).toBe(145)
    expect(effectiveBandLoad(makeBandLoad(defaultBandProfile('Nordic curls')!, 'Green'))).toBe(105)
    chin.bands[0].assistance = 0
    expect(pull().bands[0].assistance).toBe(104)
    expect(bandProfileFor({ name: 'Pull-up', bandProfile: { ...chin, enabled: false } })).toBeNull()
    expect(bandProfileFor({ name: 'Bench' })).toBeNull()
  })
  it('keeps assistance fixed when raw load changes; adds plates before rounding', () => {
    const profile = { ...pull(), rawLoad: 201 }
    const load = makeBandLoad(profile, 'Green', 10)
    expect(load).toEqual({ band: 'Green', rawLoad: 201, assistance: 48, addedWeight: 10 })
    expect(effectiveBandLoad(load)).toBe(165)
    expect(effectiveBandLoad(makeBandLoad(pull(), null, 25))).toBe(215)
  })
  it('uses single plates and respects counts and the optional cap', () => {
    expect(availableBeltLoads([{ weight: 25, count: 1 }, { weight: 10, count: 2 }], null)).toEqual([0, 10, 20, 25, 35, 45])
    expect(availableBeltLoads(plates, 5)).toEqual([0, 2.5, 5])
  })
  it('chooses closest effective load, then least added weight', () => {
    expect(suggestBandLoad(pull(), 150, plates)).toMatchObject({ band: 'Green', addedWeight: 5 })
    expect(suggestBandLoad(pull(), 145, plates)).toMatchObject({ band: 'Green', addedWeight: 0 })
    const profile = { ...pull(), rawLoad: 150, bands: [{ name: 'Light', assistance: 10 }] }
    // 150 with no plates beats 140 + 5 for a midpoint target, even though heavier.
    expect(suggestBandLoad(profile, 147.5, [{ weight: 5, count: 1 }])).toMatchObject({ band: null, addedWeight: 0 })
    expect(suggestBandLoad({ ...pull(), maxAddedWeight: 0 }, 150, plates)).toMatchObject({ band: 'Green', addedWeight: 0 })
  })
  it('can progress from assisted to unassisted to weighted', () => {
    expect(suggestBandLoad(pull(), 145, plates).band).toBe('Green')
    expect(suggestBandLoad(pull(), 190, plates)).toMatchObject({ band: null, addedWeight: 0 })
    expect(suggestBandLoad(pull(), 215, plates)).toMatchObject({ band: null, addedWeight: 22.5 })
  })
})
