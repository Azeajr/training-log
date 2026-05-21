// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import {
  workout, startSession, logSet, editSet, advanceSet, deleteLastSet,
  startRest, stopRest,
  addAccessory, logAccessorySet, editAccessorySet, deleteLastAccessorySet, removeAccessory,
  completeSession, clearSession, setNotes,
} from './workout-store'
import type { Session } from '../types/domain'

const SESSION: Session = {
  id: 42,
  cycleId: 1,
  liftId: 1,
  week: 1,
  date: new Date('2026-01-01'),
  notes: null,
  status: 'pending',
}

beforeEach(() => {
  clearSession()
})

// ─── startSession ─────────────────────────────────────────────────────────────

describe('startSession', () => {
  it('sets activeSession and resets all other fields', () => {
    logSet({ sessionId: 99, type: 'warmup', setNumber: 1, weight: 50, reps: 5, isAmrap: false })
    startSession(SESSION)
    expect(workout.activeSession).toMatchObject({ id: 42 })
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
    expect(workout.isResting).toBe(false)
    expect(workout.restStartedAt).toBeNull()
    expect(workout.restType).toBe('normal')
    expect(workout.activeAccessories).toHaveLength(0)
    expect(workout.notes).toBe('')
  })
})

// ─── logSet / editSet / advanceSet / deleteLastSet ───────────────────────────

