// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { db } from '../db'
import { __resetForTest } from '../db/sqlite-client'
import {
  applyPtCleanup,
  archivePtRoutine,
  buildPtCleanupPlan,
  commitPtRun,
  deletePtRoutine,
  deletePtSession,
  formatPtPrescription,
  formatPtResistance,
  formatPtTarget,
  getPtRoutine,
  getPtSessionDetail,
  isSafeVideoUrl,
  listArchivedPtRoutines,
  listPtRoutines,
  listPtSessions,
  planPtCleanup,
  ptCleanupCount,
  normalizeVideoUrl,
  PtValidationError,
  ptCheckActuals,
  resolvePtCheck,
  savePtRoutine,
  unarchivePtRoutine,
  updatePtSession,
  validatePtExercise,
  type PtExerciseDraft,
} from './pt'

beforeEach(async () => { await __resetForTest() })

const repsDraft = (over: Partial<PtExerciseDraft> = {}): PtExerciseDraft => ({
  name: 'Band pull-apart',
  sets: 3,
  measure: 'reps',
  targetReps: 15,
  resistanceKind: 'band',
  resistanceBand: 'red',
  ...over,
})

const sledDraft = (over: Partial<PtExerciseDraft> = {}): PtExerciseDraft => ({
  name: 'Backward sled walk',
  sets: 3,
  measure: 'distance',
  targetDistance: 50,
  distanceUnit: 'yd',
  resistanceKind: 'weight',
  resistanceWeight: 180,
  ...over,
})

describe('isSafeVideoUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeVideoUrl('https://example.com/x')).toBe(true)
    expect(isSafeVideoUrl('http://example.com/x')).toBe(true)
    expect(isSafeVideoUrl('  https://example.com/x  ')).toBe(true)
  })

  it('rejects script-bearing and non-navigable schemes', () => {
    expect(isSafeVideoUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeVideoUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isSafeVideoUrl('file:///etc/passwd')).toBe(false)
  })

  it('rejects a scheme-less string, which would resolve against our own origin', () => {
    expect(isSafeVideoUrl('example.com/video')).toBe(false)
    expect(isSafeVideoUrl('/videos/1')).toBe(false)
  })
})

describe('normalizeVideoUrl', () => {
  it('returns null for blank input', () => {
    expect(normalizeVideoUrl('')).toBeNull()
    expect(normalizeVideoUrl('   ')).toBeNull()
    expect(normalizeVideoUrl(null)).toBeNull()
    expect(normalizeVideoUrl(undefined)).toBeNull()
  })

  it('trims a valid link', () => {
    expect(normalizeVideoUrl('  https://example.com/x ')).toBe('https://example.com/x')
  })

  it('throws on an unsafe link', () => {
    expect(() => normalizeVideoUrl('javascript:alert(1)')).toThrow(PtValidationError)
  })
})

describe('formatting', () => {
  it('formats each measure', () => {
    expect(formatPtTarget({ measure: 'reps', targetReps: 15 })).toBe('15 reps')
    expect(formatPtTarget({ measure: 'time', targetSeconds: 30 })).toBe('0:30')
    expect(formatPtTarget({ measure: 'time', targetSeconds: 90 })).toBe('1:30')
    expect(formatPtTarget({ measure: 'distance', targetDistance: 50, distanceUnit: 'yd' })).toBe('50 yd')
  })

  it('keeps the distance unit the exercise was written in', () => {
    expect(formatPtTarget({ measure: 'distance', targetDistance: 20, distanceUnit: 'm' })).toBe('20 m')
    expect(formatPtTarget({ measure: 'distance', targetDistance: 20, distanceUnit: 'ft' })).toBe('20 ft')
  })

  it('falls back to the measure name when the target is missing', () => {
    expect(formatPtTarget({ measure: 'reps', targetReps: null })).toBe('reps')
    expect(formatPtTarget({ measure: 'time', targetSeconds: null })).toBe('time')
    expect(formatPtTarget({ measure: 'distance', targetDistance: null })).toBe('distance')
  })

  it('defaults a distance with no stored unit to yards', () => {
    expect(formatPtTarget({ measure: 'distance', targetDistance: 50 })).toBe('50 yd')
  })

  it('formats resistance by kind', () => {
    expect(formatPtResistance({ resistanceKind: 'weight', resistanceWeight: 180 })).toBe('180 lb')
    expect(formatPtResistance({ resistanceKind: 'band', resistanceBand: 'red' })).toBe('red band')
    expect(formatPtResistance({ resistanceKind: 'none' })).toBe('')
  })

  it('does not repeat the word band when the user typed it', () => {
    expect(formatPtResistance({ resistanceKind: 'band', resistanceBand: 'red band' })).toBe('red band')
    expect(formatPtResistance({ resistanceKind: 'band', resistanceBand: 'two green bands' })).toBe('two green bands')
  })

  it('returns empty for a kind with no value', () => {
    expect(formatPtResistance({ resistanceKind: 'weight', resistanceWeight: null })).toBe('')
    expect(formatPtResistance({ resistanceKind: 'band', resistanceBand: '  ' })).toBe('')
  })

  it('renders the sled example as one line', () => {
    expect(formatPtPrescription({
      sets: 3, measure: 'distance', targetDistance: 50, distanceUnit: 'yd',
      resistanceKind: 'weight', resistanceWeight: 180,
    })).toBe('3 x 50 yd . 180 lb')
  })

  it('omits the resistance clause for bodyweight work', () => {
    expect(formatPtPrescription({
      sets: 2, measure: 'time', targetSeconds: 45, resistanceKind: 'none',
    })).toBe('2 x 0:45')
  })
})

