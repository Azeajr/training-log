// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearPtRoutineDraft,
  ptRoutineDraftKey,
  ptRoutineFingerprint,
  readPtRoutineDraft,
  writePtRoutineDraft,
  type PtRoutineDraft,
} from './pt-routine-draft'
import type { PtExerciseDraft } from '../lib/pt'

beforeEach(() => localStorage.clear())

const exercise = (over: Partial<PtExerciseDraft> = {}): PtExerciseDraft => ({
  name: 'Band pull-apart',
  sets: 3,
  measure: 'reps',
  targetReps: 15,
  resistanceKind: 'band',
  resistanceBand: 'red',
  ...over,
})

const draft = (over: Partial<PtRoutineDraft> = {}): PtRoutineDraft => ({
  name: 'Shoulder rehab',
  notes: '3x a week',
  exercises: [exercise()],
  base: null,
  ...over,
})

describe('pt routine drafts', () => {
  it('files a draft under the routine it belongs to', () => {
    expect(ptRoutineDraftKey(null)).toBe('new')
    expect(ptRoutineDraftKey(7)).toBe('7')
  })

  it('round-trips a draft, keeping exercise order and partial entries', () => {
    const parked = draft({
      exercises: [
        exercise({ id: 4, name: 'Step up', equipmentHeight: 12, equipmentHeightUnit: 'cm' }),
        exercise({ name: '' }),
        exercise({ measure: 'distance', targetDistance: 40, distanceUnit: 'm' }),
      ],
    })
    writePtRoutineDraft('7', parked)

    expect(readPtRoutineDraft('7')).toEqual(parked)
    expect(readPtRoutineDraft('7')!.exercises.map(e => e.name)).toEqual(['Step up', '', 'Band pull-apart'])
  })

  it('keeps drafts of different routines apart', () => {
    writePtRoutineDraft('new', draft({ name: 'Brand new' }))
    writePtRoutineDraft('7', draft({ name: 'Existing' }))

    expect(readPtRoutineDraft('new')!.name).toBe('Brand new')
    expect(readPtRoutineDraft('7')!.name).toBe('Existing')

    clearPtRoutineDraft('7')
    expect(readPtRoutineDraft('7')).toBeNull()
    expect(readPtRoutineDraft('new')!.name).toBe('Brand new')
  })

  it('returns nothing for a draft that was never written', () => {
    expect(readPtRoutineDraft('nope')).toBeNull()
  })

  /**
   * A restored draft goes straight into the form's signals and then into
   * `savePtRoutine`, so a malformed one has to be dropped here rather than
   * crash the next render.
   */
  it('drops a malformed draft instead of restoring it', () => {
    const bad = [
      { ...draft(), name: 42 },
      { ...draft(), exercises: 'not a list' },
      { ...draft(), exercises: [{ ...exercise(), sets: 'three' }] },
      { ...draft(), exercises: [{ ...exercise(), measure: 'vibes' }] },
      { ...draft(), exercises: [{ ...exercise(), resistanceKind: 'elastic' }] },
      { ...draft(), exercises: [{ ...exercise(), distanceUnit: 'furlongs' }] },
      { ...draft(), base: 7 },
      null,
    ]
    for (const [i, value] of bad.entries()) {
      localStorage.setItem('pt-routine-draft', JSON.stringify({ v: 1, drafts: { 7: value } }))
      expect(readPtRoutineDraft('7'), `case ${i}`).toBeNull()
    }
  })

  it('keeps a valid draft alongside a malformed one', () => {
    localStorage.setItem('pt-routine-draft', JSON.stringify({
      v: 1,
      drafts: { 7: { ...draft(), name: 42 }, 8: draft({ name: 'Fine' }) },
    }))
    expect(readPtRoutineDraft('7')).toBeNull()
    expect(readPtRoutineDraft('8')!.name).toBe('Fine')
  })

  it('ignores a payload from a version it has no migration for', () => {
    localStorage.setItem('pt-routine-draft', JSON.stringify({ v: 99, drafts: { 7: draft() } }))
    expect(readPtRoutineDraft('7')).toBeNull()
  })

  it('ignores malformed JSON', () => {
    localStorage.setItem('pt-routine-draft', '{not json{{')
    expect(readPtRoutineDraft('7')).toBeNull()
  })

  it('survives a localStorage that throws', () => {
    const getItem = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    try {
      expect(readPtRoutineDraft('7')).toBeNull()
      expect(() => writePtRoutineDraft('7', draft())).not.toThrow()
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })

  it('leaves no key behind once the last draft is cleared', () => {
    writePtRoutineDraft('7', draft())
    clearPtRoutineDraft('7')
    expect(localStorage.getItem('pt-routine-draft')).toBeNull()
  })

  describe('fingerprint', () => {
    const routine = { name: 'Shoulder rehab', notes: 'n', exercises: [exercise({ id: 4 })] }

    it('is the same for the same content', () => {
      expect(ptRoutineFingerprint(routine)).toBe(ptRoutineFingerprint({
        ...routine,
        exercises: [exercise({ id: 4 })],
      }))
    })

    it('changes with the name, the notes, a field, the order and the count', () => {
      const base = ptRoutineFingerprint(routine)
      expect(ptRoutineFingerprint({ ...routine, name: 'Knee rehab' })).not.toBe(base)
      expect(ptRoutineFingerprint({ ...routine, notes: 'other' })).not.toBe(base)
      expect(ptRoutineFingerprint({ ...routine, exercises: [exercise({ id: 4, targetReps: 12 })] })).not.toBe(base)
      expect(ptRoutineFingerprint({
        ...routine,
        exercises: [exercise({ id: 4 }), exercise({ id: 5, name: 'Second' })],
      })).not.toBe(base)
      expect(ptRoutineFingerprint({
        ...routine,
        exercises: [exercise({ id: 5, name: 'Second' }), exercise({ id: 4 })],
      })).not.toBe(ptRoutineFingerprint({
        ...routine,
        exercises: [exercise({ id: 4 }), exercise({ id: 5, name: 'Second' })],
      }))
    })

    /**
     * An absent optional and its null both mean "not set", and the two arrive
     * from different places — the form fills every branch, the database nulls
     * the ones the chosen kind does not use. They must not read as a change.
     */
    it('reads an absent optional and an explicit null the same way', () => {
      expect(ptRoutineFingerprint({
        name: 'x', notes: '', exercises: [{ name: 'a', sets: 1, measure: 'reps', resistanceKind: 'none' }],
      })).toBe(ptRoutineFingerprint({
        name: 'x', notes: '', exercises: [{
          name: 'a', sets: 1, measure: 'reps', resistanceKind: 'none',
          targetReps: null, targetSeconds: null, targetDistance: null, distanceUnit: null,
          resistanceWeight: null, equipmentHeight: null,
        }],
      }))
    })
  })
})
