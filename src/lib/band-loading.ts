import type { TrainingDB } from '../db'
import type { BandLoad, BandProfile, PlateConfig } from '../types/domain'


export const BAND_NAMES = ['Orange', 'Green', 'Purple', 'Red'] as const

const bandProfileFrom = (rawLoad: number, measured: readonly number[]): BandProfile => ({
  enabled: true, rawLoad, maxAddedWeight: null,
  bands: BAND_NAMES.map((name, i) => ({ name, assistance: rawLoad - measured[i] })),
})

/**
 * Measured calibrations per movement, as effective load with each band on.
 *
 * `rawLoad` is the movement's UNASSISTED load, not anyone's bodyweight — the
 * nordic figure is nothing like a scale weight, and the same four physical
 * bands assist the two movements very differently (105 vs 75 on Orange)
 * because a stiff band's assistance depends on how far it is stretched at the
 * working position. Assistance is derived as `rawLoad - measured`, so these
 * stay written the way they were taken.
 *
 * `superseded` holds calibrations an earlier build shipped. They are never
 * offered to anyone; `seededBandProfiles` needs them to recognise a profile the
 * old boot seed wrote, because a database seeded before a measurement was
 * corrected would otherwise be stranded with band loading still forced on.
 */
const CALIBRATIONS = {
  pulling: {
    rawLoad: 191,
    measured: [86, 141, 161, 181],
    superseded: [[87, 143, 160, 181]],
  },
  nordic: {
    rawLoad: 145,
    measured: [70, 105, 115, 135],
    superseded: [],
  },
} as const satisfies Record<string, { rawLoad: number; measured: readonly number[]; superseded: readonly (readonly number[])[] }>

const calibrationFor = (name: string) => {
  const key = name.toLowerCase().replace(/[^a-z]/g, '')
  if (['chinup', 'chinups', 'pullup', 'pullups'].includes(key)) return CALIBRATIONS.pulling
  if (['nordic', 'nordiccurl', 'nordiccurls'].includes(key)) return CALIBRATIONS.nordic
  return null
}

/**
 * A starting calibration for a movement that is commonly band-assisted.
 *
 * A TEMPLATE, offered when the user opens band settings — never applied on its
 * own. Matching on the name alone and switching the feature on was wrong twice
 * over: it swapped a chin-up's weight stepper for band controls without being
 * asked, and it decided by spelling, so "Chin-ups" was banded and "Chinup
 * (neutral grip)" was not. `bandProfileFor` no longer consults it.
 */
export function defaultBandProfile(name: string): BandProfile | null {
  const calibration = calibrationFor(name)
  return calibration ? bandProfileFrom(calibration.rawLoad, calibration.measured) : null
}

/** Every profile the boot seed could have written for this name, current or not. */
function seededBandProfiles(name: string): BandProfile[] {
  const calibration = calibrationFor(name)
  if (!calibration) return []
  return [calibration.measured, ...calibration.superseded]
    .map(measured => bandProfileFrom(calibration.rawLoad, measured))
}

/**
 * The band profile in force for an entity, or null for ordinary loading.
 *
 * Saved profiles only. Bands change what the logger looks like — they replace
 * the weight stepper entirely — so they stay off until the user ticks "Use raw
 * load and bands" in band settings. `defaultBandProfile` fills that dialog in
 * when it opens; it does not decide the answer.
 */
export function bandProfileFor(entity: { name: string; bandProfile?: BandProfile | null } | null | undefined): BandProfile | null {
  const profile = entity?.bandProfile
  return profile?.enabled ? profile : null
}

/**
 * What the set actually weighed, exactly.
 *
 * Deliberately NOT snapped to the nearest 5. This is a RECORD of a load that
 * has already happened, not a prescription being proposed: the number is
 * whatever was on the belt. Rounding it here cost the log its resolution —
 * `addedWeight` steps by 2.5, so a 5lb grid swallowed every other press and two
 * sessions genuinely 2.5lb apart read back identical to `sets.weight`, which is
 * what e1RM, records and the TM prompt all read.
 *
 * `suggestBandLoad` still lands on loadable numbers, because it can only choose
 * combinations the plate inventory can actually make.
 *
 * Hundredths, matching `calcPlates`: plate weights go to 1.25 and repeated
 * addition of floats does not stay exact.
 */