describe('validatePtExercise', () => {
  it('keeps optional equipment height alongside weight, sets, and reps', () => {
    const row = validatePtExercise(repsDraft({
      name: 'Step down', sets: 3, targetReps: 10,
      resistanceKind: 'weight', resistanceWeight: 10,
      equipmentHeight: 6.5, equipmentHeightUnit: 'in',
    }), 1, 0)
    expect(formatPtPrescription(row)).toBe('3 x 10 reps . 10 lb . 6.5 in high')
    expect(formatPtPrescription({ ...row, resistanceKind: 'none', equipmentHeight: 15, equipmentHeightUnit: 'cm' }))
      .toBe('3 x 10 reps . 15 cm high')
  })

  it('leaves old prescriptions unchanged and clears the unit when height is removed', () => {
    const row = validatePtExercise(repsDraft({ equipmentHeight: null, equipmentHeightUnit: 'cm' }), 1, 0)
    expect(row.equipmentHeight).toBeNull()
    expect(row.equipmentHeightUnit).toBeNull()
    expect(formatPtPrescription(row)).toBe('3 x 15 reps . red band')
  })

  it.each([0, -1, NaN, Infinity])('rejects invalid equipment height %s', equipmentHeight => {
    expect(() => validatePtExercise(repsDraft({ equipmentHeight }), 1, 0)).toThrow(/equipment height/)
  })

  it('rejects unknown height units', () => {
    expect(() => validatePtExercise(repsDraft({ equipmentHeight: 6, equipmentHeightUnit: 'ft' as 'in' }), 1, 0))
      .toThrow(/equipment height unit/)
  })

  it('nulls the fields outside the chosen measure and resistance', () => {
    const row = validatePtExercise(
      repsDraft({ targetSeconds: 30, targetDistance: 25, resistanceWeight: 40 }),
      7,
      2,
    )
    expect(row).toMatchObject({
      routineId: 7, order: 2, measure: 'reps', targetReps: 15,
      targetSeconds: null, targetDistance: null, distanceUnit: null,
      resistanceKind: 'band', resistanceBand: 'red', resistanceWeight: null,
    })
  })

  it('keeps the distance unit alongside the distance', () => {
    const row = validatePtExercise(sledDraft(), 1, 0)
    expect(row.targetDistance).toBe(50)
    expect(row.distanceUnit).toBe('yd')
    expect(row.resistanceWeight).toBe(180)
  })

  it('trims name and description, and nulls a blank description', () => {
    const row = validatePtExercise(repsDraft({ name: '  Wall slide  ', description: '   ' }), 1, 0)
    expect(row.name).toBe('Wall slide')
    expect(row.description).toBeNull()
  })

  it('rejects a blank name', () => {
    expect(() => validatePtExercise(repsDraft({ name: '   ' }), 1, 0)).toThrow(/name is required/i)
  })

  it('rejects a non-whole or out-of-range set count', () => {
    expect(() => validatePtExercise(repsDraft({ sets: 0 }), 1, 0)).toThrow(/1 to 99/)
    expect(() => validatePtExercise(repsDraft({ sets: 2.5 }), 1, 0)).toThrow(/1 to 99/)
    expect(() => validatePtExercise(repsDraft({ sets: 100 }), 1, 0)).toThrow(/1 to 99/)
  })

  it('rejects a missing or zero target for each measure', () => {
    expect(() => validatePtExercise(repsDraft({ targetReps: null }), 1, 0)).toThrow(/reps/)
    expect(() => validatePtExercise(
      repsDraft({ measure: 'time', targetSeconds: 0 }), 1, 0,
    )).toThrow(/hold time/)
    expect(() => validatePtExercise(
      sledDraft({ targetDistance: null }), 1, 0,
    )).toThrow(/distance/)
  })

  it('rejects an unknown distance unit', () => {
    expect(() => validatePtExercise(
      sledDraft({ distanceUnit: 'furlong' as never }), 1, 0,
    )).toThrow(/unknown distance unit/i)
  })

  it('rejects resistance with no value', () => {
    expect(() => validatePtExercise(
      sledDraft({ resistanceWeight: 0 }), 1, 0,
    )).toThrow(/resistance weight/)
    expect(() => validatePtExercise(
      repsDraft({ resistanceBand: '' }), 1, 0,
    )).toThrow(/name the band/i)
  })
})

