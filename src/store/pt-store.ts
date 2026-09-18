import { createStore, produce, reconcile, unwrap } from 'solid-js/store'
import { batch, createEffect, createSignal } from 'solid-js'
import type { PtDistanceUnit } from '../types/domain'

// Set lists are positional and their members carry no id, so reconcile must
// match by index. Left at its default it keys on `id`, sees undefined on every
// member, and treats them as interchangeable.
const RECONCILE_BY_INDEX = { key: null } as const

/**
 * One set of one exercise within a run: whether it is done, and how it differed
 * from the prescription.
 *
 * Absent and null mean different things, and the difference is load-bearing.
 * **Absent** is "not overridden" — the set is as prescribed, and resolves
 * against the exercise at save time. **Null** is an explicit "none", which is
 * how a step-up done at floor level records that it had no box even though the
 * routine prescribes one. JSON omits undefined keys, so this survives a
 * round-trip through localStorage without any extra encoding.
 */
export interface PtRunSet {
  done: boolean
  reps?: number | null
  seconds?: number | null
  distance?: number | null
  distanceUnit?: PtDistanceUnit | null
  weight?: number | null
  band?: string | null
  equipmentHeight?: number | null
  equipmentHeightUnit?: 'in' | 'cm' | null
}

/**
 * The in-progress PT session, with a draft per included routine.
 *
 * Deliberately shaped unlike `workout-store`: there is no `activeSession`,
 * because a PT run has no database row until it is finished. Logging a set
 * moves a value in `sets` and nothing else, so DISCARD is a `clearPtRun()` with
 * no row to delete and no status to reconcile — the whole store-vs-DB drift
 * class in COMMON_MISTAKES #5 has nothing to act on here.
 *
 * It still persists to localStorage, for the ordinary reason: a rehab session
 * is done on the floor with the phone locking between exercises, and a reload
 * must not lose what was already recorded.
 */
interface PtRunState {
  routineId: number | null
  /** Epoch ms the run began; becomes the session's date on commit. */
  startedAt: number | null
  /**
   * Sets per exercise, keyed by ptExercise id (a string — JSON has no numeric
   * keys). Position is the set number, so index 0 is set 1. The list is the
   * authority on how many sets a run has: it starts as long as the prescription
   * but the user can add to and delete from it.
   */
  sets: Record<string, PtRunSet[]>
  /** Per-exercise note, keyed by ptExercise id (as a string — JSON has no numeric keys). */
  exerciseNotes: Record<string, string>
  notes: string
}

const STORAGE_KEY = 'pt-run'
// 2: `done: string[]` of "exerciseId:setNumber" became `sets`, which carries
// what was actually done per set. `migrateV1` converts rather than discarding —
// a rehab session is done on the floor and an app update mid-run must not cost
// the user their ticks.
const STORAGE_VERSION = 2

const PERSISTED_KEYS = [
  'routineId',
  'startedAt',
  'sets',
  'exerciseNotes',
  'notes',
] as const satisfies readonly (keyof PtRunState)[]

const isPlainObject = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Per-key shape checks, for the same reason workout-store has them: a
// wrong-typed value under an allowlisted key must be dropped rather than
// grafted onto the reactive store, where the next render would crash on it.
const isNumOrNull = (v: unknown): boolean => v == null || typeof v === 'number'
const isStrOrNull = (v: unknown): boolean => v == null || typeof v === 'string'

// Deep, not shallow: a set list reaches the reactive store as objects the run
// screen reads field by field, so a malformed member has to be rejected here
// rather than crash the next render.
const isPtRunSet = (v: unknown): boolean => {
  if (!isPlainObject(v)) return false
  const s = v as Record<string, unknown>
  return typeof s.done === 'boolean'
    && isNumOrNull(s.reps) && isNumOrNull(s.seconds) && isNumOrNull(s.distance)
    && isStrOrNull(s.distanceUnit) && isNumOrNull(s.weight) && isStrOrNull(s.band)
    && isNumOrNull(s.equipmentHeight) && isStrOrNull(s.equipmentHeightUnit)
}

