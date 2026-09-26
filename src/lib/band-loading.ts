import type { TrainingDB } from '../db'
import type { BandCalibration, BandInventoryItem, BandLoad, BandProfile, PlateConfig } from '../types/domain'


export const BAND_NAMES = ['Orange', 'Green', 'Purple', 'Red'] as const

/** One of each, the bands the measured calibrations below were taken with. */
export const DEFAULT_BANDS: BandInventoryItem[] = BAND_NAMES.map(name => ({ name, count: 1 }))

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

/** Hundredths, the same resolution as `effectiveBandLoad`. */
const sumAssistance = (bands: readonly BandCalibration[]): number =>
  Math.round(bands.reduce((total, b) => total + b.assistance, 0) * 100) / 100

/**
 * A setup with every named band on, assisting their summed pull.
 *
 * Summed because bands on one anchor are stretched the same distance, and
 * forces in parallel add. Each band's assistance is already measured at the
 * working position, so a stack needs no measurement of its own. A name listed
 * twice is two of that band, and assists twice.
 *
 * `bands` comes back in calibration order whatever order it was asked in, so
 * one stack has one spelling — "Green + Purple" and "Purple + Green" would read
 * as two setups in history and in the CSV. A name the calibration does not list
 * is dropped, the way a single unknown band has always fallen back to none.
 */
export function makeBandLoad(profile: BandProfile, bands: readonly string[], addedWeight = 0): BandLoad {
  const on = profile.bands.flatMap(b => bands.filter(name => name === b.name).map(() => b))
  return {
    bands: on.map(b => b.name), rawLoad: profile.rawLoad,
    assistance: sumAssistance(on), addedWeight,
    // Copied, not referenced: the profile row is editable and this is a record.
    calibration: profile.bands.map(b => ({ ...b })),
  }
}

/**
 * How a stack is written wherever it is read back: "Green ×2 + Purple".
 *
 * Repeats sit together, because `makeBandLoad` keeps calibration order.
 */
export function bandsLabel(bands: readonly string[]): string {
  const runs: [string, number][] = []
  for (const name of bands) {
    const last = runs.at(-1)
    if (last?.[0] === name) last[1]++
    else runs.push([name, 1])
  }
  return runs.map(([name, n]) => n > 1 ? `${name} ×${n}` : name).join(' + ')
}

/** How many of a band you own; none for a band the inventory does not list. */
export const ownedCount = (inventory: readonly BandInventoryItem[], name: string): number =>
  inventory.find(b => b.name === name)?.count ?? 0

/**
 * Every distinct amount of assistance the bands you own can give, each with
 * the fewest bands that give it.
 *
 * Bounded subset sums in hundredths, like `availableBeltLoads` over plates: a
 * band goes on at most as many times as the inventory holds, so a stack never
 * asks for a second Green nobody has. A band with nothing measured assists 0 and
 * is left out — it would add a band to rig and no load. Two stacks with the same
 * total are the same load, so only one survives — the one with fewer bands, and
 * on a tie the one reached first in calibration order. The empty stack is always
 * present: unassisted is a setup too.
 */