describe('logSet', () => {
  it('appends set to loggedSets', () => {
    startSession(SESSION)
    logSet({ sessionId: 42, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false })
    expect(workout.loggedSets).toHaveLength(1)
    expect(workout.loggedSets[0]).toMatchObject({ weight: 45, reps: 5 })
  })

  it('appends multiple sets in order', () => {
    startSession(SESSION)
    logSet({ sessionId: 42, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false })
    logSet({ sessionId: 42, type: 'main',   setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    expect(workout.loggedSets).toHaveLength(2)
    expect(workout.loggedSets[1].type).toBe('main')
  })
})

describe('editSet', () => {
  it('updates the set at the given index', () => {
    startSession(SESSION)
    logSet({ sessionId: 42, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    editSet(0, { reps: 8 })
    expect(workout.loggedSets[0].reps).toBe(8)
    expect(workout.loggedSets[0].weight).toBe(100) // unchanged
  })
})

describe('advanceSet', () => {
  it('increments currentSetIndex by 1', () => {
    startSession(SESSION)
    expect(workout.currentSetIndex).toBe(0)
    advanceSet()
    expect(workout.currentSetIndex).toBe(1)
    advanceSet()
    expect(workout.currentSetIndex).toBe(2)
  })
})

describe('deleteLastSet', () => {
  it('removes the last logged set', () => {
    startSession(SESSION)
    logSet({ sessionId: 42, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false })
    logSet({ sessionId: 42, type: 'main',   setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    advanceSet()
    advanceSet()
    deleteLastSet()
    expect(workout.loggedSets).toHaveLength(1)
    expect(workout.currentSetIndex).toBe(1)
  })

  it('does nothing when no sets logged', () => {
    startSession(SESSION)
    deleteLastSet()
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
  })

  it('does not let currentSetIndex go below 0', () => {
    startSession(SESSION)
    logSet({ sessionId: 42, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false })
    deleteLastSet()
    expect(workout.currentSetIndex).toBe(0)
  })
})

// ─── startRest / stopRest ────────────────────────────────────────────────────

describe('startRest', () => {
  it('sets isResting to true with timestamp and rest type', () => {
    startSession(SESSION)
    const before = Date.now()
    startRest('fail')
    expect(workout.isResting).toBe(true)
    expect(workout.restStartedAt).toBeGreaterThanOrEqual(before)
    expect(workout.restType).toBe('fail')
  })

  it('supports all rest types', () => {
    startSession(SESSION)
    for (const t of ['normal', 'transition', 'fail'] as const) {
      startRest(t)
      expect(workout.restType).toBe(t)
    }
  })
})

describe('stopRest', () => {
  it('clears isResting state', () => {
    startSession(SESSION)
    startRest('normal')
    stopRest()
    expect(workout.isResting).toBe(false)
    expect(workout.restStartedAt).toBeNull()
    expect(workout.restType).toBe('normal')
  })
})

// ─── accessories ─────────────────────────────────────────────────────────────

const makeAcc = () => ({
  exerciseId: 99,
  exerciseName: 'Chinup',
  tm: 50,
  calculatedWeight: 50,
  loggedSets: [] as { setNumber: number; weight: number; reps: number }[],
})

describe('addAccessory', () => {
  it('appends accessory to activeAccessories', () => {
    startSession(SESSION)
    addAccessory(makeAcc())
    expect(workout.activeAccessories).toHaveLength(1)
    expect(workout.activeAccessories[0].exerciseId).toBe(99)
  })
})

describe('logAccessorySet', () => {
  it('appends set to the matching accessory loggedSets', () => {
    startSession(SESSION)
    addAccessory(makeAcc())
    logAccessorySet(99, { setNumber: 1, weight: 50, reps: 8 })
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(1)
    expect(workout.activeAccessories[0].loggedSets[0]).toMatchObject({ reps: 8 })
  })
})

describe('editAccessorySet', () => {
  it('updates fields on the specified set', () => {
    startSession(SESSION)
    addAccessory(makeAcc())
    logAccessorySet(99, { setNumber: 1, weight: 50, reps: 8 })
    editAccessorySet(99, 0, { reps: 10 })
    expect(workout.activeAccessories[0].loggedSets[0]).toMatchObject({ reps: 10, weight: 50 })
  })
})

describe('deleteLastAccessorySet', () => {
  it('pops the last logged set from the matching accessory', () => {
    startSession(SESSION)
    addAccessory(makeAcc())
    logAccessorySet(99, { setNumber: 1, weight: 50, reps: 8 })
    logAccessorySet(99, { setNumber: 2, weight: 50, reps: 7 })
    deleteLastAccessorySet(99)
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(1)
  })

  it('does nothing when loggedSets is empty', () => {
    startSession(SESSION)
    addAccessory(makeAcc())
    deleteLastAccessorySet(99)
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(0)
  })
})

describe('removeAccessory', () => {
  it('removes the accessory with matching exerciseId', () => {
    startSession(SESSION)
    addAccessory(makeAcc())
    addAccessory({ ...makeAcc(), exerciseId: 100, exerciseName: 'Dip' })
    removeAccessory(99)
    expect(workout.activeAccessories).toHaveLength(1)
    expect(workout.activeAccessories[0].exerciseId).toBe(100)
  })
})

// ─── completeSession / clearSession / setNotes ───────────────────────────────

describe('completeSession', () => {
  it('marks activeSession status as completed', () => {
    startSession(SESSION)
    completeSession()
    expect(workout.activeSession?.status).toBe('completed')
  })

  it('does nothing when no active session', () => {
    clearSession()
    completeSession() // should not throw
    expect(workout.activeSession).toBeNull()
  })
})

describe('clearSession', () => {
  it('resets all workout state to defaults', () => {
    startSession(SESSION)
    logSet({ sessionId: 42, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false })
    advanceSet()
    startRest('fail')
    addAccessory(makeAcc())
    setNotes('some note')
    clearSession()
    expect(workout.activeSession).toBeNull()
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
    expect(workout.isResting).toBe(false)
    expect(workout.restStartedAt).toBeNull()
    expect(workout.activeAccessories).toHaveLength(0)
    expect(workout.notes).toBe('')
  })
})

describe('setNotes', () => {
  it('updates notes field', () => {
    startSession(SESSION)
    setNotes('great session')
    expect(workout.notes).toBe('great session')
  })

  it('replaces previous notes', () => {
    startSession(SESSION)
    setNotes('first')
    setNotes('second')
    expect(workout.notes).toBe('second')
  })
})

// ─── loadFromStorage ──────────────────────────────────────────────────────────

describe('loadFromStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('restores state from valid localStorage entry', async () => {
    localStorage.setItem('workout-store', JSON.stringify({ v: 1, state: { notes: 'recovered' } }))
    const { workout: w } = await import('./workout-store')
    expect(w.notes).toBe('recovered')
  })

  it('returns defaults when JSON has no state key', async () => {
    localStorage.setItem('workout-store', JSON.stringify({ v: 1 }))
    const { workout: w } = await import('./workout-store')
    expect(w.activeSession).toBeNull()
  })

  it('returns defaults when localStorage contains malformed JSON', async () => {
    localStorage.setItem('workout-store', '{not valid json{{')
    const { workout: w } = await import('./workout-store')
    expect(w.activeSession).toBeNull()
  })
})