describe('savePtRoutine', () => {
  it('creates a routine with its exercises in order', async () => {
    const id = await savePtRoutine(db, {
      name: '  Shoulder rehab ',
      notes: ' 3x a week ',
      exercises: [repsDraft(), sledDraft()],
    })

    const detail = await getPtRoutine(db, id)
    expect(detail!.routine.name).toBe('Shoulder rehab')
    expect(detail!.routine.notes).toBe('3x a week')
    expect(detail!.exercises.map(e => e.name)).toEqual(['Band pull-apart', 'Backward sled walk'])
    expect(detail!.exercises.map(e => e.order)).toEqual([0, 1])
  })

  it('assigns each new routine the next order', async () => {
    await savePtRoutine(db, { name: 'A', exercises: [repsDraft()] })
    await savePtRoutine(db, { name: 'B', exercises: [repsDraft()] })
    expect((await listPtRoutines(db)).map(r => r.name)).toEqual(['A', 'B'])
  })

  it('rejects a blank name and an empty exercise list', async () => {
    await expect(savePtRoutine(db, { name: '  ', exercises: [repsDraft()] }))
      .rejects.toThrow(/routine name is required/i)
    await expect(savePtRoutine(db, { name: 'Empty', exercises: [] }))
      .rejects.toThrow(/at least one exercise/i)
  })

  it('writes nothing at all when one row fails validation', async () => {
    await expect(savePtRoutine(db, {
      name: 'Partly bad',
      exercises: [repsDraft(), repsDraft({ name: '' })],
    })).rejects.toThrow(PtValidationError)

    expect(await db.ptRoutines.count()).toBe(0)
    expect(await db.ptExercises.count()).toBe(0)
  })

  it('updates existing rows in place rather than replacing them', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const before = (await getPtRoutine(db, id))!.exercises[0]

    await savePtRoutine(db, {
      id,
      name: 'Rehab',
      exercises: [{ ...repsDraft(), id: before.id, sets: 5, resistanceBand: 'green' }],
    })

    const after = (await getPtRoutine(db, id))!.exercises
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(before.id)
    expect(after[0].sets).toBe(5)
    expect(after[0].resistanceBand).toBe('green')
  })

  it('reorders by list position', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft(), sledDraft()] })
    const [first, second] = (await getPtRoutine(db, id))!.exercises

    await savePtRoutine(db, {
      id,
      name: 'Rehab',
      exercises: [
        { ...sledDraft(), id: second.id },
        { ...repsDraft(), id: first.id },
      ],
    })

    expect((await getPtRoutine(db, id))!.exercises.map(e => e.name))
      .toEqual(['Backward sled walk', 'Band pull-apart'])
  })

  it('deletes a removed exercise that was never performed', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft(), sledDraft()] })
    const [keep, drop] = (await getPtRoutine(db, id))!.exercises

    await savePtRoutine(db, { id, name: 'Rehab', exercises: [{ ...repsDraft(), id: keep.id }] })

    expect(await db.ptExercises.get(drop.id!)).toBeUndefined()
  })

  it('archives a removed exercise that a past run performed, so the run still names it', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft(), sledDraft()] })
    const [keep, drop] = (await getPtRoutine(db, id))!.exercises
    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date('2026-09-10'),
      checks: [{ ptExerciseId: drop.id!, setNumber: 1, done: true }],
    })

    await savePtRoutine(db, { id, name: 'Rehab', exercises: [{ ...repsDraft(), id: keep.id }] })

    expect((await db.ptExercises.get(drop.id!))?.archived).toBe(true)
    // Dropped from the checklist…
    expect((await getPtRoutine(db, id))!.exercises.map(e => e.id)).toEqual([keep.id])
    // …but the run that performed it still renders its name.
    const detail = await getPtSessionDetail(db, sessionId)
    expect(detail!.exercises.map(e => e.exercise.name)).toEqual(['Backward sled walk'])
  })
})

