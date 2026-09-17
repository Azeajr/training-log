import { createStore, produce } from 'solid-js/store'
import { createEffect, createSignal } from 'solid-js'

/**
 * The in-progress PT run.
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

function loadFromStorage(): Partial<PtRunState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown }
    if (parsed.v !== STORAGE_VERSION) return {}
    const state = parsed.state
    if (state == null || typeof state !== 'object' || Array.isArray(state)) return {}
    const src = state as Record<string, unknown>
    const out: Partial<PtRunState> = {}
    for (const k of PERSISTED_KEYS) {
      if (k in src && PERSISTED_VALIDATORS[k](src[k])) (out as Record<string, unknown>)[k] = src[k]
    }
    return out
  } catch {
    return {}
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

export const [ptRun, setPtRun] = createStore<PtRunState>({
  ...emptyState(),
  ...loadFromStorage(),
})

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
  setPtRun({ ...emptyState(), routineId, startedAt: Date.now() })
}

export function clearPtRun(): void {
  setPtRun(emptyState())
}

export function isPtSetDone(ptExerciseId: number, setNumber: number): boolean {
  return ptRun.done.includes(key(ptExerciseId, setNumber))
}

export function togglePtSet(ptExerciseId: number, setNumber: number): void {
  const k = key(ptExerciseId, setNumber)
  setPtRun(produce(state => {
    const at = state.done.indexOf(k)
    if (at === -1) state.done.push(k)
    else state.done.splice(at, 1)
  }))
}

export function setPtExerciseNote(ptExerciseId: number, note: string): void {
  setPtRun('exerciseNotes', String(ptExerciseId), note)
}

export function getPtExerciseNote(ptExerciseId: number): string {
  return ptRun.exerciseNotes[String(ptExerciseId)] ?? ''
}

export function setPtNotes(notes: string): void {
  setPtRun('notes', notes)
}

/** Per-exercise notes keyed by number, the shape `commitPtRun` takes. */
export function ptExerciseNotesForCommit(): Record<number, string> {
  const out: Record<number, string> = {}
  for (const [id, note] of Object.entries(ptRun.exerciseNotes)) {
    const numeric = Number(id)
    if (Number.isInteger(numeric)) out[numeric] = note
  }
  return out
}
