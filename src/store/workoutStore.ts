import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, Set, AccessorySet } from '../db/db'

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

  startSession: (session: Session) => void
  logSet: (set: LoggedSet) => void
  editSet: (index: number, updates: Partial<LoggedSet>) => void
  advanceSet: () => void
  startRest: (type: RestType) => void
  stopRest: () => void
  addAccessory: (accessory: ActiveAccessory) => void
  logAccessorySet: (exerciseId: number, set: Partial<AccessorySet>) => void
  completeSession: () => void
  clearSession: () => void
  setNotes: (notes: string) => void
}

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set) => ({
      activeSession: null,
      loggedSets: [],
      currentSetIndex: 0,
      isResting: false,
      restStartedAt: null,
      restType: 'normal' as RestType,
      activeAccessories: [],
      notes: '',

      startSession: (session) => set({
        activeSession: session,
        loggedSets: [],
        currentSetIndex: 0,
        isResting: false,
        restStartedAt: null,
        restType: 'normal',
        activeAccessories: [],
        notes: '',
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

      startRest: (type) => set({
        isResting: true,
        restStartedAt: Date.now(),
        restType: type,
      }),

      stopRest: () => set({
        isResting: false,
        restStartedAt: null,
        restType: 'normal',
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
        restType: 'normal',
        activeAccessories: [],
        notes: '',
      }),

      setNotes: (notes) => set({ notes }),
    }),
    { name: 'workout-store' }
  )
)