describe('recorded actuals', () => {
  it('resolves a set against the prescription, overriding only what differs', () => {
    const ex = validatePtExercise(repsDraft({
      resistanceKind: 'weight', resistanceWeight: 10,
      equipmentHeight: 6, equipmentHeightUnit: 'in',
    }), 1, 0)

    expect(resolvePtCheck(ex)).toMatchObject({ reps: 15, weight: 10, equipmentHeight: 6, equipmentHeightUnit: 'in' })
    expect(resolvePtCheck(ex, { equipmentHeight: 12 })).toMatchObject({ reps: 15, weight: 10, equipmentHeight: 12 })
    // Explicit null is a step taken at floor level, not "as prescribed".
    expect(resolvePtCheck(ex, { equipmentHeight: null })).toMatchObject({ equipmentHeight: null, equipmentHeightUnit: null })
    // Fields outside the measure and resistance kind are nulled, never left
    // undefined — SQLiteTable.update drops undefined keys and would keep a stale
    // value from whatever the row held before.
    expect(resolvePtCheck(ex)).toMatchObject({ seconds: null, distance: null, distanceUnit: null, band: null })
  })

  /**
   * The regression that decided the design: pointing a recorded set at the
   * prescription instead of copying it means editing the routine silently
   * rewrites history.
   */
  it('keeps what a run recorded when the routine is edited afterwards', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ targetReps: 10 })] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date('2026-09-10'),
      checks: [{
        ptExerciseId: exercise.id!, setNumber: 1, done: true,
        ...resolvePtCheck(exercise),
      }],
    })

    await savePtRoutine(db, {
      id, name: 'Rehab',
      exercises: [{ ...repsDraft({ targetReps: 25, resistanceBand: 'green' }), id: exercise.id }],
    })

    const detail = await getPtSessionDetail(db, sessionId)
    const check = detail!.exercises[0].checks[0]
    expect(check.reps).toBe(10)
    expect(check.band).toBe('red')
    expect(ptCheckActuals(check, (await getPtRoutine(db, id))!.exercises[0]))
      .toMatchObject({ reps: 10, band: 'red' })
  })

  it('falls back to the prescription only for a row that recorded nothing', async () => {
    const ex = validatePtExercise(repsDraft({ targetReps: 12 }), 1, 0)
    const legacy = { ptExerciseId: 1, setNumber: 1, done: true }

    expect(ptCheckActuals(legacy, ex)).toMatchObject({ reps: 12, band: 'red' })
    expect(ptCheckActuals({ ...legacy, reps: 8 }, ex)).toMatchObject({ reps: 8 })
  })
})

