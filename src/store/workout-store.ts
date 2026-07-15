import { createStore, produce } from 'solid-js/store'
import { createEffect } from 'solid-js'
import type { Session, Set, AccessorySet } from '../types/domain'
import type { AssistanceSlot } from '../lib/assistance'

export type RestType = 'normal' | 'transition' | 'fail'

export interface ActiveAccessory {
  exerciseId: number
  exerciseName: string
  tm: number
  calculatedWeight: number
  loggedSets: Partial<AccessorySet>[]
  // Which assistance slot this fills. Absent (legacy/extra) accessories append
  // freely; the three fixed slots hold one exercise each.
  slot?: AssistanceSlot
  // Free-text note for this exercise within this session. Optional rather than
  // defaulted to '' so accessories rehydrated from a pre-feature localStorage
  // snapshot (see PERSISTED_VALIDATORS) don't need a shape migration.
  notes?: string
}

interface WorkoutState {
  activeSession: Session | null
  loggedSets: Set[]
  // Cross-lift supplemental sets live apart from loggedSets so they can be
  // logged independently (any block, any time) without disturbing the linear
  // currentSetIndex/loggedSets positional model the own-lift sets rely on.
  loggedCrossSets: Set[]
  currentSetIndex: number
  isResting: boolean
  restStartedAt: number | null
  restType: RestType
  activeAccessories: ActiveAccessory[]
  notes: string
}

const STORAGE_KEY = 'workout-store'
const STORAGE_VERSION = 1

// Allowlist of keys persisted to localStorage. Anything else is discarded on
// rehydrate — defense in depth so a corrupted/tampered entry can't graft
// extra fields onto the reactive store.
const PERSISTED_KEYS = [
  'activeSession',
  'loggedSets',
  'loggedCrossSets',
  'currentSetIndex',
  'isResting',
  'restStartedAt',
  'restType',
  'activeAccessories',
  'notes',
] as const satisfies readonly (keyof WorkoutState)[]

const isPlainObject = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Per-key shape checks for rehydrate. A wrong-typed value under an allowlisted
// key must be dropped, not grafted — a string where loggedSets belongs crashes
// every `.filter()`/`.map()` consumer on the next render.
const PERSISTED_VALIDATORS: Record<(typeof PERSISTED_KEYS)[number], (v: unknown) => boolean> = {
  activeSession: v => v === null || isPlainObject(v),
  loggedSets: Array.isArray,
  loggedCrossSets: Array.isArray,
  currentSetIndex: v => Number.isInteger(v) && (v as number) >= 0,
  isResting: v => typeof v === 'boolean',
  restStartedAt: v => v === null || typeof v === 'number',
  restType: v => v === 'normal' || v === 'transition' || v === 'fail',
  activeAccessories: Array.isArray,
  notes: v => typeof v === 'string',
}

function loadFromStorage(): Partial<WorkoutState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: number; state?: unknown }
    if (parsed.v !== STORAGE_VERSION) return {}
    const state = parsed.state
    if (state == null || typeof state !== 'object' || Array.isArray(state)) return {}
    const src = state as Record<string, unknown>
    const out: Partial<WorkoutState> = {}
    for (const k of PERSISTED_KEYS) {
      if (k in src && PERSISTED_VALIDATORS[k](src[k])) (out as Record<string, unknown>)[k] = src[k]
    }
    return out
  } catch {
    return {}
  }
}

// Factory, not a shared constant: the store's produce() helpers mutate arrays
// in place, so each reset needs fresh array instances.
const emptyState = (): WorkoutState => ({
  activeSession: null,
  loggedSets: [],
  loggedCrossSets: [],
  currentSetIndex: 0,
  isResting: false,
  restStartedAt: null,
  restType: 'normal',
  activeAccessories: [],
  notes: '',
})

export const [workout, setWorkout] = createStore<WorkoutState>({
  ...emptyState(),
  ...loadFromStorage(),
})

