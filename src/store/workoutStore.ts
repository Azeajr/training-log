import { create } from 'zustand'
import type { Session, Set, AccessorySet } from '../db/db'

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
  lastAmrapFailed: boolean
  activeAccessories: ActiveAccessory[]

  startSession: (session: Session) => void
  logSet: (set: LoggedSet) => void
  editSet: (index: number, updates: Partial<LoggedSet>) => void
  advanceSet: () => void
  startRest: (failed?: boolean) => void
  stopRest: () => void
  addAccessory: (accessory: ActiveAccessory) => void
  logAccessorySet: (exerciseId: number, set: Partial<AccessorySet>) => void
  completeSession: () => void
  clearSession: () => void
}

export const useWorkoutStore = create<WorkoutState>((set) => ({
  activeSession: null,
  loggedSets: [],
  currentSetIndex: 0,
  isResting: false,
  restStartedAt: null,
  lastAmrapFailed: false,
  activeAccessories: [],

  startSession: (session) => set({
    activeSession: session,
    loggedSets: [],
    currentSetIndex: 0,
    isResting: false,
    restStartedAt: null,
    lastAmrapFailed: false,
    activeAccessories: [],
  }),

  logSet: (newSet) => set((state) => ({
    loggedSets: [...state.loggedSets, newSet],
  })),

  editSet: (index, updates) => set((state) => ({
    loggedSets: state.loggedSets.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    ),
  })),

  advanceSet: () => set((state) => ({
    currentSetIndex: state.currentSetIndex + 1,
  })),

  startRest: (failed = false) => set({
    isResting: true,
    restStartedAt: Date.now(),
    lastAmrapFailed: failed,
  }),

  stopRest: () => set({
    isResting: false,
    restStartedAt: null,
    lastAmrapFailed: false,
  }),

  addAccessory: (accessory) => set((state) => ({
    activeAccessories: [...state.activeAccessories, accessory],
  })),

  logAccessorySet: (exerciseId, newSet) => set((state) => ({
    activeAccessories: state.activeAccessories.map((a) =>
      a.exerciseId === exerciseId
        ? { ...a, loggedSets: [...a.loggedSets, newSet] }
        : a
    ),
  })),

  completeSession: () => set((state) => ({
    activeSession: state.activeSession
      ? { ...state.activeSession, status: 'completed' }
      : null,
  })),

  clearSession: () => set({
    activeSession: null,
    loggedSets: [],
    currentSetIndex: 0,
    isResting: false,
    restStartedAt: null,
    lastAmrapFailed: false,
    activeAccessories: [],
  }),
}))