export function bandStacks(bands: readonly BandCalibration[], inventory: readonly BandInventoryItem[]): string[][] {
  const stacks = new Map<number, string[]>([[0, []]])
  for (const band of bands) {
    const weight = Math.round(band.assistance * 100)
    const count = ownedCount(inventory, band.name)
    if (weight <= 0 || count <= 0) continue
    for (const [total, names] of [...stacks]) {
      for (let n = 1; n <= count; n++) {
        const existing = stacks.get(total + n * weight)
        if (!existing || existing.length > names.length + n) {
          stacks.set(total + n * weight, [...names, ...Array<string>(n).fill(band.name)])
        }
      }
    }
  }
  return [...stacks.values()]
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
/**
 * A suggestion and the reasoning behind it.
 *
 * `selected` is what the algorithm picks, unchanged. The rest exists because a
 * suggestion that misses its target does so for two INDEPENDENT reasons, and a
 * control that conflates them says the wrong thing:
 *
 * - The target may be outside what this setup can reach at all. Only bands can
 *   take load off, so nothing below the strongest stack's assisted load is
 *   achievable, however the plates are arranged.
 * - Preference may have taken a less accurate candidate on purpose. The
 *   tolerance rule is `closest + 2.5`, not `target ± 2.5`, so the selection
 *   makes no promise of being near the target — see `suggestBandLoad` for why
 *   that is the useful behaviour rather than a bug.
 *
 * Both can be true at once, and neither may be: a target can fall in an
 * increment gap AND have a simpler candidate preferred over the nearest one.
 * Never call a target unreachable because `selected` missed it.
 */
export interface BandSuggestion {
  /** The load the existing algorithm selects. Unchanged behaviour. */
  selected: BandLoad
  /** Minimum achievable |effective − target| across ALL candidates. */
  nearestDistance: number
  /** Effective load of a nearest candidate; equal-distance ties prefer the lower load. */
  nearestEffectiveLoad: number
  minAchievable: number
  maxAchievable: number
  /** True when preference took a candidate further from the target than the nearest. */
  preferenceUsed: boolean
}

export function suggestBandLoadDetailed(
  profile: BandProfile, target: number, plates: PlateConfig[], bands: readonly BandInventoryItem[],
): BandSuggestion {
  const addedLoads = availableBeltLoads(plates, profile.maxAddedWeight)
  const candidates: BandLoad[] = []
  for (const stack of bandStacks(profile.bands, bands)) {
    for (const added of addedLoads) {
      const candidate = makeBandLoad(profile, stack, added)
      if (candidate.rawLoad + added - candidate.assistance < 0) continue
      candidates.push(candidate)
    }
  }
  if (candidates.length === 0) {
    const selected = makeBandLoad(profile, [])
    const load = effectiveBandLoad(selected)
    return {
      selected,
      nearestDistance: Math.abs(load - target),
      nearestEffectiveLoad: load,
      minAchievable: load,
      maxAchievable: load,
      preferenceUsed: false,
    }
  }

  const loads = candidates.map(effectiveBandLoad)
  const distance = (c: BandLoad) => Math.abs(effectiveBandLoad(c) - target)
  const closest = Math.min(...candidates.map(distance))

  const selected = candidates
    .filter(c => distance(c) <= closest + SUGGEST_TOLERANCE_LB)
    .reduce((best, c) => c.assistance !== best.assistance
      ? (c.assistance < best.assistance ? c : best)
      : (c.addedWeight < best.addedWeight ? c : best))

  // The lower load on a tie, so a caller reporting "2.5lb under" versus "2.5lb
  // over" gets a stable answer rather than whichever candidate came first.
  const nearestEffectiveLoad = loads
    .filter(load => Math.abs(load - target) === closest)
    .reduce((a, b) => Math.min(a, b))

  return {
    selected,
    nearestDistance: closest,
    nearestEffectiveLoad,
    minAchievable: Math.min(...loads),
    maxAchievable: Math.max(...loads),
    preferenceUsed: distance(selected) > closest,
  }
}

/** The selection alone, for callers with nothing to explain. */
export function suggestBandLoad(
  profile: BandProfile, target: number, plates: PlateConfig[], bands: readonly BandInventoryItem[],
): BandLoad {
  return suggestBandLoadDetailed(profile, target, plates, bands).selected
}

/**
 * A `BandLoad` copied deeply enough to be a separate record.
 *
 * `calibration` is an array, so a spread shares it by reference — and a
 * BandLoad is what a set WAS, not a view onto a profile that is still
 * editable. An absent calibration stays absent: a load written before snapshots
 * existed carries none, and `BandLoadControls` falls back to the live profile
 * for exactly those, which an empty array would suppress.
 */
export const copyBandLoad = (load: BandLoad): BandLoad =>
  ({ ...load, bands: [...load.bands], calibration: load.calibration?.map(b => ({ ...b })) })

export function validBandLoad(value: unknown): value is BandLoad {
  if (!value || typeof value !== 'object') return false
  const v = value as BandLoad
  // Absent on every row written before the calibration snapshot existed, and an
  // import has to keep taking those.
  if (v.calibration != null && !(Array.isArray(v.calibration) && v.calibration.every(
    b => b && typeof b.name === 'string' && b.name.trim() && Number.isFinite(b.assistance) && b.assistance >= 0,
  ))) return false
  // A repeated name is legitimate — two of the same band — but a blank one is
  // nothing the chips could show.
  return Array.isArray(v.bands) && v.bands.every(b => typeof b === 'string' && b.trim()) &&
    [v.rawLoad, v.assistance, v.addedWeight].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0)
}