describe('updatePtSession', () => {
  const seedRun = async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ sets: 3 }), sledDraft()] })
    const [reps, sled] = (await getPtRoutine(db, id))!.exercises
    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date('2026-09-18'),
      checks: [
        ...[1, 2, 3].map(setNumber => ({ ptExerciseId: reps.id!, setNumber, done: true, ...resolvePtCheck(reps) })),
        { ptExerciseId: sled.id!, setNumber: 1, done: true, ...resolvePtCheck(sled) },
      ],
      exerciseNotes: { [reps.id!]: 'tight' },
    })
    return { sessionId, reps, sled }
  }

  const setsOf = async (sessionId: number, exerciseId: number) =>
    (await db.ptSetChecks.where('sessionId').equals(sessionId).toArray())
      .filter(c => c.ptExerciseId === exerciseId)
      .sort((a, b) => a.setNumber - b.setNumber)

  it('rewrites one exercise and leaves the rest of the run alone', async () => {
    const { sessionId, reps, sled } = await seedRun()

    await updatePtSession(db, {
      sessionId,
      exercises: [{
        ptExerciseId: reps.id!,
        checks: [{ setNumber: 1, done: true, ...resolvePtCheck(reps, { reps: 8 }) }],
        note: 'tight',
      }],
    })

    expect((await setsOf(sessionId, reps.id!)).map(c => c.reps)).toEqual([8])
    expect(await setsOf(sessionId, sled.id!)).toHaveLength(1)
  })

  /**
   * The reason this rewrites rather than diffing by set number: renumbering
   * survivors would transiently collide with the UNIQUE index on
   * (sessionId, ptExerciseId, setNumber).
   */
  it('removes a middle set and renumbers without tripping the unique index', async () => {
    const { sessionId, reps } = await seedRun()

    await updatePtSession(db, {
      sessionId,
      exercises: [{
        ptExerciseId: reps.id!,
        checks: [
          { setNumber: 1, done: true, ...resolvePtCheck(reps, { reps: 1 }) },
          { setNumber: 2, done: true, ...resolvePtCheck(reps, { reps: 3 }) },
        ],
      }],
    })

    const rows = await setsOf(sessionId, reps.id!)
    expect(rows.map(c => c.setNumber)).toEqual([1, 2])
    expect(rows.map(c => c.reps)).toEqual([1, 3])
  })

  it('drops the note when an exercise is edited out of the run entirely', async () => {
    const { sessionId, reps } = await seedRun()

    await updatePtSession(db, { sessionId, exercises: [{ ptExerciseId: reps.id!, checks: [] }] })

    expect(await setsOf(sessionId, reps.id!)).toHaveLength(0)
    expect((await db.ptNotes.where('sessionId').equals(sessionId).toArray())).toHaveLength(0)
  })

  /**
   * An import can leave checks whose exercise no longer resolves, and
   * `getPtSessionDetail` hides them — so a caller editing what it can see must
   * not take them with it.
   */
  it('leaves an orphaned check alone, having never shown it to the caller', async () => {
    const { sessionId, reps } = await seedRun()
    await db.ptSetChecks.add({ sessionId, ptExerciseId: 9999, setNumber: 1, done: true })

    await updatePtSession(db, {
      sessionId,
      exercises: [{ ptExerciseId: reps.id!, checks: [{ setNumber: 1, done: true, ...resolvePtCheck(reps) }] }],
    })

    expect(await setsOf(sessionId, 9999)).toHaveLength(1)
  })

  it('updates the session note', async () => {
    const { sessionId } = await seedRun()
    await updatePtSession(db, { sessionId, notes: '  felt better  ', exercises: [] })
    expect((await db.ptSessions.get(sessionId))?.notes).toBe('felt better')
    await updatePtSession(db, { sessionId, notes: '   ', exercises: [] })
    expect((await db.ptSessions.get(sessionId))?.notes).toBeNull()
  })

  it('refuses to empty a run, and rolls the whole edit back when it would', async () => {
    const { sessionId, reps, sled } = await seedRun()

    await expect(updatePtSession(db, {
      sessionId,
      exercises: [
        { ptExerciseId: reps.id!, checks: [] },
        { ptExerciseId: sled.id!, checks: [] },
      ],
    })).rejects.toThrow(PtValidationError)

    // Nothing was kept: the reps sets deleted before the failing check are back.
    expect(await setsOf(sessionId, reps.id!)).toHaveLength(3)
    expect(await setsOf(sessionId, sled.id!)).toHaveLength(1)
  })

  it('rejects an edit to a run that is already gone', async () => {
    await expect(updatePtSession(db, { sessionId: 4242, exercises: [] }))
      .rejects.toThrow(PtValidationError)
  })
})

