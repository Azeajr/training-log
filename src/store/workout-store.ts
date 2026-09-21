import { createStore, produce } from 'solid-js/store'
import { createEffect, createSignal } from 'solid-js'
import type { Session, Set, AccessorySet } from '../types/domain'
import type { AssistanceSlot } from '../lib/assistance'

export type RestType = 'normal' | 'fail'

export interface ActiveAccessory {
  exerciseId: number
  exerciseName: string
  tm: number
  calculatedWeight: number
  loggedSets: Partial<AccessorySet>[]
  // Which assistance slot this fills. Absent (legacy/extra) accessories append
  // freely; the three fixed slots hold one exercise each.
  slot?: AssistanceSlot
  // Free-text note for this exercise within this session. Optional rather than
  // defaulted to '' so accessories rehydrated from a pre-feature localStorage
  // snapshot (see PERSISTED_VALIDATORS) don't need a shape migration.
  notes?: string
}

interface WorkoutState {
  activeSession: Session | null
  loggedSets: Set[]
  // Cross-lift supplemental sets live apart from loggedSets so they can be
  // logged independently (any block, any time) without disturbing the linear
  // currentSetIndex/loggedSets positional model the own-lift sets rely on.
  loggedCrossSets: Set[]
  currentSetIndex: number
  isResting: boolean
  restStartedAt: number | null
  restType: RestType
  activeAccessories: ActiveAccessory[]
  notes: string
  /**
   * Planned set indices the user skipped rather than performed. Warmups only.
   *
   * The cursor used to stand in for "what happened": a set before it was
   * completed, a set after it was not. Moving it past a warmup nobody did
   * therefore recorded a set nobody did — into the section counts, the session
   * bar and the early-finish prompt. Skipping is its own fact, so it says so.
   */
  skippedSets: number[]
}

const STORAGE_KEY = 'workout-store'
const STORAGE_VERSION = 1

// Allowlist of keys persisted to localStorage. Anything else is discarded on
// rehydrate — defense in depth so a corrupted/tampered entry can't graft
// extra fields onto the reactive store.
const PERSISTED_KEYS = [
  'activeSession',
  'loggedSets',
  'loggedCrossSets',
  'currentSetIndex',
  'isResting',
  'restStartedAt',
  'restType',
  'activeAccessories',
  'notes',
  'skippedSets',
] as const satisfies readonly (keyof WorkoutState)[]

const isPlainObject = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

// Per-key shape checks for rehydrate. A wrong-typed value under an allowlisted
// key must be dropped, not grafted — a string where loggedSets belongs crashes
// every `.filter()`/`.map()` consumer on the next render.
const PERSISTED_VALIDATORS: Record<(typeof PERSISTED_KEYS)[number], (v: unknown) => boolean> = {
  activeSession: v => v === null || isPlainObject(v),
  loggedSets: Array.isArray,
  loggedCrossSets: Array.isArray,
  currentSetIndex: v => Number.isInteger(v) && (v as number) >= 0,
  isResting: v => typeof v === 'boolean',
  restStartedAt: v => v === null || typeof v === 'number',
  // Dropping a persisted pre-checkpoint `transition` value falls back to
  // `normal`, so an in-progress successful rest resumes with both bells.
  restType: v => v === 'normal' || v === 'fail',
  activeAccessories: Array.isArray,
  notes: v => typeof v === 'string',
  skippedSets: v => Array.isArray(v) && v.every(i => Number.isInteger(i) && (i as number) >= 0),
}

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
      if (k in src && PERSISTED_VALIDATORS[k](src[k])) (out as Record<string, unknown>)[k] = src[k]
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
  loggedCrossSets: [],
  currentSetIndex: 0,
  isResting: false,
  restStartedAt: null,
  restType: 'normal',
  activeAccessories: [],
  notes: '',
  skippedSets: [],
})

