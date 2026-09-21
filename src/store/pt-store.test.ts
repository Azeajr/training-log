// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createRoot } from 'solid-js'
import {
  addPtSet,
  clearPtRun,
  clearAllPtRuns,
  getPtRun,
  getPtExerciseNote,
  ensurePtSets,
  isPtSetDone,
  ptExerciseNotesForCommit,
  ptSetsFor,
  removePtSet,
  setPtSetFields,
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
  clearAllPtRuns()
  localStorage.clear()
  resetPtPersistenceError()
})

/**
 * The ticked sets as `exerciseId:setNumber`, which is how the store held them
 * before it recorded per-set values. Assertions read better in that shape than
 * against the set lists, and deriving it keeps them off the representation.
 */
const doneKeys = (run: { sets: Record<string, { done: boolean }[]> } | undefined): string[] =>
  Object.entries(run?.sets ?? {})
    .flatMap(([id, list]) => list.flatMap((set, i) => set.done ? [`${id}:${i + 1}`] : []))

describe('startPtRun', () => {
  it('records the routine and a start time', () => {
    startPtRun(4)
    expect(ptRun.routineId).toBe(4)
    expect(ptRun.startedAt).toBeGreaterThan(0)
    expect(doneKeys(ptRun)).toEqual([])
  })

  it('keeps independent progress and resumes the original notes and start time', () => {
    startPtRun(1)
    const startedAt = ptRun.startedAt
    togglePtSet(10, 1)
    setPtExerciseNote(10, 'note')
    setPtNotes('session note')

    startPtRun(2)

    expect(ptRun.routineId).toBe(2)
    expect(doneKeys(ptRun)).toEqual([])
    expect(ptRun.exerciseNotes).toEqual({})
    expect(ptRun.notes).toBe('')
    togglePtSet(20, 1)
    startPtRun(1)
    expect(ptRun.startedAt).toBe(startedAt)
    expect(doneKeys(ptRun)).toEqual(['10:1'])
    expect(ptRun.exerciseNotes).toEqual({ 10: 'note' })
    expect(ptRun.notes).toBe('session note')
    clearPtRun()
    expect(getPtRun(1)).toBeUndefined()
    expect(doneKeys(getPtRun(2))).toEqual(['20:1'])
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
    expect(doneKeys(ptRun)).toEqual([])
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

describe('setPtSetFields', () => {
  const seed = (count = 3) => { startPtRun(1); ensurePtSets(7, count) }

  it('records what one set was without touching its effort on later sets', () => {
    seed()
    setPtSetFields(7, 1, { reps: 8 })
    expect(ptSetsFor(7)[0]).toMatchObject({ reps: 8 })
    // Reps are what you managed on that set, not a change to the session.
    expect(ptSetsFor(7)[1].reps).toBeUndefined()
  })

  it('carries an equipment change forward to the sets still to come', () => {
    seed()
    setPtSetFields(7, 1, { equipmentHeight: 12, equipmentHeightUnit: 'cm' })
    expect(ptSetsFor(7).map(s => s.equipmentHeight)).toEqual([12, 12, 12])
  })

  it('stops carrying at a set already done, which is a fact and not a default', () => {
    seed(4)
    // Recording set 3 on red carries to set 4, which is still to come.
    setPtSetFields(7, 3, { done: true, band: 'red' })
    expect(ptSetsFor(7).map(s => s.band)).toEqual([undefined, undefined, 'red', 'red'])

    // Going back to fix set 1 reaches set 2 and stops dead at set 3: that one is
    // already recorded, so neither it nor anything behind it is rewritten.
    setPtSetFields(7, 1, { band: 'green' })
    expect(ptSetsFor(7).map(s => s.band)).toEqual(['green', 'green', 'red', 'red'])
  })

  it('applies to a parked routine without disturbing the live one', () => {
    startPtRun(1)
    ensurePtSets(7, 2)
    startPtRun(2)
    ensurePtSets(9, 2)
    setPtSetFields(7, 1, { weight: 25 }, 1)
    expect(getPtRun(1)?.sets['7'][0]).toMatchObject({ weight: 25 })
    expect(ptSetsFor(9)[0].weight).toBeUndefined()
  })
})

describe('addPtSet and removePtSet', () => {
  it('adds a set that inherits the equipment but not the effort', () => {
    startPtRun(1)
    ensurePtSets(7, 1)
    setPtSetFields(7, 1, { done: true, reps: 9, weight: 20, equipmentHeight: 6, equipmentHeightUnit: 'in' })

    addPtSet(7)

    expect(ptSetsFor(7)).toHaveLength(2)
    expect(ptSetsFor(7)[1]).toMatchObject({ done: false, weight: 20, equipmentHeight: 6 })
    expect(ptSetsFor(7)[1].reps).toBeUndefined()
  })

  it('closes the gap when a middle set is removed, so numbering stays contiguous', () => {
    startPtRun(1)
    ensurePtSets(7, 3)
    setPtSetFields(7, 1, { reps: 1 })
    setPtSetFields(7, 3, { reps: 3 })

    removePtSet(7, 2)

    expect(ptSetsFor(7).map(s => s.reps)).toEqual([1, 3])
  })

  it('ignores a set number that is not there', () => {
    startPtRun(1)
    ensurePtSets(7, 2)
    removePtSet(7, 5)
    removePtSet(7, 0)
    expect(ptSetsFor(7)).toHaveLength(2)
  })
})

describe('ensurePtSets', () => {
  it('grows to the prescription but never shrinks a run that added sets', () => {
    startPtRun(1)
    ensurePtSets(7, 3)
    addPtSet(7)
    ensurePtSets(7, 3)
    expect(ptSetsFor(7)).toHaveLength(4)
  })

  /**
   * A list the run already has is the run's own answer and is not extended, so
   * raising the routine's set count no longer reaches into a run already under
   * way. That is the same rule that stops a deleted set coming back, and the
   * user still has + ADD SET. Seeding only ever happens on first entry.
   */
  it('leaves a list the run already has exactly as it is', () => {
    startPtRun(1)
    ensurePtSets(7, 1)
    setPtSetFields(7, 1, { done: true, reps: 11 })
    ensurePtSets(7, 3)
    expect(ptSetsFor(7)[0]).toMatchObject({ done: true, reps: 11 })
    expect(ptSetsFor(7)).toHaveLength(1)
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
    expect(doneKeys(ptRun)).toEqual([])
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
    expect(raw.v).toBe(2)
    expect(raw.state.routineId).toBe(2)
    expect(doneKeys(raw.state as unknown as { sets: Record<string, { done: boolean }[]> })).toEqual(['9:1'])
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
      v: 2,
      state: {
        routineId: 3, startedAt: 1000,
        sets: { 4: [{ done: true, reps: 12 }] },
        exerciseNotes: { 4: 'x' }, notes: 'n',
      },
    }))
    const store = await import('./pt-store')
    expect(store.ptRun.routineId).toBe(3)
    expect(doneKeys(store.ptRun)).toEqual(['4:1'])
    expect(store.ptSetsFor(4)).toEqual([{ done: true, reps: 12 }])
    expect(store.ptRun.notes).toBe('n')
    expect(store.getPtExerciseNote(4)).toBe('x')
  })

  // A rehab session is done on the floor over half an hour; shipping an update
  // in the middle of one must not cost the user the sets they already ticked.
  it('migrates a v1 draft rather than discarding it', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 1,
      state: { routineId: 3, startedAt: 1000, done: ['4:2'], exerciseNotes: { 4: 'x' }, notes: 'n' },
      paused: { 7: { routineId: 7, startedAt: 900, done: ['9:1'], exerciseNotes: {}, notes: 'p' } },
    }))
    const store = await import('./pt-store')

    expect(store.ptRun.routineId).toBe(3)
    expect(store.ptRun.startedAt).toBe(1000)
    expect(store.ptRun.notes).toBe('n')
    expect(store.getPtExerciseNote(4)).toBe('x')
    // Set 2 was ticked, so the rebuilt list reaches it and set 1 sits unticked
    // ahead of it — a v1 draft only ever recorded the ticks.
    expect(store.ptSetsFor(4)).toEqual([{ done: false }, { done: true }])
    expect(doneKeys(store.ptRun)).toEqual(['4:2'])
    // Parked runs are persisted too, and migrate the same way.
    expect(doneKeys(store.getPtRun(7))).toEqual(['9:1'])
    expect(store.getPtRun(7)?.notes).toBe('p')
  })

  it('discards a draft from a version it has no migration for', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 99,
      state: { routineId: 3, startedAt: 1000, sets: { 4: [{ done: true }] }, exerciseNotes: {}, notes: '' },
    }))
    const store = await import('./pt-store')
    expect(store.ptRun.routineId).toBeNull()
  })

  it('persists and restores multiple runs, including notes and start times', async () => {
    const original = await import('./pt-store')
    const dispose = createRoot(d => { original.setupPtRunPersistence(); return d })
    try {
      original.startPtRun(1)
      const startedAt = original.ptRun.startedAt
      original.togglePtSet(10, 2)
      original.setPtNotes('knee notes')
      original.setPtExerciseNote(10, 'lighter band')
      original.startPtRun(2)
      original.togglePtSet(20, 1)
      await new Promise(r => setTimeout(r, 0))
      vi.resetModules()
      const restored = await import('./pt-store')
      expect(doneKeys(restored.getPtRun(2))).toEqual(['20:1'])
      restored.startPtRun(1)
      expect(restored.ptRun.startedAt).toBe(startedAt)
      expect(doneKeys(restored.ptRun)).toEqual(['10:2'])
      expect(restored.ptRun.notes).toBe('knee notes')
      expect(restored.getPtExerciseNote(10)).toBe('lighter band')
      expect(doneKeys(restored.getPtRun(2))).toEqual(['20:1'])
    } finally {
      dispose()
    }
  })

  it('ignores malformed paused entries without losing valid progress', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 1,
      state: { routineId: 1, done: ['10:1'] },
      paused: { 1: { routineId: 1 }, 2: { routineId: 3 }, 4: null, 5: { routineId: 5, done: 42 } },
    }))
    const store = await import('./pt-store')
    expect(doneKeys(store.getPtRun(1))).toEqual(['10:1'])
    expect(store.getPtRun(2)).toBeUndefined()
    expect(store.getPtRun(4)).toBeUndefined()
    expect(doneKeys(store.getPtRun(5))).toEqual([])
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
    expect(doneKeys(store.ptRun)).toEqual([])
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
    expect(doneKeys(store.ptRun)).toEqual([])
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