describe('deletePtRoutine', () => {
  it('removes the routine, its exercises, and every run of it', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(),
      notes: 'ok',
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
      exerciseNotes: { [exercise.id!]: 'tight' },
    })

    await deletePtRoutine(db, id)

    expect(await db.ptRoutines.count()).toBe(0)
    expect(await db.ptExercises.count()).toBe(0)
    expect(await db.ptSessions.count()).toBe(0)
    expect(await db.ptSetChecks.count()).toBe(0)
    expect(await db.ptNotes.count()).toBe(0)
  })

  it('leaves another routine and its runs untouched', async () => {
    const doomed = await savePtRoutine(db, { name: 'Old', exercises: [repsDraft()] })
    const kept = await savePtRoutine(db, { name: 'Current', exercises: [sledDraft()] })
    const keptExercise = (await getPtRoutine(db, kept))!.exercises[0]
    await commitPtRun(db, {
      routineId: kept,
      date: new Date(),
      checks: [{ ptExerciseId: keptExercise.id!, setNumber: 1, done: true }],
    })

    await deletePtRoutine(db, doomed)

    expect((await listPtRoutines(db)).map(r => r.name)).toEqual(['Current'])
    expect(await db.ptSessions.count()).toBe(1)
    expect(await db.ptSetChecks.count()).toBe(1)
  })
})

describe('commitPtRun', () => {
  it('writes one check per prescribed set, ticked or not', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ sets: 3 })] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]

    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date('2026-09-16T10:00:00'),
      checks: [
        { ptExerciseId: exercise.id!, setNumber: 1, done: true },
        { ptExerciseId: exercise.id!, setNumber: 2, done: true },
        { ptExerciseId: exercise.id!, setNumber: 3, done: false },
      ],
    })

    const checks = await db.ptSetChecks.where('sessionId').equals(sessionId).toArray()
    expect(checks).toHaveLength(3)
    expect(checks.filter(c => c.done)).toHaveLength(2)
  })

  it('stores blank session notes as null and drops blank exercise notes', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]

    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date(),
      notes: '   ',
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
      exerciseNotes: { [exercise.id!]: '   ' },
    })

    expect((await db.ptSessions.get(sessionId))?.notes).toBeNull()
    expect(await db.ptNotes.count()).toBe(0)
  })

  it('keeps a non-blank exercise note, trimmed', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]

    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date(),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
      exerciseNotes: { [exercise.id!]: '  switched to green  ' },
    })

    const notes = await db.ptNotes.where('sessionId').equals(sessionId).toArray()
    expect(notes).toEqual([expect.objectContaining({ ptExerciseId: exercise.id, notes: 'switched to green' })])
  })

  it('refuses a run with no sets', async () => {
    await expect(commitPtRun(db, { routineId: 1, date: new Date(), checks: [] }))
      .rejects.toThrow(PtValidationError)
    expect(await db.ptSessions.count()).toBe(0)
  })
})

describe('listPtSessions', () => {
  it('summarises each run newest first with its done/total count', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ sets: 2 })] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    const run = async (date: Date, done: boolean) => commitPtRun(db, {
      routineId: id,
      date,
      checks: [
        { ptExerciseId: exercise.id!, setNumber: 1, done: true },
        { ptExerciseId: exercise.id!, setNumber: 2, done },
      ],
    })
    // Constructed locally, not parsed from 'YYYY-MM-DD': that form is UTC
    // midnight, which getDate() then reads back as the previous day west of
    // Greenwich. Same reason formatDateIso exists.
    await run(new Date(2026, 8, 14), true)
    await run(new Date(2026, 8, 16), false)

    const list = await listPtSessions(db)
    expect(list.map(s => s.session.date.getDate())).toEqual([16, 14])
    expect(list.map(s => `${s.done}/${s.total}`)).toEqual(['1/2', '2/2'])
    expect(list[0].routineName).toBe('Rehab')
  })

  it('caps the list at the requested limit', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    for (const day of [10, 11, 12]) {
      await commitPtRun(db, {
        routineId: id,
        date: new Date(`2026-09-${day}`),
        checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
      })
    }
    expect(await listPtSessions(db, 2)).toHaveLength(2)
  })

  it('returns an empty list when nothing has been run', async () => {
    expect(await listPtSessions(db)).toEqual([])
  })
})

