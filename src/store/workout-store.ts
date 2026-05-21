import { createStore, produce } from 'solid-js/store'
import { createRoot, createEffect } from 'solid-js'
import type { Session, Set, AccessorySet } from '../types/domain'

export type RestType = 'normal' | 'transition' | 'fail'

interface LoggedSet extends Set {
  id?: number
}

interface ActiveAccessory {
  exerciseId: number
  exerciseName: string
  tm: number
  calculatedWeight: number
  loggedSets: Partial<AccessorySet>[]
}

interface WorkoutState {
  activeSession: Session | null
  loggedSets: LoggedSet[]
  currentSetIndex: number
  isResting: boolean
  restStartedAt: number | null
  restType: RestType
  activeAccessories: ActiveAccessory[]
  notes: string
}

const STORAGE_KEY = 'workout-store'
const STORAGE_VERSION = 1

function loadFromStorage(): Partial<WorkoutState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: number; state?: Partial<WorkoutState> }
    if (parsed.v !== STORAGE_VERSION) return {}
    return parsed.state ?? {}
  } catch {
    return {}
  }
}

export const [workout, setWorkout] = createStore<WorkoutState>({
  activeSession: null,
  loggedSets: [],
  currentSetIndex: 0,
  isResting: false,
  restStartedAt: null,
  restType: 'normal',
  activeAccessories: [],
  notes: '',
  ...loadFromStorage(),
})

createRoot(() => {
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
})

export function startSession(session: Session) {
  setWorkout({
    activeSession: session,
    loggedSets: [],
    currentSetIndex: 0,
    isResting: false,
    restStartedAt: null,
    restType: 'normal',
    activeAccessories: [],
    notes: '',
  })
}

export function logSet(set: LoggedSet) {
  setWorkout('loggedSets', (prev) => [...prev, set])
}

export function editSet(index: number, updates: Partial<LoggedSet>) {
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

export function completeSession() {
  if (workout.activeSession) {
    setWorkout('activeSession', 'status', 'completed')
  }
}

export function clearSession() {
  setWorkout({
    activeSession: null,
    loggedSets: [],
    currentSetIndex: 0,
    isResting: false,
    restStartedAt: null,
    restType: 'normal',
    activeAccessories: [],
    notes: '',
  })
}

export function setNotes(notes: string) {
  setWorkout('notes', notes)
}