export const [workout, setWorkout] = createStore<WorkoutState>({
  ...emptyState(),
  ...loadFromStorage(),
})

// Whether the in-progress session is still being mirrored to localStorage.
// Non-null means it is not, and names why.
const [persistenceError, setPersistenceError] = createSignal<string | null>(null)
export { persistenceError }

// Must be called inside a reactive root (e.g. `render(() => { setupWorkoutPersistence(); ... })`).
// Registers a createEffect that mirrors workout state into localStorage on every change.
export function setupWorkoutPersistence() {
  createEffect(() => {
    // Wrapped, because a quota or write failure here throws inside a reactive
    // effect on the render path — with no catch anywhere above it. Recovery for
    // the active workout then stops silently: logged sets are safe in the
    // database, but the cursor, the accessory work and the session notes live
    // only in this store until COMPLETE, so a reload after this point loses
    // them with nothing having said so (F12).
    try {
      writeSnapshot()
      setPersistenceError(null)
    } catch (err) {
      setPersistenceError(err instanceof Error ? err.message : 'unknown error')
    }
  })
}

function writeSnapshot() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    v: STORAGE_VERSION,
    state: {
      activeSession:     workout.activeSession,
      loggedSets:        workout.loggedSets,
      loggedCrossSets:   workout.loggedCrossSets,
      currentSetIndex:   workout.currentSetIndex,
      isResting:         workout.isResting,
      restStartedAt:     workout.restStartedAt,
      restType:          workout.restType,
      activeAccessories: workout.activeAccessories,
      notes:             workout.notes,
      // Listed here as well as in PERSISTED_KEYS. This serializer does not
      // iterate that allowlist, so a key added to it alone is validated on read
      // and never written — a skip would survive until the first reload and
      // then silently vanish. Same trap as `pendingSeed` in pt-store.
      skippedSets:       workout.skippedSets,
    },
  }))
}

/** Test helper — clears the degraded-persistence state. */
export function resetPersistenceError(): void {
  setPersistenceError(null)
}

export function startSession(session: Session) {
  setWorkout({ ...emptyState(), activeSession: session })
}