export const effectiveBandLoad = (load: BandLoad): number =>
  Math.round(Math.max(0, load.rawLoad + load.addedWeight - load.assistance) * 100) / 100

export function makeBandLoad(profile: BandProfile, band: string | null, addedWeight = 0): BandLoad {
  const choice = profile.bands.find(b => b.name === band)
  return {
    band: choice?.name ?? null, rawLoad: profile.rawLoad,
    assistance: choice?.assistance ?? 0, addedWeight,
    // Copied, not referenced: the profile row is editable and this is a record.
    calibration: profile.bands.map(b => ({ ...b })),
  }
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

/** Loads this close to the target count as hitting it — one plate step. */
const SUGGEST_TOLERANCE_LB = 2.5

/**
 * The simplest setup that lands on the target.
 *
 * Ranked by distance ONLY down to `SUGGEST_TOLERANCE_LB`, then by least
 * assistance, then by least added weight. Nearest-load-wins on its own is
 * arithmetic rather than training advice: a band and a loaded belt pull in
 * opposite directions, so once the effective load is exact rather than snapped
 * to a 5lb grid, the closest candidate at a 190 target is "Purple band plus
 * 30lb hanging off you" (exactly 190) rather than "unassisted" (191). Nobody
 * rigs a band in order to carry more weight. Preferring the least assisted
 * option inside the tolerance band says the useful thing instead, and dropping
 * 2.5lb of plate to save half a pound of accuracy falls out of the same rule.
 */
export function suggestBandLoad(profile: BandProfile, target: number, plates: PlateConfig[]): BandLoad {
  const addedLoads = availableBeltLoads(plates, profile.maxAddedWeight)
  const candidates: BandLoad[] = []
  for (const band of [null, ...profile.bands.map(b => b.name)]) {
    for (const added of addedLoads) {
      const candidate = makeBandLoad(profile, band, added)
      if (candidate.rawLoad + added - candidate.assistance < 0) continue
      candidates.push(candidate)
    }
  }
  if (candidates.length === 0) return makeBandLoad(profile, null)

  const distance = (c: BandLoad) => Math.abs(effectiveBandLoad(c) - target)
  const closest = Math.min(...candidates.map(distance))
  return candidates
    .filter(c => distance(c) <= closest + SUGGEST_TOLERANCE_LB)
    .reduce((best, c) => c.assistance !== best.assistance
      ? (c.assistance < best.assistance ? c : best)
      : (c.addedWeight < best.addedWeight ? c : best))
}

export function validBandLoad(value: unknown): value is BandLoad {
  if (!value || typeof value !== 'object') return false
  const v = value as BandLoad
  // Absent on every row written before the calibration snapshot existed, and an
  // import has to keep taking those.
  if (v.calibration != null && !(Array.isArray(v.calibration) && v.calibration.every(
    b => b && typeof b.name === 'string' && b.name.trim() && Number.isFinite(b.assistance) && b.assistance >= 0,
  ))) return false
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


/**
 * Undo the name-matched profiles an earlier build wrote on boot.
 *
 * That seed turned band loading ON for anything spelled like a chin-up, which
 * replaced the weight stepper with band controls on a lift the user had set up
 * to log a plain total. Only a profile identical to the template it came from
 * is cleared — once the user has opened band settings and saved, the row is
 * theirs and is left exactly as it stands, enabled or not.
 *
 * Idempotent, and a no-op on a database that never ran the seeding build.
 */
export async function clearSeededBandProfiles(db: TrainingDB): Promise<void> {
  const isUntouchedSeed = (entity: { name: string; bandProfile?: BandProfile | null }): boolean => {
    const saved = JSON.stringify(entity.bandProfile)
    return seededBandProfiles(entity.name).some(seeded => JSON.stringify(seeded) === saved)
  }
  for (const table of [db.lifts, db.exercises]) {
    for (const entity of await table.toArray()) {
      if (entity.id == null || !isUntouchedSeed(entity)) continue
      await table.update(entity.id, { bandProfile: null })
    }
  }
}