const PERSISTED_VALIDATORS: Record<(typeof PERSISTED_KEYS)[number], (v: unknown) => boolean> = {
  routineId: v => v === null || Number.isInteger(v),
  startedAt: v => v === null || typeof v === 'number',
  sets: v => isPlainObject(v)
    && Object.values(v as object).every(list => Array.isArray(list) && list.every(isPtRunSet)),
  exerciseNotes: v => isPlainObject(v) && Object.values(v as object).every(x => typeof x === 'string'),
  notes: v => typeof v === 'string',
}

function validateState(state: unknown): Partial<PtRunState> {
  if (!isPlainObject(state)) return {}
  const src = state as Record<string, unknown>
  const out: Partial<PtRunState> = {}
  for (const k of PERSISTED_KEYS) {
    if (Object.hasOwn(src, k) && PERSISTED_VALIDATORS[k](src[k])) {
      (out as Record<string, unknown>)[k] = src[k]
    }
  }
  return out
}

/**
 * v1 → v2: `done: string[]` of `${ptExerciseId}:${setNumber}` becomes `sets`.
 *
 * A v1 draft recorded only the ticked sets, so the lists rebuilt here reach as
 * far as the highest tick and no further. That is not the run's real length —
 * the run screen extends each list to the exercise's prescription on load, and
 * a set it cannot account for stays untouched.
 */
function migrateV1(state: unknown): unknown {
  if (!isPlainObject(state)) return state
  const { done, ...rest } = state as Record<string, unknown>
  const sets: Record<string, PtRunSet[]> = {}
  for (const entry of Array.isArray(done) ? done : []) {
    if (typeof entry !== 'string') continue
    const [idPart, numberPart] = entry.split(':')
    const setNumber = Number(numberPart)
    if (!Number.isInteger(Number(idPart)) || !Number.isInteger(setNumber) || setNumber < 1) continue
    const list = (sets[idPart] ??= [])
    while (list.length < setNumber) list.push(emptySet())
    list[setNumber - 1] = { ...emptySet(), done: true }
  }
  return { ...rest, sets }
}

function loadFromStorage(): { current: Partial<PtRunState>; paused: Record<string, PtRunState> } {
  const empty = { current: {}, paused: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown; paused?: unknown }
    if (parsed.v !== STORAGE_VERSION && parsed.v !== 1) return empty
    const migrate = (s: unknown): unknown => parsed.v === 1 ? migrateV1(s) : s
    const current = validateState(migrate(parsed.state))
    const paused: Record<string, PtRunState> = {}
    if (isPlainObject(parsed.paused)) {
      for (const [id, value] of Object.entries(parsed.paused as object)) {
        const run = validateState(migrate(value))
        if (run.routineId != null && String(run.routineId) === id && run.routineId !== current.routineId) {
          paused[id] = { ...emptyState(), ...run }
        }
      }
    }
    return { current, paused }
  } catch {
    return empty
  }
}

/**
 * A set as prescribed and not yet done. Factory — these are mutated by produce().
 *
 * Carries no override keys at all, which is what "as prescribed" means here.
 */
export const emptySet = (): PtRunSet => ({ done: false })

// Factory, not a shared constant: `sets` is mutated in place by produce().
const emptyState = (): PtRunState => ({
  routineId: null,
  startedAt: null,
  sets: {},
  exerciseNotes: {},
  notes: '',
})

const restored = loadFromStorage()
// Keep the original `state` entry readable so existing single-routine drafts
// restore unchanged. Additional routines persist alongside it.
const [pausedRuns, setPausedRuns] = createStore<Record<string, PtRunState>>(restored.paused)
export const [ptRun, setPtRun] = createStore<PtRunState>({
  ...emptyState(),
  ...restored.current,
})

/** Progress for any routine, including ones the user has navigated away from. */
export function getPtRun(routineId: number): PtRunState | undefined {
  return ptRun.routineId === routineId ? ptRun : pausedRuns[String(routineId)]
}

