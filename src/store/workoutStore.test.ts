// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { useWorkoutStore } from './workoutStore'

const MOCK_SESSION = {
  id: 1,
  cycleId: 1,
  liftId: 1,
  week: 1 as const,
  date: new Date('2026-01-01'),
  notes: null,
  status: 'pending' as const,
}

const MOCK_SET = {
  id: undefined,
  sessionId: 1,
  type: 'main' as const,
  setNumber: 1,
  weight: 170,
  reps: 5,
  isAmrap: false,
}

function resetStore() {
  useWorkoutStore.setState({
    activeSession: null,
    loggedSets: [],
    currentSetIndex: 0,
    isResting: false,
    restStartedAt: null,
    lastAmrapFailed: false,
    activeAccessories: [],
    notes: '',
  })
}

describe('workoutStore', () => {
  beforeEach(resetStore)

  describe('startSession', () => {
    it('sets activeSession and resets all other state', () => {
      // Put some state in first
      useWorkoutStore.getState().logSet(MOCK_SET)
      useWorkoutStore.getState().advanceSet()
      useWorkoutStore.getState().startRest()

      useWorkoutStore.getState().startSession(MOCK_SESSION)
      const s = useWorkoutStore.getState()

      expect(s.activeSession).toEqual(MOCK_SESSION)
      expect(s.loggedSets).toHaveLength(0)
      expect(s.currentSetIndex).toBe(0)
      expect(s.isResting).toBe(false)
      expect(s.restStartedAt).toBeNull()
      expect(s.notes).toBe('')
    })
  })

  describe('logSet / advanceSet', () => {
    it('appends to loggedSets', () => {
      useWorkoutStore.getState().logSet(MOCK_SET)
      expect(useWorkoutStore.getState().loggedSets).toHaveLength(1)
      expect(useWorkoutStore.getState().loggedSets[0].weight).toBe(170)
    })

    it('advanceSet increments currentSetIndex', () => {
      useWorkoutStore.getState().advanceSet()
      useWorkoutStore.getState().advanceSet()
      expect(useWorkoutStore.getState().currentSetIndex).toBe(2)
    })

    it('editSet updates reps at the given index', () => {
      useWorkoutStore.getState().logSet(MOCK_SET)
      useWorkoutStore.getState().logSet({ ...MOCK_SET, setNumber: 2, reps: 3 })
      useWorkoutStore.getState().editSet(0, { reps: 8 })

      const sets = useWorkoutStore.getState().loggedSets
      expect(sets[0].reps).toBe(8)
      expect(sets[1].reps).toBe(3)
    })

    it('editSet can store a DB id', () => {
      useWorkoutStore.getState().logSet(MOCK_SET)
      useWorkoutStore.getState().editSet(0, { id: 42 })
      expect(useWorkoutStore.getState().loggedSets[0].id).toBe(42)
    })
  })

  describe('rest timer', () => {
    it('startRest sets isResting and records timestamp', () => {
      const before = Date.now()
      useWorkoutStore.getState().startRest()
      const after = Date.now()

      const s = useWorkoutStore.getState()
      expect(s.isResting).toBe(true)
      expect(s.restStartedAt).toBeGreaterThanOrEqual(before)
      expect(s.restStartedAt).toBeLessThanOrEqual(after)
      expect(s.lastAmrapFailed).toBe(false)
    })

    it('startRest(true) marks failed AMRAP', () => {
      useWorkoutStore.getState().startRest(true)
      expect(useWorkoutStore.getState().lastAmrapFailed).toBe(true)
    })

    it('stopRest clears timer state', () => {
      useWorkoutStore.getState().startRest()
      useWorkoutStore.getState().stopRest()

      const s = useWorkoutStore.getState()
      expect(s.isResting).toBe(false)
      expect(s.restStartedAt).toBeNull()
      expect(s.lastAmrapFailed).toBe(false)
    })
  })

  describe('notes', () => {
    it('setNotes updates notes', () => {
      useWorkoutStore.getState().setNotes('felt strong today')
      expect(useWorkoutStore.getState().notes).toBe('felt strong today')
    })
  })

  describe('clearSession', () => {
    it('resets everything to initial values', () => {
      useWorkoutStore.getState().startSession(MOCK_SESSION)
      useWorkoutStore.getState().logSet(MOCK_SET)
      useWorkoutStore.getState().advanceSet()
      useWorkoutStore.getState().startRest()
      useWorkoutStore.getState().setNotes('some notes')

      useWorkoutStore.getState().clearSession()
      const s = useWorkoutStore.getState()

      expect(s.activeSession).toBeNull()
      expect(s.loggedSets).toHaveLength(0)
      expect(s.currentSetIndex).toBe(0)
      expect(s.isResting).toBe(false)
      expect(s.restStartedAt).toBeNull()
      expect(s.notes).toBe('')
    })
  })

  describe('accessories', () => {
    it('addAccessory appends to activeAccessories', () => {
      const acc = { exerciseId: 1, exerciseName: 'Chinups', tm: 0, calculatedWeight: 0, loggedSets: [] }
      useWorkoutStore.getState().addAccessory(acc)
      expect(useWorkoutStore.getState().activeAccessories).toHaveLength(1)
    })

    it('logAccessorySet appends to the matching exercise', () => {
      const acc = { exerciseId: 5, exerciseName: 'Curls', tm: 50, calculatedWeight: 40, loggedSets: [] }
      useWorkoutStore.getState().addAccessory(acc)
      useWorkoutStore.getState().logAccessorySet(5, { setNumber: 1, reps: 12, weight: 40, duration: null, distance: null })

      const result = useWorkoutStore.getState().activeAccessories[0]
      expect(result.loggedSets).toHaveLength(1)
      expect(result.loggedSets[0].reps).toBe(12)
    })
  })
})
