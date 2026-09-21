import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import PtSessionEditor from './PtSessionEditor'
import { db } from '../../db/index'
import {
  commitPtRun,
  getPtRoutine,
  getPtSessionDetail,
  savePtRoutine,
  type PtExerciseDraft,
} from '../../lib/pt'
import type { PtSetCheck } from '../../types/domain'
import { showToast, toast } from '../../store/toast-store'

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

beforeEach(async () => {
  await Promise.all([
    db.ptRoutines.clear(), db.ptExercises.clear(),
    db.ptSessions.clear(), db.ptSetChecks.clear(), db.ptNotes.clear(),
  ])
  // The toast is a module singleton and outlives a test; left standing, a
  // `waitFor` on its content passes against the previous test's message.
  showToast('')
})

afterEach(drain)

const stepUp = (over: Partial<PtExerciseDraft> = {}): PtExerciseDraft => ({
  name: 'Step up',
  sets: 2,
  measure: 'reps',
  targetReps: 10,
  resistanceKind: 'weight',
  resistanceWeight: 25,
  equipmentHeight: 12,
  equipmentHeightUnit: 'in',
  ...over,
})

const sledWalk = (over: Partial<PtExerciseDraft> = {}): PtExerciseDraft => ({
  name: 'Sled walk',
  sets: 1,
  measure: 'distance',
  targetDistance: 50,
  distanceUnit: 'm',
  resistanceKind: 'band',
  resistanceBand: 'red',
  ...over,
})

/** Open the run, render its editor, and hand back the rows it will write over. */
async function openEditor(sessionId: number) {
  const detail = (await getPtSessionDetail(db, sessionId))!
  render(() => <PtSessionEditor detail={detail} onSaved={() => {}} onCancel={() => {}} />)
  return detail
}

const rowsOf = async (sessionId: number): Promise<PtSetCheck[]> =>
  (await db.ptSetChecks.where('sessionId').equals(sessionId).toArray())
    .sort((a, b) => a.ptExerciseId - b.ptExerciseId || a.setNumber - b.setNumber)