/**
 * A band load in the current shape, whatever build wrote it.
 *
 * Before bands could stack, a load named its one band as `band: string | null`.
 * Those rows are still on disk and in every backup taken before, so they are
 * rewritten wherever rows arrive — at boot and on import, the way
 * `clearSeededBandProfiles` is — rather than every reader learning both shapes.
 * An empty name counts as none, which is what the band select it came from
 * meant by it.
 *
 * Anything that is not a legacy load comes back untouched, so a malformed one
 * still reaches `validBandLoad` malformed.
 */
export function upgradeBandLoad(value: unknown): unknown {
  if (!value || typeof value !== 'object' || !('band' in value) || 'bands' in value) return value
  const { band, ...rest } = value as { band: unknown }
  return { ...rest, bands: band == null || band === '' ? [] : typeof band === 'string' ? [band] : band }
}

/**
 * The band-load fields of one set row that still need `upgradeBandLoad`, drop
 * rounds included, upgraded — or null when the row is already current.
 */
export function legacyBandFields(row: { bandLoad?: unknown; dropRounds?: unknown }): { bandLoad?: unknown; dropRounds?: unknown } | null {
  const changes: { bandLoad?: unknown; dropRounds?: unknown } = {}
  const bandLoad = upgradeBandLoad(row.bandLoad)
  if (bandLoad !== row.bandLoad) changes.bandLoad = bandLoad
  if (Array.isArray(row.dropRounds)) {
    const rounds: unknown[] = row.dropRounds
    const upgraded = rounds.map(round => {
      if (!round || typeof round !== 'object') return round
      const r = round as { bandLoad?: unknown }
      const load = upgradeBandLoad(r.bandLoad)
      return load === r.bandLoad ? round : { ...r, bandLoad: load }
    })
    if (upgraded.some((round, i) => round !== rounds[i])) changes.dropRounds = upgraded
  }
  return Object.keys(changes).length ? changes : null
}

/** `upgradeBandLoad` over every stored set. Idempotent. */
export async function upgradeLegacyBandLoads(db: TrainingDB): Promise<void> {
  for (const row of await db.sets.toArray()) {
    const changes = legacyBandFields(row)
    if (row.id != null && changes) await db.sets.update(row.id, changes as Partial<typeof row>)
  }
  for (const row of await db.accessorySets.toArray()) {
    const changes = legacyBandFields(row)
    if (row.id != null && changes) await db.accessorySets.update(row.id, changes as Partial<typeof row>)
  }
}

/** One spelling of a band name for comparing two: "green " is "Green". */
const nameKey = (name: string) => name.trim().toLowerCase()

/**
 * Why a name cannot be given to a band, or null when it can.
 *
 * Names are the key every calibration and every recorded set is stored under,
 * so a blank one or a second "Green" — in any case, with any stray space — is
 * two bands nobody can tell apart.
 */
export function bandNameError(inventory: readonly BandInventoryItem[], name: string, except?: string): string | null {
  if (!name.trim()) return 'Every band needs a name.'
  if (inventory.some(b => b.name !== except && nameKey(b.name) === nameKey(name))) return 'Two bands cannot share a name.'
  return null
}

export function validBandInventory(value: unknown): value is BandInventoryItem[] {
  return Array.isArray(value) &&
    value.every(b => b && typeof b === 'object' && typeof b.name === 'string' && b.name.trim() &&
      Number.isInteger(b.count) && b.count >= 0) &&
    new Set(value.map(b => nameKey((b as BandInventoryItem).name))).size === value.length
}

