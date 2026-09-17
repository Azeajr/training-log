import { createStore, produce, reconcile, unwrap } from 'solid-js/store'
import { batch, createEffect, createSignal } from 'solid-js'

/**
 * The in-progress PT session, with a draft per included routine.
 *
 * Deliberately shaped unlike `workout-store`: there is no `activeSession`,
 * because a PT run has no database row until it is finished. Ticking a box
 * moves a key in `done` and nothing else, so DISCARD is a `clearPtRun()` with
 * no row to delete and no status to reconcile — the whole store-vs-DB drift
 * class in COMMON_MISTAKES #5 has nothing to act on here.
 *
 * It still persists to localStorage, for the ordinary reason: a rehab session
 * is done on the floor with the phone locking between exercises, and a reload
 * must not lose which sets were already ticked.
 */
interface PtRunState {
  routineId: number | null
  /** Epoch ms the run began; becomes the session's date on commit. */
  startedAt: number | null
  /** Ticked sets, as `${ptExerciseId}:${setNumber}`. */
  done: string[]
  /** Per-exercise note, keyed by ptExercise id (as a string — JSON has no numeric keys). */
  exerciseNotes: Record<string, string>
  notes: string
}

const STORAGE_KEY = 'pt-run'
const STORAGE_VERSION = 1

const PERSISTED_KEYS = [
  'routineId',
  'startedAt',
  'done',
  'exerciseNotes',
  'notes',
] as const satisfies readonly (keyof PtRunState)[]

const isPlainObject = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Per-key shape checks, for the same reason workout-store has them: a
// wrong-typed value under an allowlisted key must be dropped rather than
// grafted onto the reactive store, where the next render would crash on it.
const PERSISTED_VALIDATORS: Record<(typeof PERSISTED_KEYS)[number], (v: unknown) => boolean> = {
  routineId: v => v === null || Number.isInteger(v),
  startedAt: v => v === null || typeof v === 'number',
  done: v => Array.isArray(v) && v.every(x => typeof x === 'string'),
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

function loadFromStorage(): { current: Partial<PtRunState>; paused: Record<string, PtRunState> } {
  const empty = { current: {}, paused: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown; paused?: unknown }
    if (parsed.v !== STORAGE_VERSION) return empty
    const current = validateState(parsed.state)
    const paused: Record<string, PtRunState> = {}
    if (isPlainObject(parsed.paused)) {
      for (const [id, value] of Object.entries(parsed.paused as object)) {
        const run = validateState(value)
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

// Factory, not a shared constant: `done` is mutated in place by produce().
const emptyState = (): PtRunState => ({
  routineId: null,
  startedAt: null,
  done: [],
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
          done: ptRun.done,
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

const key = (ptExerciseId: number, setNumber: number): string => `${ptExerciseId}:${setNumber}`

export function startPtRun(routineId: number): void {
  if (ptRun.routineId === routineId) return
  batch(() => {
    if (ptRun.routineId !== null) {
      setPausedRuns(String(ptRun.routineId), structuredClone(unwrap(ptRun)))
    }
    const resumed = pausedRuns[String(routineId)]
    const next = resumed ? structuredClone(unwrap(resumed)) : { ...emptyState(), routineId, startedAt: Date.now() }
    setPausedRuns(produce(runs => { delete runs[String(routineId)] }))
    setPtRun(reconcile(next))
  })
}

export function clearPtRun(routineId: number | null = ptRun.routineId): void {
  batch(() => {
    if (routineId !== null) setPausedRuns(produce(runs => { delete runs[String(routineId)] }))
    if (ptRun.routineId === routineId) setPtRun(reconcile(emptyState()))
  })
}

/** Reset all drafts, for test isolation. */
export function clearAllPtRuns(): void {
  batch(() => {
    setPausedRuns(reconcile({}))
    setPtRun(reconcile(emptyState()))
  })
}

export function isPtSetDone(ptExerciseId: number, setNumber: number, routineId = ptRun.routineId): boolean {
  return (routineId === null ? ptRun : getPtRun(routineId))?.done.includes(key(ptExerciseId, setNumber)) ?? false
}

export function togglePtSet(ptExerciseId: number, setNumber: number, routineId = ptRun.routineId): void {
  const k = key(ptExerciseId, setNumber)
  const update = produce<PtRunState>(state => {
    const at = state.done.indexOf(k)
    if (at === -1) state.done.push(k)
    else state.done.splice(at, 1)
  })
  if (routineId === ptRun.routineId) setPtRun(update)
  else if (routineId !== null && getPtRun(routineId)) setPausedRuns(String(routineId), update)
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
