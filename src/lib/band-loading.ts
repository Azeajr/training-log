import type { TrainingDB } from '../db'
import type { BandLoad, BandProfile, PlateConfig } from '../types/domain'
import { roundToNearest5 } from './calc'

export const BAND_NAMES = ['Orange', 'Green', 'Purple', 'Red'] as const

export function defaultBandProfile(name: string): BandProfile | null {
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  const pulling = ['chinup', 'chinups', 'pullup', 'pullups'].includes(key)
  const nordic = ['nordic', 'nordiccurl', 'nordiccurls'].includes(key)
  if (!pulling && !nordic) return null
  const rawLoad = pulling ? 191 : 145
  const measured = pulling ? [87, 143, 160, 181] : [70, 105, 115, 135]
  return { enabled: true, rawLoad, maxAddedWeight: null,
    bands: BAND_NAMES.map((name, i) => ({ name, assistance: rawLoad - measured[i] })) }
}

export function bandProfileFor(entity: { name: string; bandProfile?: BandProfile | null } | null | undefined): BandProfile | null {
  if (!entity) return null
  const profile = entity.bandProfile ?? defaultBandProfile(entity.name)
  return profile?.enabled ? profile : null
}

export const effectiveBandLoad = (load: BandLoad): number =>
  roundToNearest5(Math.max(0, load.rawLoad + load.addedWeight - load.assistance))

export function makeBandLoad(profile: BandProfile, band: string | null, addedWeight = 0): BandLoad {
  const choice = profile.bands.find(b => b.name === band)
  return { band: choice?.name ?? null, rawLoad: profile.rawLoad, assistance: choice?.assistance ?? 0, addedWeight }
}

// Bounded subset sums in hundredths. Single plates, respecting inventory counts.
export function availableBeltLoads(plates: PlateConfig[], cap: number | null): number[] {
  let loads = new Set([0])
  const limit = cap == null ? Infinity : Math.round(cap * 100)
  for (const plate of plates) {
    if (!Number.isFinite(plate.weight) || plate.weight <= 0 || !Number.isInteger(plate.count) || plate.count <= 0) continue
    const weight = Math.round(plate.weight * 100)
    const next = new Set(loads)
    for (const load of loads) {
      for (let count = 1; count <= plate.count && load + count * weight <= limit; count++) next.add(load + count * weight)
    }
    loads = next
  }
  return [...loads].sort((a, b) => a - b).map(w => w / 100)
}

export function suggestBandLoad(profile: BandProfile, target: number, plates: PlateConfig[]): BandLoad {
  let best = makeBandLoad(profile, null)
  let error = Infinity
  const addedLoads = availableBeltLoads(plates, profile.maxAddedWeight)
  // None wins the final tie; then calibrated band order is stable.
  for (const band of [null, ...profile.bands.map(b => b.name)]) {
    for (const added of addedLoads) {
      const candidate = makeBandLoad(profile, band, added)
      if (candidate.rawLoad + added - candidate.assistance < 0) continue
      const distance = Math.abs(effectiveBandLoad(candidate) - target)
      if (distance < error || (distance === error && added < best.addedWeight)) {
        best = candidate
        error = distance
      }
    }
  }
  return best
}

export function validBandLoad(value: unknown): value is BandLoad {
  if (!value || typeof value !== 'object') return false
  const v = value as BandLoad
  return (v.band === null || typeof v.band === 'string') &&
    [v.rawLoad, v.assistance, v.addedWeight].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
}

export function validBandProfile(value: unknown): value is BandProfile {
  if (!value || typeof value !== 'object') return false
  const v = value as BandProfile
  return typeof v.enabled === 'boolean' && Number.isFinite(v.rawLoad) && v.rawLoad >= 0 &&
    (v.maxAddedWeight === null || (Number.isFinite(v.maxAddedWeight) && v.maxAddedWeight >= 0)) &&
    Array.isArray(v.bands) && v.bands.every(b => b && typeof b.name === 'string' && b.name.trim() && Number.isFinite(b.assistance) && b.assistance >= 0) &&
    new Set(v.bands.map(b => b.name)).size === v.bands.length
}


/** Add supplied initial calibrations once; never overwrite a saved or disabled profile. */
export async function seedBandProfiles(db: TrainingDB): Promise<void> {
  for (const table of [db.lifts, db.exercises]) {
    for (const entity of await table.toArray()) {
      if (entity.bandProfile != null || entity.id == null) continue
      const bandProfile = defaultBandProfile(entity.name)
      if (bandProfile) await table.update(entity.id, { bandProfile })
    }
  }
}