export function ptSessionRoutineIds(): number[] {
  return [...(ptRun.routineId === null ? [] : [ptRun.routineId]), ...Object.keys(pausedRuns).map(Number)]
}

export function startPtSession(routineIds: number[]): void {
  batch(() => routineIds.forEach(startPtRun))
}

// Non-null means the run is no longer being mirrored to localStorage, and says
// why. Same contract as workout-store's: a write failure inside a reactive
// effect has no catch above it, and silence would mean a reload quietly loses
// every tick the user has made.
const [ptPersistenceError, setPtPersistenceError] = createSignal<string | null>(null)
export { ptPersistenceError }

/** Must be called inside a reactive root (see main.tsx). */
export function setupPtRunPersistence() {
  createEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: STORAGE_VERSION,
        paused: pausedRuns,
        state: {
          routineId: ptRun.routineId,
          startedAt: ptRun.startedAt,
          sets: ptRun.sets,
          exerciseNotes: ptRun.exerciseNotes,
          notes: ptRun.notes,
        },
      }))
      setPtPersistenceError(null)
    } catch (err) {
      setPtPersistenceError(err instanceof Error ? err.message : 'unknown error')
    }
  })
}

/** Test helper — clears the degraded-persistence state. */
export function resetPtPersistenceError(): void {
  setPtPersistenceError(null)
}

export function startPtRun(routineId: number): void {
  if (ptRun.routineId === routineId) return
  batch(() => {
    if (ptRun.routineId !== null) {
      setPausedRuns(String(ptRun.routineId), structuredClone(unwrap(ptRun)))
    }
    const resumed = pausedRuns[String(routineId)]
    const next = resumed ? structuredClone(unwrap(resumed)) : { ...emptyState(), routineId, startedAt: Date.now() }
    setPausedRuns(produce(runs => { delete runs[String(routineId)] }))
    setPtRun(reconcile(next, RECONCILE_BY_INDEX))
  })
}

export function clearPtRun(routineId: number | null = ptRun.routineId): void {
  batch(() => {
    if (routineId !== null) setPausedRuns(produce(runs => { delete runs[String(routineId)] }))
    if (ptRun.routineId === routineId) setPtRun(reconcile(emptyState(), RECONCILE_BY_INDEX))
  })
}

/** Reset all drafts, for test isolation. */
export function clearAllPtRuns(): void {
  batch(() => {
    setPausedRuns(reconcile({}, RECONCILE_BY_INDEX))
    setPtRun(reconcile(emptyState(), RECONCILE_BY_INDEX))
  })
}

/** Applies `update` to whichever run owns `routineId` — the live one or a parked one. */
function mutateRun(routineId: number | null, update: (state: PtRunState) => void): void {
  const fn = produce(update)
  if (routineId === ptRun.routineId) setPtRun(fn)
  else if (routineId !== null && getPtRun(routineId)) setPausedRuns(String(routineId), fn)
}

/** The sets of one exercise, in set-number order. Empty until the run seeds them. */
export function ptSetsFor(ptExerciseId: number, routineId = ptRun.routineId): PtRunSet[] {
  return (routineId === null ? ptRun : getPtRun(routineId))?.sets[String(ptExerciseId)] ?? []
}

/**
 * Grow an exercise's set list to its prescribed length, leaving what is already
 * there alone.
 *
 * Called on load, and deliberately one-way: it never shrinks. A run that added a
 * fourth set keeps it, and so does one restored from a v1 draft that only knew
 * about the sets which had been ticked.
 */
export function ensurePtSets(ptExerciseId: number, count: number, routineId = ptRun.routineId): void {
  if (ptSetsFor(ptExerciseId, routineId).length >= count) return
  mutateRun(routineId, state => {
    const list = (state.sets[String(ptExerciseId)] ??= [])
    while (list.length < count) list.push(emptySet())
  })
}

export function isPtSetDone(ptExerciseId: number, setNumber: number, routineId = ptRun.routineId): boolean {
  return ptSetsFor(ptExerciseId, routineId)[setNumber - 1]?.done ?? false
}