describe('PtSessionEditor', () => {
  /**
   * The likeliest way the erasure actually happened: the user opens a run to fix
   * a typo in the session note. SAVE rewrites every check row of every exercise
   * in the run, so anything the read path re-resolved is gone — without the user
   * having touched a single set.
   */
  it('rewrites no actual and no recorded kind on a notes-only save', async () => {
    const routineId = await savePtRoutine(db, { name: 'Knee', exercises: [stepUp(), sledWalk()] })
    const [step, sled] = (await getPtRoutine(db, routineId))!.exercises
    const sessionId = await commitPtRun(db, {
      routineId,
      date: new Date(2026, 8, 16),
      notes: 'felt fine',
      checks: [
        {
          ptExerciseId: step.id!, setNumber: 1, done: true,
          reps: 10, weight: 25, equipmentHeight: 12, equipmentHeightUnit: 'in',
          measure: 'reps', resistanceKind: 'weight',
        },
        {
          ptExerciseId: step.id!, setNumber: 2, done: true,
          reps: 8, weight: 25, equipmentHeight: 12, equipmentHeightUnit: 'in',
          measure: 'reps', resistanceKind: 'weight',
        },
        {
          ptExerciseId: sled.id!, setNumber: 1, done: true,
          distance: 60, distanceUnit: 'm', band: 'green',
          measure: 'distance', resistanceKind: 'band',
        },
      ],
    })
    const before = await rowsOf(sessionId)

    // The routine moves on: the step-up goes bodyweight and timed, the sled walk
    // goes to plain reps with no resistance at all.
    await savePtRoutine(db, {
      id: routineId, name: 'Knee',
      exercises: [
        { ...stepUp({ measure: 'time', targetSeconds: 30, targetReps: undefined, resistanceKind: 'none', resistanceWeight: undefined }), id: step.id },
        { ...sledWalk({ measure: 'reps', targetReps: 12, targetDistance: undefined, distanceUnit: undefined, resistanceKind: 'none', resistanceBand: undefined }), id: sled.id },
      ],
    })

    await openEditor(sessionId)
    fireEvent.input(await screen.findByLabelText('Session notes'), { target: { value: 'felt fine, knee quiet' } })
    fireEvent.click(screen.getByText('SAVE CHANGES'))

    await waitFor(async () =>
      expect((await db.ptSessions.get(sessionId))!.notes).toBe('felt fine, knee quiet'))

    const after = await rowsOf(sessionId)
    expect(after).toHaveLength(before.length)
    for (const [i, row] of after.entries()) {
      const was = before[i]
      expect({ ...row, id: undefined }).toEqual({ ...was, id: undefined })
    }
  })

  /**
   * A row written before the kind columns existed has actuals but no context.
   * An unrelated save must leave that gap alone rather than stamping today's
   * routine onto it as though it were known history.
   */
  it('does not stamp the current routine onto a row that never recorded its kinds', async () => {
    const routineId = await savePtRoutine(db, { name: 'Knee', exercises: [stepUp({ sets: 1 })] })
    const step = (await getPtRoutine(db, routineId))!.exercises[0]
    const sessionId = await db.ptSessions.add({ routineId, date: new Date(2026, 8, 16), notes: null })
    await db.ptSetChecks.add({
      sessionId, ptExerciseId: step.id!, setNumber: 1, done: true,
      reps: 10, weight: 25, recorded: true,
    })

    await savePtRoutine(db, {
      id: routineId, name: 'Knee',
      exercises: [{ ...stepUp({ sets: 1, resistanceKind: 'none', resistanceWeight: undefined }), id: step.id }],
    })

    await openEditor(sessionId)
    fireEvent.input(await screen.findByLabelText('Session notes'), { target: { value: 'tidied' } })
    fireEvent.click(screen.getByText('SAVE CHANGES'))

    await waitFor(async () => expect((await db.ptSessions.get(sessionId))!.notes).toBe('tidied'))

    const [row] = await rowsOf(sessionId)
    expect(row).toMatchObject({ reps: 10, weight: 25 })
    expect(row.measure ?? null).toBeNull()
    expect(row.resistanceKind ?? null).toBeNull()
  })

  /**
   * Editing one set of an old run. The editor has to show that set the way it
   * was recorded — a distance set stays a distance set even once the routine
   * counts reps — and saving must not re-resolve the sets nobody touched.
   */
  it('edits a historical set under the kinds it was recorded with', async () => {
    const routineId = await savePtRoutine(db, { name: 'Knee', exercises: [sledWalk({ sets: 2, resistanceKind: 'weight', resistanceWeight: 180, resistanceBand: undefined })] })
    const sled = (await getPtRoutine(db, routineId))!.exercises[0]
    const sessionId = await commitPtRun(db, {
      routineId,
      date: new Date(2026, 8, 16),
      checks: [
        {
          ptExerciseId: sled.id!, setNumber: 1, done: true,
          distance: 60, distanceUnit: 'm', weight: 200,
          equipmentHeight: 12, equipmentHeightUnit: 'cm',
          measure: 'distance', resistanceKind: 'weight',
        },
        {
          ptExerciseId: sled.id!, setNumber: 2, done: true,
          distance: 50, distanceUnit: 'm', weight: 180,
          measure: 'distance', resistanceKind: 'weight',
        },
      ],
    })

    await savePtRoutine(db, {
      id: routineId, name: 'Knee',
      exercises: [{ ...sledWalk({ sets: 2, measure: 'reps', targetReps: 12, targetDistance: undefined, distanceUnit: undefined, resistanceKind: 'none', resistanceBand: undefined }), id: sled.id }],
    })

    await openEditor(sessionId)
    const row = await screen.findByRole('checkbox', { name: /Sled walk set 2/ })
    fireEvent.click(row.parentElement!.querySelector('button:not([role])')!)

    // The set was recorded as distance under load, so that is what it edits as.
    fireEvent.click(await screen.findByLabelText('Decrease set 2 distance'))
    fireEvent.click(screen.getByText('APPLY SET CHANGES'))
    fireEvent.click(screen.getByText('SAVE CHANGES'))

    await waitFor(async () => expect((await rowsOf(sessionId))[1].distance).toBe(49))

    const [first, second] = await rowsOf(sessionId)
    expect(first).toMatchObject({
      distance: 60, distanceUnit: 'm', weight: 200,
      equipmentHeight: 12, equipmentHeightUnit: 'cm',
      measure: 'distance', resistanceKind: 'weight',
    })
    expect(second).toMatchObject({
      distance: 49, distanceUnit: 'm', weight: 180,
      measure: 'distance', resistanceKind: 'weight',
    })
  })

  /**
   * Two commit points, and only the outer one writes. APPLY SET CHANGES puts an
   * edit into the run draft; SAVE CHANGES writes the draft. An edit still in the
   * inner editor is in neither, and saving over it would look like saving it.
   */
  it('refuses to save the run while a set has unapplied changes', async () => {
    const routineId = await savePtRoutine(db, { name: 'Knee', exercises: [stepUp({ sets: 1 })] })
    const step = (await getPtRoutine(db, routineId))!.exercises[0]
    const sessionId = await commitPtRun(db, {
      routineId,
      date: new Date(2026, 8, 16),
      checks: [{
        ptExerciseId: step.id!, setNumber: 1, done: true,
        reps: 10, weight: 25, measure: 'reps', resistanceKind: 'weight',
      }],
    })

    await openEditor(sessionId)
    const row = await screen.findByRole('checkbox', { name: /Step up set 1/ })
    fireEvent.click(row.parentElement!.querySelector('button:not([role])')!)
    fireEvent.click(await screen.findByLabelText('Decrease set 1 reps'))

    fireEvent.click(screen.getByText('SAVE CHANGES'))
    await waitFor(() => expect(toast()).toBe('One set has unapplied changes.'))
    expect((await rowsOf(sessionId))[0].reps).toBe(10)

    fireEvent.click(screen.getByText('APPLY SET CHANGES'))
    fireEvent.click(screen.getByText('SAVE CHANGES'))
    await waitFor(async () => expect((await rowsOf(sessionId))[0].reps).toBe(9))
  })

  /**
   * Removing a set renumbers the ones after it, and `updatePtSession` rewrites
   * the whole exercise from scratch. The survivor's kinds have to travel with
   * the draft rather than be recovered by matching its new set number to an old
   * row, which would hand it the removed set's context.
   */
  it('keeps each survivor its own kinds when an earlier set is removed', async () => {
    const routineId = await savePtRoutine(db, { name: 'Knee', exercises: [stepUp()] })
    const step = (await getPtRoutine(db, routineId))!.exercises[0]
    const sessionId = await commitPtRun(db, {
      routineId,
      date: new Date(2026, 8, 16),
      checks: [
        {
          ptExerciseId: step.id!, setNumber: 1, done: true,
          seconds: 30, measure: 'time', resistanceKind: 'none',
        },
        {
          ptExerciseId: step.id!, setNumber: 2, done: true,
          reps: 8, weight: 25, measure: 'reps', resistanceKind: 'weight',
        },
      ],
    })

    await openEditor(sessionId)
    fireEvent.click(await screen.findByLabelText('Remove Step up set 1'))
    fireEvent.click(screen.getByLabelText('Yes, remove step up set 1'))
    fireEvent.click(screen.getByText('SAVE CHANGES'))

    await waitFor(async () => expect(await rowsOf(sessionId)).toHaveLength(1))

    const [survivor] = await rowsOf(sessionId)
    expect(survivor).toMatchObject({
      setNumber: 1, reps: 8, weight: 25, measure: 'reps', resistanceKind: 'weight',
    })
    expect(survivor.seconds).toBeNull()
  })
})