describe('getPtSessionDetail', () => {
  it('returns each exercise with its checks and note, in routine order', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ sets: 2 }), sledDraft({ sets: 1 })] })
    const [first, second] = (await getPtRoutine(db, id))!.exercises

    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date('2026-09-16'),
      notes: 'good day',
      checks: [
        { ptExerciseId: second.id!, setNumber: 1, done: true },
        { ptExerciseId: first.id!, setNumber: 1, done: true },
        { ptExerciseId: first.id!, setNumber: 2, done: false },
      ],
      exerciseNotes: { [second.id!]: 'heavier sled' },
    })

    const detail = await getPtSessionDetail(db, sessionId)
    expect(detail!.routineName).toBe('Rehab')
    expect(detail!.session.notes).toBe('good day')
    expect(detail!.exercises.map(e => e.exercise.name)).toEqual(['Band pull-apart', 'Backward sled walk'])
    expect(detail!.exercises[0].checks.map(c => c.setNumber)).toEqual([1, 2])
    expect(detail!.exercises[0].note).toBeNull()
    expect(detail!.exercises[1].note).toBe('heavier sled')
  })

  it('returns null for a session that does not exist', async () => {
    expect(await getPtSessionDetail(db, 999)).toBeNull()
  })

  it('names a run whose routine was deleted rather than failing', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date(),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
    })
    await db.ptRoutines.delete(id)

    expect((await getPtSessionDetail(db, sessionId))!.routineName).toBe('Deleted routine')
    expect((await listPtSessions(db))[0].routineName).toBe('Deleted routine')
  })
})

describe('deletePtSession', () => {
  it('removes the run with its checks and notes, leaving the routine alone', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date(),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
      exerciseNotes: { [exercise.id!]: 'note' },
    })

    await deletePtSession(db, sessionId)

    expect(await db.ptSessions.count()).toBe(0)
    expect(await db.ptSetChecks.count()).toBe(0)
    expect(await db.ptNotes.count()).toBe(0)
    expect((await listPtRoutines(db)).map(r => r.name)).toEqual(['Rehab'])
  })
})

describe('listPtRoutines', () => {
  it('omits archived routines', async () => {
    const id = await savePtRoutine(db, { name: 'Old', exercises: [repsDraft()] })
    await savePtRoutine(db, { name: 'Current', exercises: [repsDraft()] })
    await db.ptRoutines.update(id, { archived: true })
    expect((await listPtRoutines(db)).map(r => r.name)).toEqual(['Current'])
  })
})

describe('getPtRoutine', () => {
  it('returns null for a routine that does not exist', async () => {
    expect(await getPtRoutine(db, 999)).toBeNull()
  })
})

describe('archivePtRoutine', () => {
  it('drops the routine from the start list but keeps its runs', async () => {
    const id = await savePtRoutine(db, { name: 'Knee block', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 16),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
    })

    await archivePtRoutine(db, id)

    expect(await listPtRoutines(db)).toEqual([])
    expect((await listArchivedPtRoutines(db)).map(r => r.name)).toEqual(['Knee block'])
    // The whole point of archiving over deleting: the history survives, and
    // still resolves to the routine's real name.
    const history = await listPtSessions(db)
    expect(history).toHaveLength(1)
    expect(history[0].routineName).toBe('Knee block')
  })

  it('restores an archived routine unchanged', async () => {
    const id = await savePtRoutine(db, { name: 'Knee block', exercises: [repsDraft(), sledDraft()] })
    await archivePtRoutine(db, id)
    await unarchivePtRoutine(db, id)

    expect((await listPtRoutines(db)).map(r => r.name)).toEqual(['Knee block'])
    expect(await listArchivedPtRoutines(db)).toEqual([])
    expect((await getPtRoutine(db, id))!.exercises).toHaveLength(2)
  })

  it('leaves an archived routine runnable by direct lookup', async () => {
    const id = await savePtRoutine(db, { name: 'Knee block', exercises: [repsDraft()] })
    await archivePtRoutine(db, id)
    // getPtRoutine is not the start list — a run already under way, or a
    // bookmarked URL, still resolves.
    expect((await getPtRoutine(db, id))!.routine.archived).toBe(true)
  })
})

