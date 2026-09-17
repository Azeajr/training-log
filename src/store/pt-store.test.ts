// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot } from 'solid-js'
import {
  clearPtRun,
  getPtExerciseNote,
  isPtSetDone,
  ptExerciseNotesForCommit,
  ptPersistenceError,
  ptRun,
  resetPtPersistenceError,
  setPtExerciseNote,
  setPtNotes,
  setupPtRunPersistence,
  startPtRun,
  togglePtSet,
} from './pt-store'

beforeEach(() => {
  clearPtRun()
  localStorage.clear()
  resetPtPersistenceError()
})

describe('startPtRun', () => {
  it('records the routine and a start time', () => {
    startPtRun(4)
    expect(ptRun.routineId).toBe(4)
    expect(ptRun.startedAt).toBeGreaterThan(0)
    expect(ptRun.done).toEqual([])
  })

  it('wipes the previous run rather than carrying its ticks across routines', () => {
    startPtRun(1)
    togglePtSet(10, 1)
    setPtExerciseNote(10, 'note')
    setPtNotes('session note')

    startPtRun(2)

    expect(ptRun.routineId).toBe(2)
    expect(ptRun.done).toEqual([])
    expect(ptRun.exerciseNotes).toEqual({})
    expect(ptRun.notes).toBe('')
  })
})

describe('togglePtSet', () => {
  it('ticks and un-ticks one set', () => {
    startPtRun(1)
    expect(isPtSetDone(7, 2)).toBe(false)
    togglePtSet(7, 2)
    expect(isPtSetDone(7, 2)).toBe(true)
    togglePtSet(7, 2)
    expect(isPtSetDone(7, 2)).toBe(false)
    expect(ptRun.done).toEqual([])
  })

  it('keys by exercise AND set, so set 1 of two exercises are independent', () => {
    startPtRun(1)
    togglePtSet(7, 1)
    expect(isPtSetDone(7, 1)).toBe(true)
    expect(isPtSetDone(8, 1)).toBe(false)
    expect(isPtSetDone(7, 2)).toBe(false)
  })

  it('does not confuse exercise 1 set 11 with exercise 11 set 1', () => {
    startPtRun(1)
    togglePtSet(1, 11)
    expect(isPtSetDone(11, 1)).toBe(false)
  })
})

describe('notes', () => {
  it('stores and reads a per-exercise note', () => {
    startPtRun(1)
    expect(getPtExerciseNote(5)).toBe('')
    setPtExerciseNote(5, 'green band')
    expect(getPtExerciseNote(5)).toBe('green band')
  })

  it('converts the note map back to numeric keys for commit', () => {
    startPtRun(1)
    setPtExerciseNote(5, 'a')
    setPtExerciseNote(6, 'b')
    expect(ptExerciseNotesForCommit()).toEqual({ 5: 'a', 6: 'b' })
  })
})

describe('clearPtRun', () => {
  it('resets every field', () => {
    startPtRun(3)
    togglePtSet(1, 1)
    setPtNotes('x')
    setPtExerciseNote(1, 'y')

    clearPtRun()

    expect(ptRun.routineId).toBeNull()
    expect(ptRun.startedAt).toBeNull()
    expect(ptRun.done).toEqual([])
    expect(ptRun.notes).toBe('')
    expect(ptRun.exerciseNotes).toEqual({})
  })
})