// Resuming is not starting. `startSession` resets to empty, which is right for a
// fresh session and wrong for a pending one that already has rows in the
// database — Workout derives every bit of its progress from these arrays, so an
// empty one made a half-finished session look untouched and the next LOG
// inserted a duplicate of a set already saved (F18).
export function resumeSession(
  session: Session,
  state: { loggedSets: Set[]; loggedCrossSets: Set[]; currentSetIndex: number; notes: string },
) {
  setWorkout({
    ...emptyState(),
    activeSession: session,
    loggedSets: state.loggedSets,
    loggedCrossSets: state.loggedCrossSets,
    currentSetIndex: state.currentSetIndex,
    notes: state.notes,
  })
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

/**
 * Record that these planned sets were not performed, and move past them.
 *
 * `cursor` is where the cursor lands afterwards — the caller knows where the
 * skipped block ends. Idempotent, and never marks a set that is already logged:
 * skipping is about work that did not happen.
 */
export function skipSetsThrough(indices: number[], cursor: number) {
  setWorkout(produce((s) => {
    for (const i of indices) if (!s.skippedSets.includes(i)) s.skippedSets.push(i)
    s.skippedSets.sort((a, b) => a - b)
    s.currentSetIndex = cursor
  }))
}

/** Take a skipped set back, and put the cursor on it. */
export function unskipSet(index: number) {
  setWorkout(produce((s) => {
    s.skippedSets = s.skippedSets.filter(i => i !== index)
    s.currentSetIndex = index
  }))
}

export function deleteLastSet() {
  if (workout.loggedSets.length === 0) return
  setWorkout(produce((s) => {
    s.loggedSets.pop()
    s.currentSetIndex = Math.max(0, s.currentSetIndex - 1)
  }))
}

// Cross-lift supplemental sets are tracked separately from the linear loggedSets
// so each block can be logged out of order, like accessories. No shared cursor:
// a block's "next set" is derived from how many of its sets are already logged.
export function logCrossSet(set: Set) {
  setWorkout('loggedCrossSets', (prev) => [...prev, set])
}

export function editCrossSet(index: number, updates: Partial<Set>) {
  setWorkout('loggedCrossSets', index, updates)
}

export function deleteLastCrossSetFor(liftId: number) {
  setWorkout(produce((s) => {
    for (let i = s.loggedCrossSets.length - 1; i >= 0; i--) {
      if (s.loggedCrossSets[i].liftId === liftId) {
        s.loggedCrossSets.splice(i, 1)
        return
      }
    }
  }))
}

export function startRest(type: RestType) {
  setWorkout({ isResting: true, restStartedAt: Date.now(), restType: type })
}

export function stopRest() {
  setWorkout({ isResting: false, restStartedAt: null, restType: 'normal' })
}

// Build an ActiveAccessory for a freshly-picked/seeded slot (no logged sets
// yet). One constructor so the picker's two entry points and the Today-screen
// seed loop stay in step with the store's shape.
export function toActiveAccessory(
  pick: { exerciseId: number; exerciseName: string; tm: number; calculatedWeight: number },
  slot: AssistanceSlot,
): ActiveAccessory {
  return { ...pick, loggedSets: [], slot }
}

/**
 * Whether an accessory records anything a swap would destroy.
 *
 * Notes count as much as sets. `completeSession` saves accessory notes
 * independently of them, because "wanted to try this, ran out of time" is real
 * work and the only record of it.
 */
export const accessoryHasWork = (a: ActiveAccessory): boolean =>
  a.loggedSets.length > 0 || !!a.notes?.trim()

/**
 * Put an exercise in a slot.
 *
 * A fixed slot (push/pull/legs_core) holds exactly one exercise, so picking
 * again displaces the occupant. It used to be filtered out of the list
 * outright, taking its logged sets and its note with it, with no warning and no
 * undo. Real work is demoted to `extra` instead; an untouched selection is
 * simply dropped.
 *
 * Every entry here is addressed elsewhere by exercise id through Solid's store
 * PREDICATE form, which applies to EVERY match rather than the first. So an
 * exercise already present is MOVED, never pushed a second time: two entries
 * for one exercise would make `logAccessorySet` write two sets and
 * `editAccessorySet` rewrite both. That reconciliation is what makes retaining
 * anything safe, not a refinement of it.
 */
export function addAccessory(accessory: ActiveAccessory) {
  setWorkout('activeAccessories', (prev) => {
    const isFixedSlot = accessory.slot != null && accessory.slot !== 'extra'

    // Re-selecting the current occupant is a no-op, not a reset. `existing` is
    // tested explicitly: a legacy accessory carries no slot, so `existing?.slot`
    // and `accessory.slot` are both undefined when there is no existing entry
    // at all, and the optional chain would call every such add a no-op.
    const existing = prev.find((a) => a.exerciseId === accessory.exerciseId)
    if (existing !== undefined && existing.slot === accessory.slot) return prev

    const kept = prev.flatMap((a) => {
      if (a.exerciseId === accessory.exerciseId) return []
      if (!isFixedSlot || a.slot !== accessory.slot) return [a]
      return accessoryHasWork(a) ? [{ ...a, slot: 'extra' as const }] : []
    })

    // What the entry already holds beats the picker's blank: the incoming
    // object is freshly built and carries no sets, no note and no band load.
    return [...kept, existing ? { ...existing, slot: accessory.slot } : accessory]
  })
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

export function setAccessoryNotes(exerciseId: number, notes: string) {
  setWorkout('activeAccessories', (a) => a.exerciseId === exerciseId, 'notes', notes)
}

export function clearSession() {
  setWorkout(emptyState())
}

export function setNotes(notes: string) {
  setWorkout('notes', notes)
}