describe('buildPtCleanupPlan', () => {
  it('finds nothing in a consistent database', () => {
    const result = buildPtCleanupPlan(
      [{ id: 1 }],
      [{ id: 10, routineId: 1 }],
      [{ id: 100, routineId: 1 }],
      [{ id: 1000, sessionId: 100, ptExerciseId: 10 }],
      [{ id: 2000, sessionId: 100, ptExerciseId: 10 }],
    )
    expect(ptCleanupCount(result)).toBe(0)
  })

  it('flags exercises and runs whose routine is gone', () => {
    const result = buildPtCleanupPlan(
      [{ id: 1 }],
      [{ id: 10, routineId: 1 }, { id: 11, routineId: 99 }],
      [{ id: 100, routineId: 1 }, { id: 101, routineId: 99 }],
      [],
      [],
    )
    expect(result.orphanExerciseIds).toEqual([11])
    expect(result.orphanSessionIds).toEqual([101])
  })

  it('flags checks and notes whose session is gone', () => {
    const result = buildPtCleanupPlan(
      [{ id: 1 }],
      [{ id: 10, routineId: 1 }],
      [{ id: 100, routineId: 1 }],
      [{ id: 1000, sessionId: 100, ptExerciseId: 10 }, { id: 1001, sessionId: 999, ptExerciseId: 10 }],
      [{ id: 2000, sessionId: 999, ptExerciseId: 10 }],
    )
    expect(result.orphanCheckIds).toEqual([1001])
    expect(result.orphanNoteIds).toEqual([2000])
  })

  it('flags a check whose exercise is gone — the case that makes a run under-count', () => {
    const result = buildPtCleanupPlan(
      [{ id: 1 }],
      [{ id: 10, routineId: 1 }],
      [{ id: 100, routineId: 1 }],
      [{ id: 1000, sessionId: 100, ptExerciseId: 10 }, { id: 1001, sessionId: 100, ptExerciseId: 77 }],
      [],
    )
    expect(result.orphanCheckIds).toEqual([1001])
  })

  it('sweeps the children of a run it is already removing, in one pass', () => {
    const result = buildPtCleanupPlan(
      [],
      [{ id: 10, routineId: 99 }],
      [{ id: 100, routineId: 99 }],
      [{ id: 1000, sessionId: 100, ptExerciseId: 10 }],
      [{ id: 2000, sessionId: 100, ptExerciseId: 10 }],
    )
    // Without this, cleaning a run left its checks behind as a second
    // generation of orphans that a further pass would have to catch.
    expect(result).toEqual({
      orphanExerciseIds: [10],
      orphanSessionIds: [100],
      orphanCheckIds: [1000],
      orphanNoteIds: [2000],
    })
    expect(ptCleanupCount(result)).toBe(4)
  })

})

describe('planPtCleanup / applyPtCleanup', () => {
  it('removes exactly the orphans an import left behind', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    const sessionId = await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 16),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
    })
    // What a hand-trimmed backup restores: rows pointing at ids that are absent.
    await db.ptSetChecks.add({ sessionId: 9999, ptExerciseId: exercise.id!, setNumber: 1, done: true })
    await db.ptNotes.add({ sessionId: 9999, ptExerciseId: exercise.id!, notes: 'orphan' })
    await db.ptExercises.add({
      routineId: 9999, name: 'Orphan', sets: 1, measure: 'reps', targetReps: 5,
      resistanceKind: 'none', order: 0,
    })

    const plan = await planPtCleanup(db)
    expect(ptCleanupCount(plan)).toBe(3)
    await applyPtCleanup(db, plan)

    expect(await db.ptExercises.count()).toBe(1)
    expect(await db.ptNotes.count()).toBe(0)
    // The healthy run is untouched.
    const checks = await db.ptSetChecks.where('sessionId').equals(sessionId).toArray()
    expect(checks).toHaveLength(1)
    expect(await db.ptSetChecks.count()).toBe(1)
  })

  it('leaves an ARCHIVED routine and its runs alone', async () => {
    const id = await savePtRoutine(db, { name: 'Old block', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
    })
    await archivePtRoutine(db, id)

    // Archived is retired, not deleted: the routine row is still there, so
    // nothing that points at it is an orphan.
    const plan = await planPtCleanup(db)
    expect(ptCleanupCount(plan)).toBe(0)
    await applyPtCleanup(db, plan)
    expect(await db.ptSetChecks.count()).toBe(1)
    expect(await db.ptExercises.count()).toBe(1)
  })

  it('is a no-op on a clean database', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
    })

    const plan = await planPtCleanup(db)
    expect(ptCleanupCount(plan)).toBe(0)
    await applyPtCleanup(db, plan)

    expect(await db.ptSetChecks.count()).toBe(1)
    expect(await db.ptExercises.count()).toBe(1)
  })
})