describe('setupPtRunPersistence', () => {
  let dispose: (() => void) | undefined

  beforeEach(() => {
    localStorage.clear()
    dispose = undefined
  })

  afterEach(() => {
    dispose?.()
  })

  // Effects do not run inside createRoot's synchronous body; they are queued.
  const flush = () => new Promise<void>(r => setTimeout(r, 0))

  // The INSTANCE, not Storage.prototype: test-setup installs a plain object as
  // localStorage, so a prototype spy never intercepts and the test would pass
  // against broken code. Same note as workout-store.test.ts.
  const failWrites = (thrown: unknown = new Error('QuotaExceededError')) =>
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw thrown })

  it('mirrors the run into localStorage on every change', async () => {
    dispose = createRoot(d => { setupPtRunPersistence(); return d })
    startPtRun(2)
    togglePtSet(9, 1)
    await flush()

    const raw = JSON.parse(localStorage.getItem('pt-run')!) as { v: number; state: Record<string, unknown> }
    expect(raw.v).toBe(1)
    expect(raw.state.routineId).toBe(2)
    expect(raw.state.done).toEqual(['9:1'])
  })

  it('does not throw out of the effect when the write fails', async () => {
    const spy = failWrites()
    try {
      dispose = createRoot(d => { setupPtRunPersistence(); return d })
      await expect(flush()).resolves.toBeUndefined()
    } finally {
      spy.mockRestore()
    }
  })

  it('reports a write failure so the run screen can warn', async () => {
    const spy = failWrites()
    try {
      dispose = createRoot(d => { setupPtRunPersistence(); return d })
      startPtRun(1)
      await flush()
      expect(ptPersistenceError()).toBe('QuotaExceededError')
    } finally {
      spy.mockRestore()
    }
  })

  it('clears the error once a write succeeds again', async () => {
    const spy = vi.spyOn(window.localStorage, 'setItem')
      .mockImplementationOnce(() => { throw new Error('nope') })
    try {
      dispose = createRoot(d => { setupPtRunPersistence(); return d })
      await flush()
      expect(ptPersistenceError()).toBe('nope')
      startPtRun(1)
      await flush()
      expect(ptPersistenceError()).toBeNull()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('loadFromStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('restores a run in progress', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 1,
      state: { routineId: 3, startedAt: 1000, done: ['4:1'], exerciseNotes: { 4: 'x' }, notes: 'n' },
    }))
    const store = await import('./pt-store')
    expect(store.ptRun.routineId).toBe(3)
    expect(store.ptRun.done).toEqual(['4:1'])
    expect(store.ptRun.notes).toBe('n')
    expect(store.getPtExerciseNote(4)).toBe('x')
  })

  it('returns defaults on malformed JSON', async () => {
    localStorage.setItem('pt-run', '{not json{{')
    const store = await import('./pt-store')
    expect(store.ptRun.routineId).toBeNull()
  })

  it('returns defaults on a version mismatch', async () => {
    localStorage.setItem('pt-run', JSON.stringify({ v: 99, state: { routineId: 3 } }))
    const store = await import('./pt-store')
    expect(store.ptRun.routineId).toBeNull()
  })

  it('returns defaults when state is not a plain object', async () => {
    localStorage.setItem('pt-run', JSON.stringify({ v: 1, state: [1, 2] }))
    const store = await import('./pt-store')
    expect(store.ptRun.routineId).toBeNull()
    expect(store.ptRun.done).toEqual([])
  })

  it('drops keys outside the allowlist', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 1,
      state: { routineId: 3, evilField: 'nope' },
    }))
    const store = await import('./pt-store')
    expect(store.ptRun.routineId).toBe(3)
    expect((store.ptRun as unknown as Record<string, unknown>).evilField).toBeUndefined()
  })

  it('drops allowlisted keys whose persisted value has the wrong type', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 1,
      state: {
        routineId: 'three',         // string where an id belongs
        startedAt: 'now',           // string where a timestamp belongs
        done: [1, 2],               // numbers where the "id:set" keys belong
        exerciseNotes: { 4: 7 },    // number where note text belongs
        notes: 42,                  // number where text belongs
      },
    }))
    const store = await import('./pt-store')
    expect(store.ptRun.routineId).toBeNull()
    expect(store.ptRun.startedAt).toBeNull()
    expect(store.ptRun.done).toEqual([])
    expect(store.ptRun.exerciseNotes).toEqual({})
    expect(store.ptRun.notes).toBe('')
  })

  it('survives a localStorage that throws on read', async () => {
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      const store = await import('./pt-store')
      expect(store.ptRun.routineId).toBeNull()
    } finally {
      getItem.mockRestore()
    }
  })
})
