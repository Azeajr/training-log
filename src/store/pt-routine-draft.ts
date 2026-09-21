import type { PtExerciseDraft } from '../lib/pt'
import { PT_DISTANCE_UNITS, PT_MEASURES, PT_RESISTANCE_KINDS } from '../lib/pt'

/**
 * An unsaved PT routine, parked between visits.
 *
 * `PtRoutineEdit` held the whole form in component-local signals, so entering a
 * name and an exercise, tapping Today and coming back with the browser's Back
 * button reset the lot. A longer routine costs more to reconstruct, which is
 * exactly when it hurts.
 *
 * Plain functions over localStorage rather than a reactive store: there is one
 * reader, it reads once on mount, and nothing else in the app has an opinion
 * about a half-written routine.
 */
export interface PtRoutineDraft {
  name: string
  notes: string
  exercises: PtExerciseDraft[]
  /**
   * What the saved routine looked like when the draft was taken.
   *
   * A draft is written against a routine that other screens can change — an
   * import replaces every table — so restoring one blindly could overwrite work
   * done since. Null for a routine that does not exist yet, which nothing can
   * have changed underneath.
   */
  base: string | null
}

const STORAGE_KEY = 'pt-routine-draft'
const STORAGE_VERSION = 1

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isNumOrNull = (v: unknown): boolean => v == null || typeof v === 'number'
const isStrOrNull = (v: unknown): boolean => v == null || typeof v === 'string'
const isOneOfOrNull = (v: unknown, allowed: readonly string[]): boolean =>
  v == null || (typeof v === 'string' && allowed.includes(v))

/**
 * Deep, not shallow. A restored draft goes straight into the form's signals,
 * where a stepper reads `sets` as a number and a chip compares `measure` against
 * a fixed list — so a malformed member has to be rejected here rather than
 * crash the next render or, worse, reach `savePtRoutine`.
 */
const isExerciseDraft = (v: unknown): v is PtExerciseDraft => {
  if (!isPlainObject(v)) return false
  return typeof v.name === 'string'
    && typeof v.sets === 'number'
    && typeof v.measure === 'string' && PT_MEASURES.includes(v.measure as never)
    && typeof v.resistanceKind === 'string' && PT_RESISTANCE_KINDS.includes(v.resistanceKind as never)
    && (v.id === undefined || Number.isInteger(v.id))
    && isStrOrNull(v.description) && isStrOrNull(v.videoUrl) && isStrOrNull(v.resistanceBand)
    && isNumOrNull(v.targetReps) && isNumOrNull(v.targetSeconds) && isNumOrNull(v.targetDistance)
    && isNumOrNull(v.resistanceWeight) && isNumOrNull(v.equipmentHeight)
    && isOneOfOrNull(v.distanceUnit, PT_DISTANCE_UNITS)
    && isOneOfOrNull(v.equipmentHeightUnit, ['in', 'cm'])
}

const isDraft = (v: unknown): v is PtRoutineDraft =>
  isPlainObject(v)
  && typeof v.name === 'string'
  && typeof v.notes === 'string'
  && (v.base === null || typeof v.base === 'string')
  && Array.isArray(v.exercises) && v.exercises.every(isExerciseDraft)

/** The key one form's draft is filed under: the routine's id, or `new`. */
export const ptRoutineDraftKey = (routineId: number | null): string =>
  routineId === null ? 'new' : String(routineId)

/**
 * A comparable summary of a routine's editable content.
 *
 * Used for two things at once: telling a draft that differs from the saved
 * routine (worth keeping) from one that merely matches it (worth deleting), and
 * telling a draft written against a routine that has since changed underneath.
 * Field order is fixed here rather than left to object key order, so the same
 * content always produces the same string.
 */
export function ptRoutineFingerprint(routine: {
  name: string
  notes: string
  exercises: PtExerciseDraft[]
}): string {
  return JSON.stringify([
    routine.name,
    routine.notes,
    routine.exercises.map(ex => [
      ex.id ?? null, ex.name, ex.description ?? '', ex.videoUrl ?? '',
      ex.sets, ex.measure,
      ex.targetReps ?? null, ex.targetSeconds ?? null, ex.targetDistance ?? null,
      ex.distanceUnit ?? null,
      ex.resistanceKind, ex.resistanceWeight ?? null, ex.resistanceBand ?? '',
      ex.equipmentHeight ?? null, ex.equipmentHeightUnit ?? null,
    ]),
  ])
}

function readAll(): Record<string, PtRoutineDraft> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: number; drafts?: unknown }
    if (parsed.v !== STORAGE_VERSION || !isPlainObject(parsed.drafts)) return {}
    const out: Record<string, PtRoutineDraft> = {}
    for (const [key, value] of Object.entries(parsed.drafts)) {
      if (isDraft(value)) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(drafts: Record<string, PtRoutineDraft>): void {
  try {
    if (Object.keys(drafts).length === 0) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: STORAGE_VERSION, drafts }))
  } catch {
    // A full or blocked localStorage costs the parked draft and nothing else.
    // Unlike a run in progress, the form on screen is unaffected, so there is
    // no degraded state worth telling the user about.
  }
}

export const readPtRoutineDraft = (key: string): PtRoutineDraft | null => readAll()[key] ?? null

export function writePtRoutineDraft(key: string, draft: PtRoutineDraft): void {
  writeAll({ ...readAll(), [key]: draft })
}

export function clearPtRoutineDraft(key: string): void {
  const drafts = readAll()
  if (!(key in drafts)) return
  delete drafts[key]
  writeAll(drafts)
}
