import { describe, it, expect, beforeEach } from 'vitest'
import {
  workout,
  setWorkout,
  startSession,
  logSet,
  advanceSet,
  deleteLastSet,
  clearSession,
  startRest,
  stopRest,
  logAccessorySet,
  editAccessorySet,
  deleteLastAccessorySet,
  removeAccessory,
  addAccessory,
  setNotes,
} from './workoutStore'

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
  sessionId: 1,
  type: 'main' as const,
  setNumber: 1,
  weight: 170,
  reps: 5,
  isAmrap: false,
}

const makeMockAccessory = (exerciseId = 42) => ({
  exerciseId,
  exerciseName: exerciseId === 42 ? 'Curl' : 'Row',
  tm: 100,
  calculatedWeight: 60,
  loggedSets: [] as object[],
})

beforeEach(() => clearSession())

describe('startSession', () => {
  it('sets activeSession', () => {
    startSession(MOCK_SESSION)
    expect(workout.activeSession?.id).toBe(1)
    expect(workout.activeSession?.liftId).toBe(1)
  })

  it('resets loggedSets and index', () => {
    startSession(MOCK_SESSION)
    logSet(MOCK_SET)
    advanceSet()
    startSession({ ...MOCK_SESSION, id: 2 })
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
  })

  it('clears rest state', () => {
    startRest('normal')
    startSession(MOCK_SESSION)
    expect(workout.isResting).toBe(false)
    expect(workout.restStartedAt).toBeNull()
  })
})

describe('logSet / advanceSet', () => {
  it('appends set to loggedSets', () => {
    startSession(MOCK_SESSION)
    logSet(MOCK_SET)
    expect(workout.loggedSets).toHaveLength(1)
    expect(workout.loggedSets[0].weight).toBe(170)
    expect(workout.loggedSets[0].reps).toBe(5)
  })

  it('advanceSet increments currentSetIndex', () => {
    startSession(MOCK_SESSION)
    expect(workout.currentSetIndex).toBe(0)
    advanceSet()
    expect(workout.currentSetIndex).toBe(1)
  })

  it('logs multiple sets correctly', () => {
    startSession(MOCK_SESSION)
    logSet(MOCK_SET)
    advanceSet()
    logSet({ ...MOCK_SET, setNumber: 2, weight: 185 })
    advanceSet()
    expect(workout.loggedSets).toHaveLength(2)
    expect(workout.loggedSets[1].weight).toBe(185)
    expect(workout.currentSetIndex).toBe(2)
  })
})

describe('deleteLastSet', () => {
  it('removes last set and decrements index', () => {
    startSession(MOCK_SESSION)
    logSet(MOCK_SET)
    advanceSet()
    deleteLastSet()
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
  })

  it('no-ops when loggedSets is empty', () => {
    startSession(MOCK_SESSION)
    deleteLastSet()
    expect(workout.currentSetIndex).toBe(0)
  })

  it('does not go below 0', () => {
    clearSession()
    deleteLastSet()
    expect(workout.currentSetIndex).toBe(0)
  })
})

describe('startRest / stopRest', () => {
  it('startRest marks isResting true with type', () => {
    startRest('normal')
    expect(workout.isResting).toBe(true)
    expect(workout.restType).toBe('normal')
  })

  it('restStartedAt is a recent timestamp', () => {
    const before = Date.now()
    startRest('transition')
    expect(workout.restStartedAt).toBeGreaterThanOrEqual(before)
  })

  it('stopRest clears rest state', () => {
    startRest('fail')
    stopRest()
    expect(workout.isResting).toBe(false)
    expect(workout.restStartedAt).toBeNull()
    expect(workout.restType).toBe('normal')
  })
})

describe('clearSession', () => {
  it('resets all state to defaults', () => {
    startSession(MOCK_SESSION)
    logSet(MOCK_SET)
    startRest('transition')
    setNotes('felt great')
    clearSession()
    expect(workout.activeSession).toBeNull()
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
    expect(workout.isResting).toBe(false)
    expect(workout.notes).toBe('')
  })
})

describe('setNotes', () => {
  it('updates notes field', () => {
    setNotes('PR day')
    expect(workout.notes).toBe('PR day')
  })
})

describe('accessory sets', () => {
  beforeEach(() => {
    clearSession()
    addAccessory(makeMockAccessory())
  })

  it('logAccessorySet appends set to correct accessory', () => {
    logAccessorySet(42, { weight: 60, reps: 10, setNumber: 1 })
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(1)
    expect(workout.activeAccessories[0].loggedSets[0].reps).toBe(10)
  })

  it('logAccessorySet does not affect other accessories', () => {
    addAccessory(makeMockAccessory(99))
    logAccessorySet(42, { weight: 60, reps: 10, setNumber: 1 })
    expect(workout.activeAccessories[1].loggedSets).toHaveLength(0)
  })

  it('editAccessorySet updates set at given index', () => {
    logAccessorySet(42, { weight: 60, reps: 10, setNumber: 1 })
    editAccessorySet(42, 0, { reps: 12 })
    expect(workout.activeAccessories[0].loggedSets[0].reps).toBe(12)
  })

  it('deleteLastAccessorySet removes last set', () => {
    logAccessorySet(42, { weight: 60, reps: 10, setNumber: 1 })
    logAccessorySet(42, { weight: 60, reps: 10, setNumber: 2 })
    deleteLastAccessorySet(42)
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(1)
  })

  it('removeAccessory removes the accessory entirely', () => {
    removeAccessory(42)
    expect(workout.activeAccessories).toHaveLength(0)
  })
})

describe('setWorkout direct state', () => {
  it('can bulk-set state via setWorkout', () => {
    setWorkout({ notes: 'direct', currentSetIndex: 3 })
    expect(workout.notes).toBe('direct')
    expect(workout.currentSetIndex).toBe(3)
  })
})