export function togglePtSet(ptExerciseId: number, setNumber: number, routineId = ptRun.routineId): void {
  mutateRun(routineId, state => {
    const list = (state.sets[String(ptExerciseId)] ??= [])
    while (list.length < setNumber) list.push(emptySet())
    list[setNumber - 1].done = !list[setNumber - 1].done
  })
}

/**
 * Equipment, as opposed to effort.
 *
 * Swapping to a lighter band or a taller box is a change to the rest of the
 * session, not to one set — you do not re-rig between every rep. Reps, hold time
 * and distance are what you managed on that set alone and never carry.
 */
const CARRIED_FIELDS = ['weight', 'band', 'equipmentHeight', 'equipmentHeightUnit', 'distanceUnit'] as const

const carriedOnly = (patch: Partial<PtRunSet>): Partial<PtRunSet> => {
  const out: Partial<PtRunSet> = {}
  for (const field of CARRIED_FIELDS) {
    if (field in patch) (out as Record<string, unknown>)[field] = patch[field]
  }
  return out
}

/**
 * Record what a set was, carrying an equipment change forward.
 *
 * The patch writes through to later sets that are not yet done, and stops at the
 * first one that is: a set already recorded is a fact about what happened, not a
 * default waiting to be overwritten. Sets can be completed in any order, so this
 * is defined on done-ness rather than on position.
 */
export function setPtSetFields(
  ptExerciseId: number,
  setNumber: number,
  patch: Partial<PtRunSet>,
  routineId = ptRun.routineId,
): void {
  mutateRun(routineId, state => {
    const list = (state.sets[String(ptExerciseId)] ??= [])
    while (list.length < setNumber) list.push(emptySet())
    Object.assign(list[setNumber - 1], patch)

    const carried = carriedOnly(patch)
    if (Object.keys(carried).length === 0) return
    for (let i = setNumber; i < list.length && !list[i].done; i++) {
      Object.assign(list[i], carried)
    }
  })
}

/** Append a set, inheriting the equipment the last one was done with. */
export function addPtSet(ptExerciseId: number, routineId = ptRun.routineId): void {
  mutateRun(routineId, state => {
    const list = (state.sets[String(ptExerciseId)] ??= [])
    list.push({ ...carriedOnly(list[list.length - 1] ?? {}), done: false })
  })
}

/** Drop a set. The ones after it move up, so set numbers stay contiguous. */
export function removePtSet(ptExerciseId: number, setNumber: number, routineId = ptRun.routineId): void {
  mutateRun(routineId, state => {
    const list = state.sets[String(ptExerciseId)]
    if (!list || setNumber < 1 || setNumber > list.length) return
    list.splice(setNumber - 1, 1)
  })
}

export function setPtExerciseNote(ptExerciseId: number, note: string, routineId = ptRun.routineId): void {
  if (routineId === ptRun.routineId) setPtRun('exerciseNotes', String(ptExerciseId), note)
  else if (routineId !== null && getPtRun(routineId)) setPausedRuns(String(routineId), 'exerciseNotes', String(ptExerciseId), note)
}

export function getPtExerciseNote(ptExerciseId: number, routineId = ptRun.routineId): string {
  return (routineId === null ? ptRun : getPtRun(routineId))?.exerciseNotes[String(ptExerciseId)] ?? ''
}

export function setPtNotes(notes: string, routineId = ptRun.routineId): void {
  if (routineId === ptRun.routineId) setPtRun('notes', notes)
  else if (routineId !== null && getPtRun(routineId)) setPausedRuns(String(routineId), 'notes', notes)
}

/** Per-exercise notes keyed by number, the shape `commitPtRun` takes. */
export function ptExerciseNotesForCommit(routineId = ptRun.routineId): Record<number, string> {
  const out: Record<number, string> = {}
  for (const [id, note] of Object.entries((routineId === null ? ptRun : getPtRun(routineId))?.exerciseNotes ?? {})) {
    const numeric = Number(id)
    if (Number.isInteger(numeric)) out[numeric] = note
  }
  return out
}