/*
 * A4. `ensurePtSets` grew every list on every load, so deleting a set and
 * reloading brought it back — with the completion count changed underneath the
 * user. The one-way growth exists for v1 drafts, which only ever recorded the
 * sets that had been ticked, so the two cases have to be told apart by the
 * PERSISTED FORMAT rather than by "does this list look short".
 *
 * Every fixture is initialized twice: once is the migration, twice is the proof
 * that initialization does not repeat it.
 */
describe('set-list provenance', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  const v2 = (sets: Record<string, unknown[]>, extra: Record<string, unknown> = {}) =>
    localStorage.setItem('pt-run', JSON.stringify({
      v: 2,
      state: { routineId: 3, startedAt: 1000, sets, exerciseNotes: {}, notes: '', ...extra },
    }))

  /** What the run screen does on load, for every exercise, on every load. */
  const seedTwice = (store: typeof import('./pt-store'), exerciseId: number, count: number) => {
    store.ensurePtSets(exerciseId, count)
    store.ensurePtSets(exerciseId, count)
  }

  it('leaves a shortened v2 list shortened', async () => {
    v2({ 4: [{ done: true }, { done: false }] })
    const store = await import('./pt-store')

    seedTwice(store, 4, 3)
    expect(store.ptSetsFor(4)).toHaveLength(2)
  })

  it('leaves an emptied v2 list empty', async () => {
    v2({ 4: [] })
    const store = await import('./pt-store')

    seedTwice(store, 4, 3)
    expect(store.ptSetsFor(4)).toEqual([])
  })

  it('seeds an exercise the run has never touched', async () => {
    v2({ 4: [] })
    const store = await import('./pt-store')

    seedTwice(store, 9, 3)
    expect(store.ptSetsFor(9)).toHaveLength(3)
  })

  it('keeps a set added beyond the prescription', async () => {
    v2({ 4: [{ done: true }, { done: true }, { done: true }, { done: false }] })
    const store = await import('./pt-store')

    seedTwice(store, 4, 3)
    expect(store.ptSetsFor(4)).toHaveLength(4)
  })

  /**
   * The case the one-way growth exists for: a v1 draft's list reaches the
   * highest tick and no further, so it really is short and really does need
   * the prescription. Once.
   */
  it('expands a v1 list once, and never again', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 1,
      state: { routineId: 3, startedAt: 1000, done: ['4:2'], exerciseNotes: {}, notes: '' },
    }))
    const store = await import('./pt-store')
    expect(store.ptSetsFor(4)).toHaveLength(2)

    seedTwice(store, 4, 3)
    expect(store.ptSetsFor(4)).toHaveLength(3)

    // Now a deliberate deletion, which must survive every later load.
    store.removePtSet(4, 3)
    seedTwice(store, 4, 3)
    expect(store.ptSetsFor(4)).toHaveLength(2)
  })

  it('keeps a parked routine\'s list across a switch away and back', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 2,
      state: { routineId: 1, startedAt: 1000, sets: { 10: [{ done: true }] }, exerciseNotes: {}, notes: '' },
      paused: { 2: { routineId: 2, startedAt: 900, sets: { 20: [{ done: true }] }, exerciseNotes: {}, notes: '' } },
    }))
    const store = await import('./pt-store')

    store.ensurePtSets(20, 3, 2)
    expect(store.ptSetsFor(20, 2)).toHaveLength(1)

    store.startPtRun(2)
    seedTwice(store, 20, 3)
    expect(store.ptSetsFor(20)).toHaveLength(1)

    store.startPtRun(1)
    seedTwice(store, 10, 3)
    expect(store.ptSetsFor(10)).toHaveLength(1)
  })

  it('drops a malformed pendingSeed rather than storing it', async () => {
    v2({ 4: [{ done: true }] }, { pendingSeed: 42 })
    const store = await import('./pt-store')

    seedTwice(store, 4, 3)
    expect(store.ptSetsFor(4)).toHaveLength(1)

    vi.resetModules()
    localStorage.clear()
    v2({ 4: [{ done: true }] }, { pendingSeed: ['4', 7] })
    const again = await import('./pt-store')
    again.ensurePtSets(4, 3)
    expect(again.ptSetsFor(4)).toHaveLength(1)
  })

  /**
   * The provenance has to survive being written back out. The persistence
   * effect runs on every store change, so an ordinary save can easily land
   * before the run screen has seeded anything — and if the marker did not go
   * with it, the reload after that would read the v1 remnant as authoritative
   * and leave it permanently short.
   */
  it('carries v1 provenance through a save that happens before seeding', async () => {
    localStorage.setItem('pt-run', JSON.stringify({
      v: 1,
      state: { routineId: 1, startedAt: 1000, done: ['10:2'], exerciseNotes: {}, notes: '' },
      paused: { 2: { routineId: 2, startedAt: 900, done: ['20:1'], exerciseNotes: {}, notes: 'p' } },
    }))
    const first = await import('./pt-store')
    const dispose = createRoot(d => { first.setupPtRunPersistence(); return d })
    try {
      // Anything at all writes the draft back out, as v2, before the run screen
      // has had a chance to seed.
      first.setPtNotes('typed something')
      await new Promise(r => setTimeout(r, 0))
    } finally {
      dispose()
    }

    vi.resetModules()
    const store = await import('./pt-store')
    expect(store.ptSetsFor(10)).toHaveLength(2)

    seedTwice(store, 10, 3)
    expect(store.ptSetsFor(10)).toHaveLength(3)

    store.startPtRun(2)
    seedTwice(store, 20, 3)
    expect(store.ptSetsFor(20)).toHaveLength(3)

    store.removePtSet(20, 3)
    seedTwice(store, 20, 3)
    expect(store.ptSetsFor(20)).toHaveLength(2)
  })
})