/** The inventory row, and the bands in it — the default for a row that has none. */
async function inventoryRow(db: TrainingDB) {
  const row = await db.settings.toCollection().first()
  return { row, bands: row?.bands ?? DEFAULT_BANDS }
}

/**
 * Make the inventory list every band a movement calibrates.
 *
 * Profiles held their own band lists before the inventory existed, so a
 * database from then has calibrations and no inventory. It is built from the
 * names those profiles use — in the order first met, one of each, since nothing
 * recorded how many — or the default four when nothing has been calibrated. A
 * backup restores its inventory as it was, and whatever it lacks that its
 * profiles name is added the same way, so no measurement is stranded under a
 * band the equipment does not have.
 *
 * Idempotent. Runs at boot and after import, like `clearSeededBandProfiles`.
 */
export async function reconcileBandInventory(db: TrainingDB): Promise<void> {
  const row = await db.settings.toCollection().first()
  if (row?.id == null) return
  const names: string[] = []
  for (const table of [db.lifts, db.exercises]) {
    for (const entity of await table.toArray()) {
      for (const band of entity.bandProfile?.bands ?? []) if (!names.includes(band.name)) names.push(band.name)
    }
  }
  const current = row.bands ?? (names.length ? [] : DEFAULT_BANDS)
  const missing = names.filter(name => !current.some(b => b.name === name))
  if (row.bands && missing.length === 0) return
  await db.settings.update(row.id, { bands: [...current, ...missing.map(name => ({ name, count: 1 }))] })
}

/**
 * Every movement's profile, with `change` applied to its band list.
 *
 * Only rows whose list actually changes are written.
 */
async function eachProfile(db: TrainingDB, change: (bands: BandCalibration[]) => BandCalibration[]): Promise<void> {
  for (const table of [db.lifts, db.exercises]) {
    for (const entity of await table.toArray()) {
      const profile = entity.bandProfile
      if (entity.id == null || !profile) continue
      const bands = change(profile.bands)
      if (JSON.stringify(bands) !== JSON.stringify(profile.bands)) await table.update(entity.id, { bandProfile: { ...profile, bands } })
    }
  }
}

/**
 * Rename a band everywhere it is measured.
 *
 * One band, one name: the equipment and every movement's calibration move
 * together, in one transaction, so no profile is left measuring a band the
 * inventory no longer has. Recorded sets are not touched — they say what the
 * band was called when they happened, and `BandLoadControls` marks one that has
 * since been renamed.
 */
export async function renameBand(db: TrainingDB, from: string, to: string): Promise<void> {
  const name = to.trim()
  await db.transaction(async () => {
    const { row, bands } = await inventoryRow(db)
    if (row?.id == null || !bands.some(b => b.name === from)) throw new Error(`No band called ${from}.`)
    const error = bandNameError(bands, name, from)
    if (error) throw new Error(error)
    await db.settings.update(row.id, { bands: bands.map(b => b.name === from ? { name, count: b.count } : { ...b }) })
    await eachProfile(db, list => list.map(b => b.name === from ? { ...b, name } : b))
  })
}

/**
 * Stop owning a band: gone from the equipment, and its measurement from every
 * movement. A count of 0 is the way to put one aside and keep its numbers.
 */
export async function removeBand(db: TrainingDB, name: string): Promise<void> {
  await db.transaction(async () => {
    const { row, bands } = await inventoryRow(db)
    if (row?.id == null) return
    await db.settings.update(row.id, { bands: bands.filter(b => b.name !== name).map(b => ({ ...b })) })
    await eachProfile(db, list => list.filter(b => b.name !== name))
  })
}

export function validBandProfile(value: unknown): value is BandProfile {
  if (!value || typeof value !== 'object') return false
  const v = value as BandProfile
  if (v.accepted !== undefined && v.accepted !== true) return false
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
    // `accepted` is what makes this safe, and it works through the compare
    // rather than around it: no template carries the flag, so a profile a
    // person saved can never match one. Before it existed, accepting the
    // offered measurements unchanged produced the template's bytes exactly and
    // was read as the seeder's own work — bands on for a session, off after a
    // reload. Rows with no flag predate it and are still judged on bytes alone,
    // which is the best that can be said about them.
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
