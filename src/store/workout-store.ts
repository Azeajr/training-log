import { createStore, produce } from 'solid-js/store'
import { createEffect } from 'solid-js'
import type { Session, Set, AccessorySet } from '../types/domain'

export type RestType = 'normal' | 'transition' | 'fail'

interface ActiveAccessory {
  exerciseId: number
  exerciseName: string
  tm: number
  calculatedWeight: number
  loggedSets: Partial<AccessorySet>[]
}

interface WorkoutState {
  activeSession: Session | null
  loggedSets: Set[]
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
  'currentSetIndex',
  'isResting',
  'restStartedAt',
  'restType',
  'activeAccessories',
  'notes',
] as const satisfies readonly (keyof WorkoutState)[]

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
      if (k in src) (out as Record<string, unknown>)[k] = src[k]
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

export function startRest(type: RestType) {
  setWorkout({ isResting: true, restStartedAt: Date.now(), restType: type })
}

export function stopRest() {
  setWorkout({ isResting: false, restStartedAt: null, restType: 'normal' })
}

export function addAccessory(accessory: ActiveAccessory) {
  setWorkout('activeAccessories', (prev) => [...prev, accessory])
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

export function clearSession() {
  setWorkout(emptyState())
}

export function setNotes(notes: string) {
  setWorkout('notes', notes)
}
