// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { createRoot } from 'solid-js'
import {
  workout, startSession, logSet, editSet, advanceSet, deleteLastSet,
  startRest, stopRest,
  addAccessory, logAccessorySet, editAccessorySet, deleteLastAccessorySet, removeAccessory,
  clearSession, setNotes, setupWorkoutPersistence,
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

// ─── clearSession / setNotes ───────────────────────────────

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

  it('drops unknown keys from persisted state (hydration allowlist)', async () => {
    localStorage.setItem('workout-store', JSON.stringify({
      v: 1,
      state: {
        notes: 'kept',
        __proto__: { polluted: true },
        evilField: 'should not appear',
      },
    }))
    const { workout: w } = await import('./workout-store')
    expect(w.notes).toBe('kept')
    expect((w as unknown as Record<string, unknown>).evilField).toBeUndefined()
  })

  it('returns defaults when persisted state is not a plain object', async () => {
    localStorage.setItem('workout-store', JSON.stringify({ v: 1, state: [1, 2, 3] }))
    const { workout: w } = await import('./workout-store')
    expect(w.activeSession).toBeNull()
    expect(w.notes).toBe('')
  })

  it('returns defaults when storage version does not match (v !== STORAGE_VERSION)', async () => {
    localStorage.setItem('workout-store', JSON.stringify({ v: 99, state: { notes: 'stale' } }))
    const { workout: w } = await import('./workout-store')
    expect(w.notes).toBe('')
    expect(w.activeSession).toBeNull()
  })

  it('drops allowlisted keys whose persisted value has the wrong type', async () => {
    localStorage.setItem('workout-store', JSON.stringify({
      v: 1,
      state: {
        loggedSets: 'corrupt',      // string where array expected — would crash loggedSets.filter()
        activeAccessories: 42,      // number where array expected
        currentSetIndex: 'three',   // string where number expected
        isResting: 'yes',           // string where boolean expected
        restStartedAt: {},          // object where number|null expected
        restType: 'bogus',          // not one of normal|transition|fail
        activeSession: [1, 2],      // array where object|null expected
        notes: 'kept',              // valid — must survive alongside the dropped keys
      },
    }))
    const { workout: w } = await import('./workout-store')
    expect(w.loggedSets).toEqual([])
    expect(w.activeAccessories).toEqual([])
    expect(w.currentSetIndex).toBe(0)
    expect(w.isResting).toBe(false)
    expect(w.restStartedAt).toBeNull()
    expect(w.restType).toBe('normal')
    expect(w.activeSession).toBeNull()
    expect(w.notes).toBe('kept')
  })

  it('rejects a negative currentSetIndex', async () => {
    localStorage.setItem('workout-store', JSON.stringify({ v: 1, state: { currentSetIndex: -5 } }))
    const { workout: w } = await import('./workout-store')
    expect(w.currentSetIndex).toBe(0)
  })

  it('keeps valid persisted values: session object, numeric index, rest timestamp', async () => {
    localStorage.setItem('workout-store', JSON.stringify({
      v: 1,
      state: { activeSession: { id: 7, liftId: 1, week: 2 }, currentSetIndex: 3, restStartedAt: 1234 },
    }))
    const { workout: w } = await import('./workout-store')
    expect(w.activeSession).toMatchObject({ id: 7, week: 2 })
    expect(w.currentSetIndex).toBe(3)
    expect(w.restStartedAt).toBe(1234)
  })
})

// ─── setupWorkoutPersistence ──────────────────────────────────────────────────

describe('setupWorkoutPersistence', () => {
  let dispose: (() => void) | undefined

  beforeEach(() => {
    clearSession()
    localStorage.clear()
    dispose = undefined
  })

  afterEach(() => {
    dispose?.()
  })

  const flush = () => new Promise<void>(r => setTimeout(r, 0))

  it('writes initial state to localStorage after first effect run', async () => {
    dispose = createRoot(d => { setupWorkoutPersistence(); return d })
    await flush()
    const raw = localStorage.getItem('workout-store')
    expect(raw).not.toBeNull()
    const stored = JSON.parse(raw!)
    expect(stored.v).toBe(1)
    expect(stored.state).toMatchObject({
      loggedSets: [],
      currentSetIndex: 0,
      isResting: false,
      activeAccessories: [],
      notes: '',
    })
  })

  it('updates localStorage when notes change', async () => {
    dispose = createRoot(d => { setupWorkoutPersistence(); return d })
    await flush()
    setNotes('persisted note')
    await flush()
    const stored = JSON.parse(localStorage.getItem('workout-store')!)
    expect(stored.state.notes).toBe('persisted note')
  })

  it('updates localStorage when rest state changes', async () => {
    dispose = createRoot(d => { setupWorkoutPersistence(); return d })
    await flush()
    startRest('fail')
    await flush()
    const stored = JSON.parse(localStorage.getItem('workout-store')!)
    expect(stored.state.isResting).toBe(true)
    expect(stored.state.restType).toBe('fail')
  })

  it('written value has version = 1 and contains all persisted keys', async () => {
    dispose = createRoot(d => { setupWorkoutPersistence(); return d })
    await flush()
    const stored = JSON.parse(localStorage.getItem('workout-store')!)
    expect(stored.v).toBe(1)
    const keys = Object.keys(stored.state)
    expect(keys).toContain('activeSession')
    expect(keys).toContain('loggedSets')
    expect(keys).toContain('currentSetIndex')
    expect(keys).toContain('isResting')
    expect(keys).toContain('restStartedAt')
    expect(keys).toContain('restType')
    expect(keys).toContain('activeAccessories')
    expect(keys).toContain('notes')
  })

  it('clearSession is reflected in localStorage', async () => {
    startSession({ id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending' })
    setNotes('some note')
    dispose = createRoot(d => { setupWorkoutPersistence(); return d })
    await flush()
    clearSession()
    await flush()
    const stored = JSON.parse(localStorage.getItem('workout-store')!)
    expect(stored.state.activeSession).toBeNull()
    expect(stored.state.notes).toBe('')
  })
})