// Must be called inside a reactive root (e.g. `render(() => { setupWorkoutPersistence(); ... })`).
// Registers a createEffect that mirrors workout state into localStorage on every change.
export function setupWorkoutPersistence() {
  createEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: STORAGE_VERSION,
      state: {
        activeSession:    workout.activeSession,
        loggedSets:       workout.loggedSets,
        loggedCrossSets:  workout.loggedCrossSets,
        currentSetIndex:  workout.currentSetIndex,
        isResting:        workout.isResting,
        restStartedAt:    workout.restStartedAt,
        restType:         workout.restType,
        activeAccessories: workout.activeAccessories,
        notes:            workout.notes,
      },
    }))
  })
}

export function startSession(session: Session) {
  setWorkout({ ...emptyState(), activeSession: session })
}

export function logSet(set: Set) {
  setWorkout('loggedSets', (prev) => [...prev, set])
}

export function editSet(index: number, updates: Partial<Set>) {
  setWorkout('loggedSets', index, updates)
}

export function advanceSet() {
  setWorkout('currentSetIndex', (i) => i + 1)
}

export function deleteLastSet() {
  if (workout.loggedSets.length === 0) return
  setWorkout(produce((s) => {
    s.loggedSets.pop()
    s.currentSetIndex = Math.max(0, s.currentSetIndex - 1)
  }))
}

// Cross-lift supplemental sets are tracked separately from the linear loggedSets
// so each block can be logged out of order, like accessories. No shared cursor:
// a block's "next set" is derived from how many of its sets are already logged.
export function logCrossSet(set: Set) {
  setWorkout('loggedCrossSets', (prev) => [...prev, set])
}

export function editCrossSet(index: number, updates: Partial<Set>) {
  setWorkout('loggedCrossSets', index, updates)
}

export function deleteLastCrossSetFor(liftId: number) {
  setWorkout(produce((s) => {
    for (let i = s.loggedCrossSets.length - 1; i >= 0; i--) {
      if (s.loggedCrossSets[i].liftId === liftId) {
        s.loggedCrossSets.splice(i, 1)
        return
      }
    }
  }))
}

export function startRest(type: RestType) {
  setWorkout({ isResting: true, restStartedAt: Date.now(), restType: type })
}

export function stopRest() {
  setWorkout({ isResting: false, restStartedAt: null, restType: 'normal' })
}

export function addAccessory(accessory: ActiveAccessory) {
  setWorkout('activeAccessories', (prev) => {
    // A fixed slot (push/pull/legs_core) holds exactly one exercise:
    // picking again replaces the current occupant. Extras (and legacy rows with
    // no slot) just append.
    const isFixedSlot = accessory.slot != null && accessory.slot !== 'extra'
    const kept = isFixedSlot ? prev.filter((a) => a.slot !== accessory.slot) : prev
    return [...kept, accessory]
  })
}

export function logAccessorySet(exerciseId: number, set: Partial<AccessorySet>) {
  setWorkout('activeAccessories', (a) => a.exerciseId === exerciseId, produce((a) => {
    a.loggedSets.push(set)
  }))
}

export function editAccessorySet(
  exerciseId: number,
  setIndex: number,
  updates: Partial<AccessorySet>
) {
  setWorkout(
    'activeAccessories',
    (a) => a.exerciseId === exerciseId,
    'loggedSets',
    setIndex,
    updates
  )
}

export function deleteLastAccessorySet(exerciseId: number) {
  setWorkout('activeAccessories', (a) => a.exerciseId === exerciseId, produce((a) => {
    if (a.loggedSets.length > 0) a.loggedSets.pop()
  }))
}

export function removeAccessory(exerciseId: number) {
  setWorkout('activeAccessories', (prev) => prev.filter((a) => a.exerciseId !== exerciseId))
}

export function setAccessoryNotes(exerciseId: number, notes: string) {
  setWorkout('activeAccessories', (a) => a.exerciseId === exerciseId, 'notes', notes)
}

export function clearSession() {
  setWorkout(emptyState())
}

export function setNotes(notes: string) {
  setWorkout('notes', notes)
}
