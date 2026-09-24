import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import PT from './PT'
import { db } from '../db/index'
import { archivePtRoutine, commitPtRun, getPtRoutine, resolvePtCheck, savePtRoutine, type PtExerciseDraft } from '../lib/pt'
import { clearAllPtRuns as clearPtRun, getPtRun, startPtRun, togglePtSet } from '../store/pt-store'
import { ConfirmationContext, createConfirmation } from '../hooks/use-confirmation'
import ConfirmationDialog from '../components/modals/ConfirmationDialog'
import { showToast, toast } from '../store/toast-store'

const mockNavigate = vi.fn()
vi.mock('@solidjs/router', async () => {
  const actual = await vi.importActual<typeof import('@solidjs/router')>('@solidjs/router')
  return { ...actual, useNavigate: () => mockNavigate }
})

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

const repsDraft = (over: Partial<PtExerciseDraft> = {}): PtExerciseDraft => ({
  name: 'Band pull-apart',
  sets: 3,
  measure: 'reps',
  targetReps: 15,
  resistanceKind: 'band',
  resistanceBand: 'red',
  ...over,
})

function renderPT() {
  const api = createConfirmation()
  render(() => (
    <ConfirmationContext.Provider value={api}>
      <Router>
        <Route path="*" component={PT} />
      </Router>
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

beforeEach(async () => {
  await Promise.all([
    db.ptRoutines.clear(), db.ptExercises.clear(),
    db.ptSessions.clear(), db.ptSetChecks.clear(), db.ptNotes.clear(),
  ])
  clearPtRun()
  mockNavigate.mockClear()
  // The toast is a module singleton and outlives a test; left standing, a
  // `waitFor` on its content passes against the previous test's message.
  showToast('')
})

afterEach(drain)

describe('PT screen', () => {
  it('invites the user to build a routine when there are none', async () => {
    renderPT()
    await screen.findByText(/No routines yet/i)
    expect(document.body.textContent).toContain('+ NEW ROUTINE')
  })

  it('lists routines with their exercise count', async () => {
    await savePtRoutine(db, { name: 'Shoulder rehab', exercises: [repsDraft(), repsDraft({ name: 'Wall slide' })] })
    renderPT()
    await screen.findByText('Shoulder rehab')
    expect(document.body.textContent).toContain('2 exercises')
  })

  it('singularises the count for a one-exercise routine', async () => {
    await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft()] })
    renderPT()
    await screen.findByText('Knee')
    expect(document.body.textContent).toContain('1 exercise')
    expect(document.body.textContent).not.toContain('1 exercises')
  })

  it('shows the routine notes', async () => {
    await savePtRoutine(db, { name: 'Knee', notes: 'from the clinic', exercises: [repsDraft()] })
    renderPT()
    await screen.findByText('from the clinic')
  })

  it('starts a run from the routine row', async () => {
    const id = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft()] })
    renderPT()
    fireEvent.click(await screen.findByText('START'))
    expect(mockNavigate).toHaveBeenCalledWith(`/pt/${id}/run`)
  })

  it('disables START for a routine whose exercises were all removed', async () => {
    const id = await savePtRoutine(db, { name: 'Empty-ish', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await db.ptExercises.delete(exercise.id!)

    renderPT()
    const start = await screen.findByText('START') as HTMLButtonElement
    await waitFor(() => expect(start.disabled).toBe(true))
  })

  it('offers to resume a run that is already under way', async () => {
    const id = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft()] })
    startPtRun(id)
    togglePtSet(1, 1)

    renderPT()
    const banner = await screen.findByText(/RESUME PT SESSION/)
    expect(banner.textContent).toContain('1 routine')
    fireEvent.click(banner)
    expect(mockNavigate).toHaveBeenCalledWith('/pt/run')
  })

  it('offers one resume control for a session and removes only a deleted routine', async () => {
    const knee = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft()] })
    const shoulder = await savePtRoutine(db, { name: 'Shoulder', exercises: [repsDraft()] })
    startPtRun(knee)
    togglePtSet(1, 1)
    startPtRun(shoulder)
    renderPT()
    await waitFor(() => expect(screen.getAllByText(/RESUME PT SESSION/)).toHaveLength(1))
    expect(screen.getByText(/RESUME PT SESSION/).textContent).toContain('2 routines')
    expect(await screen.findAllByText('RESUME')).toHaveLength(2)
    fireEvent.click(screen.getByText(/RESUME PT SESSION/))
    expect(mockNavigate).toHaveBeenCalledWith('/pt/run')

    fireEvent.click(screen.getByLabelText('Delete Knee'))
    fireEvent.click(await screen.findByRole('button', { name: /yes, delete knee/i }))
    await waitFor(() => expect(getPtRun(knee)).toBeUndefined())
    expect(getPtRun(shoulder)).toBeDefined()
  })

  it('deletes a routine and drops an in-progress run of it', async () => {
    const id = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft()] })
    startPtRun(id)
    renderPT()
    await screen.findByText('Knee')

    fireEvent.click(screen.getByLabelText('Delete Knee'))
    fireEvent.click(await screen.findByRole('button', { name: /yes, delete knee/i }))

    await waitFor(() => expect(document.body.textContent).toContain('No routines yet'))
    expect(await db.ptRoutines.count()).toBe(0)
    // The store no longer points at a routine that does not exist.
    await waitFor(() => expect(document.body.textContent).not.toContain('RESUME PT SESSION'))
  })

  it('starts selected routines together', async () => {
    const knee = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft()] })
    const shoulder = await savePtRoutine(db, { name: 'Shoulder', exercises: [repsDraft()] })
    renderPT()
    fireEvent.click(await screen.findByLabelText('Include Knee'))
    fireEvent.click(screen.getByLabelText('Include Shoulder'))
    fireEvent.click(screen.getByRole('button', { name: 'START SESSION (2)' }))
    expect(mockNavigate).toHaveBeenCalledWith('/pt/run')
    expect(getPtRun(knee)).toBeDefined()
    expect(getPtRun(shoulder)).toBeDefined()
  })

  it('lists past runs newest first with their done count', async () => {
    const id = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft({ sets: 2 })] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 14),
      checks: [
        { ptExerciseId: exercise.id!, setNumber: 1, done: true },
        { ptExerciseId: exercise.id!, setNumber: 2, done: true },
      ],
    })
    await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 16),
      checks: [
        { ptExerciseId: exercise.id!, setNumber: 1, done: true },
        { ptExerciseId: exercise.id!, setNumber: 2, done: false },
      ],
    })

    renderPT()
    await screen.findByText('PT HISTORY')
    await waitFor(() => expect(document.body.textContent).toContain('1/2'))
    expect(document.body.textContent).toContain('2/2')
    const body = document.body.textContent!
    expect(body.indexOf('Sep 16')).toBeLessThan(body.indexOf('Sep 14'))
  })

  it('tells apart several runs of one routine on the same day by their time', async () => {
    const id = await savePtRoutine(db, { name: 'Shoulder', exercises: [repsDraft({ sets: 1 })] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    for (const [hour, minute] of [[8, 5], [13, 30], [19, 45]]) {
      await commitPtRun(db, {
        routineId: id,
        date: new Date(2026, 8, 16, hour, minute),
        checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
      })
    }

    renderPT()
    await screen.findByText('7:45 PM')
    const body = document.body.textContent!
    expect(body.indexOf('7:45 PM')).toBeLessThan(body.indexOf('1:30 PM'))
    expect(body.indexOf('1:30 PM')).toBeLessThan(body.indexOf('8:05 AM'))
    // Each run's delete control names which one it removes.
    expect(screen.getByLabelText('Delete Shoulder run from Sep 16, 8:05 AM')).toBeTruthy()
    expect(screen.getByLabelText('Delete Shoulder run from Sep 16, 7:45 PM')).toBeTruthy()
  })

  it('expands a run to show what was done', async () => {
    const id = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft({ sets: 2 })] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 16),
      notes: 'felt fine',
      checks: [
        { ptExerciseId: exercise.id!, setNumber: 1, done: true },
        { ptExerciseId: exercise.id!, setNumber: 2, done: false },
      ],
      exerciseNotes: { [exercise.id!]: 'used the green band' },
    })

    renderPT()
    const row = await screen.findByText('Sep 16')
    fireEvent.click(row)

    await screen.findByText('used the green band')
    expect(document.body.textContent).toContain('2 x 15 reps . red band')
    expect(document.body.textContent).toContain('felt fine')
  })

  it('edits a recorded run in place and writes the change back', async () => {
    const id = await savePtRoutine(db, {
      name: 'Knee',
      exercises: [repsDraft({ name: 'Step down', sets: 2, targetReps: 10, resistanceKind: 'none' })],
    })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 16),
      checks: [1, 2].map(setNumber => ({
        ptExerciseId: exercise.id!, setNumber, done: true, ...resolvePtCheck(exercise),
      })),
    })

    renderPT()
    fireEvent.click(await screen.findByText('Sep 16'))
    fireEvent.click(await screen.findByText('EDIT RUN'))

    // Correct set 1 down a rep. Scoped by name: the routine list's "Include"
    // inputs are checkboxes too.
    const row = await screen.findByRole('checkbox', { name: /Step down set 1/ })
    fireEvent.click(row.parentElement!.querySelector('button:not([role])')!)
    fireEvent.click(await screen.findByLabelText('Decrease set 1 reps'))
    fireEvent.click(screen.getByText('APPLY SET CHANGES'))
    fireEvent.click(screen.getByText('SAVE CHANGES'))

    await waitFor(async () => {
      const checks = (await db.ptSetChecks.toArray()).sort((a, b) => a.setNumber - b.setNumber)
      expect(checks.map(c => c.reps)).toEqual([9, 10])
    })
    // Rewritten, not appended: still two sets for the one exercise.
    expect(await db.ptSetChecks.count()).toBe(2)
  })

  /*
   * A5. The editor lives inside the collapsible row, so folding it used to
   * unmount the draft with no prompt and no sign anything had been lost. The
   * draft is held above the row now, keyed by session.
   */

  /** Two runs, one exercise, so a draft attached to the wrong one would show. */
  const seedTwoRuns = async () => {
    const id = await savePtRoutine(db, {
      name: 'Knee',
      exercises: [repsDraft({ name: 'Step down', sets: 2, targetReps: 10, resistanceKind: 'none' })],
    })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    const checks = [1, 2].map(setNumber => ({
      ptExerciseId: exercise.id!, setNumber, done: true, ...resolvePtCheck(exercise),
    }))
    const older = await commitPtRun(db, { routineId: id, date: new Date(2026, 8, 14), checks })
    const newer = await commitPtRun(db, { routineId: id, date: new Date(2026, 8, 16), checks })
    return { id, exercise, older, newer }
  }

  const openRun = async (label: string) => {
    fireEvent.click(await screen.findByText(label))
    await screen.findByText(/EDIT RUN|SAVE CHANGES/)
  }

  const editSetOne = async (reps = 1) => {
    const row = await screen.findByRole('checkbox', { name: /Step down set 1/ })
    fireEvent.click(row.parentElement!.querySelector('button:not([role])')!)
    for (let i = 0; i < reps; i++) fireEvent.click(await screen.findByLabelText('Decrease set 1 reps'))
  }

  it('keeps an edit through a fold, a visit to another run, and a return', async () => {
    const { older, newer } = await seedTwoRuns()
    renderPT()

    await openRun('Sep 16')
    fireEvent.click(screen.getByText('EDIT RUN'))
    await editSetOne()
    fireEvent.click(screen.getByText('APPLY SET CHANGES'))
    fireEvent.input(screen.getByLabelText('Session notes'), { target: { value: 'knee quiet' } })

    // Fold, look at the older run, come back.
    fireEvent.click(screen.getByText('Sep 16'))
    await waitFor(() => expect(screen.queryByLabelText('Session notes')).toBeNull())
    expect(document.body.textContent).toContain('UNSAVED CHANGES')
    await openRun('Sep 14')
    fireEvent.click(screen.getByText('Sep 14'))
    await openRun('Sep 16')

    await waitFor(() => expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).value)
      .toBe('knee quiet'))
    expect(document.body.textContent).toContain('9 reps')
    // Nothing was written on the way.
    const rows = await db.ptSetChecks.where('sessionId').equals(newer).toArray()
    expect(rows.every(r => r.reps === 10)).toBe(true)
    // And the older run, which was visited in between, is untouched and clean.
    const olderRows = await db.ptSetChecks.where('sessionId').equals(older).toArray()
    expect(olderRows.every(r => r.reps === 10)).toBe(true)
  })

  it('keeps one draft per run', async () => {
    await seedTwoRuns()
    renderPT()

    await openRun('Sep 16')
    fireEvent.click(screen.getByText('EDIT RUN'))
    fireEvent.input(screen.getByLabelText('Session notes'), { target: { value: 'newer note' } })
    fireEvent.click(screen.getByText('Sep 16'))

    await openRun('Sep 14')
    fireEvent.click(screen.getByText('EDIT RUN'))
    fireEvent.input(screen.getByLabelText('Session notes'), { target: { value: 'older note' } })
    fireEvent.click(screen.getByText('Sep 14'))

    await openRun('Sep 16')
    await waitFor(() => expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).value)
      .toBe('newer note'))
  })

  it('DISCARD CHANGES drops the draft and gives the saved run back', async () => {
    await seedTwoRuns()
    renderPT()

    await openRun('Sep 16')
    fireEvent.click(screen.getByText('EDIT RUN'))
    fireEvent.input(screen.getByLabelText('Session notes'), { target: { value: 'scratch that' } })
    fireEvent.click(screen.getByText('DISCARD CHANGES'))

    await screen.findByText('EDIT RUN')
    expect(document.body.textContent).not.toContain('UNSAVED CHANGES')
    fireEvent.click(screen.getByText('EDIT RUN'))
    expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).value).toBe('')
  })

  it('keeps the edit when the write fails, so it can be retried', async () => {
    await seedTwoRuns()
    renderPT()

    await openRun('Sep 16')
    fireEvent.click(screen.getByText('EDIT RUN'))
    fireEvent.input(screen.getByLabelText('Session notes'), { target: { value: 'retry me' } })

    const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(screen.getByText('SAVE CHANGES'))
    await waitFor(() => expect(toast()).toContain('disk full'))
    spy.mockRestore()

    expect((screen.getByLabelText('Session notes') as HTMLTextAreaElement).value).toBe('retry me')
    fireEvent.click(screen.getByText('SAVE CHANGES'))
    await waitFor(async () => expect((await db.ptSessions.toArray())
      .find(s => s.notes === 'retry me')).toBeTruthy())
  })

  /**
   * The other half of the draft: values typed into a set editor but not yet
   * applied are in neither the run draft's sets nor the database, so lifting
   * only the applied half would still lose them on a fold.
   */
  it('keeps an unapplied set edit through a fold, and still blocks SAVE', async () => {
    const { newer } = await seedTwoRuns()
    renderPT()

    await openRun('Sep 16')
    fireEvent.click(screen.getByText('EDIT RUN'))
    await editSetOne(3)

    fireEvent.click(screen.getByText('Sep 16'))
    await waitFor(() => expect(screen.queryByText('APPLY SET CHANGES')).toBeNull())
    expect(document.body.textContent).toContain('UNSAVED CHANGES')
    await openRun('Sep 14')
    fireEvent.click(screen.getByText('Sep 14'))
    await openRun('Sep 16')

    // The set editor comes back open, on the same set, holding the same value.
    await screen.findByText('APPLY SET CHANGES')
    expect(document.body.textContent).toContain('Set 1')
    fireEvent.click(screen.getByText('SAVE CHANGES'))
    await waitFor(() => expect(toast()).toBe('One set has unapplied changes.'))
    expect((await db.ptSetChecks.where('sessionId').equals(newer).toArray())
      .every(r => r.reps === 10)).toBe(true)

    // The inner CANCEL restores what the set opened on.
    fireEvent.click(screen.getByText('CANCEL'))
    await waitFor(() => expect(screen.queryByText('APPLY SET CHANGES')).toBeNull())
    expect(document.body.textContent).toContain('10 reps')
    fireEvent.click(screen.getByText('SAVE CHANGES'))
    await waitFor(() => expect(toast()).toContain('Run updated'))
  })

  it('collapses an expanded run on a second tap', async () => {
    const id = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 16),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
      exerciseNotes: { [exercise.id!]: 'a detail only shown when open' },
    })

    renderPT()
    const row = await screen.findByText('Sep 16')
    fireEvent.click(row)
    await screen.findByText('a detail only shown when open')
    fireEvent.click(row)
    await waitFor(() =>
      expect(document.body.textContent).not.toContain('a detail only shown when open'))
  })

  it('deletes one run without touching the routine', async () => {
    const id = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 16),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
    })

    renderPT()
    await screen.findByText('Sep 16')
    fireEvent.click(screen.getByLabelText('Delete Knee run from Sep 16, 12:00 AM'))
    fireEvent.click(await screen.findByRole('button', { name: /yes, delete knee run/i }))
    // The confirm() dialog, then the delete.
    fireEvent.click(await screen.findByText('DELETE'))

    await waitFor(async () => expect(await db.ptSessions.count()).toBe(0))
    expect(await db.ptRoutines.count()).toBe(1)
  })

  it('lists an archived routine apart from the start list, with its history kept', async () => {
    const live = await savePtRoutine(db, { name: 'Current', exercises: [repsDraft()] })
    const old = await savePtRoutine(db, { name: 'Old block', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, old))!.exercises[0]
    await commitPtRun(db, {
      routineId: old,
      date: new Date(2026, 8, 16),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
    })
    await archivePtRoutine(db, old)

    renderPT()

    await screen.findByText('ARCHIVED')
    expect(document.body.textContent).toContain('Old block')
    expect(document.body.textContent).toContain('Current')
    // Archived routines have no START — they are retired, not runnable.
    expect(screen.getAllByText('START')).toHaveLength(1)
    // …but the run they produced is still in history.
    expect(document.body.textContent).toContain('Sep 16')
    expect(live).toBeGreaterThan(0)
  })

  it('restores an archived routine to the start list', async () => {
    const id = await savePtRoutine(db, { name: 'Old block', exercises: [repsDraft()] })
    await archivePtRoutine(db, id)

    renderPT()
    fireEvent.click(await screen.findByText('RESTORE'))

    await waitFor(() => expect(screen.queryByText('ARCHIVED')).toBeNull())
    expect(await screen.findByText('START')).toBeTruthy()
  })

  it('deletes an archived routine outright', async () => {
    const id = await savePtRoutine(db, { name: 'Old block', exercises: [repsDraft()] })
    await archivePtRoutine(db, id)

    renderPT()
    await screen.findByText('ARCHIVED')
    fireEvent.click(screen.getByLabelText('Delete Old block'))
    fireEvent.click(await screen.findByRole('button', { name: /yes, delete old block/i }))

    await waitFor(async () => expect(await db.ptRoutines.count()).toBe(0))
  })

  it('shows no ARCHIVED section when nothing is archived', async () => {
    await savePtRoutine(db, { name: 'Current', exercises: [repsDraft()] })
    renderPT()
    await screen.findByText('Current')
    expect(screen.queryByText('ARCHIVED')).toBeNull()
  })

  it('says so when a read fails, and retries', async () => {
    const spy = vi.spyOn(db.ptRoutines, 'orderBy').mockImplementationOnce(() => {
      throw new Error('worker gone')
    })
    renderPT()
    await screen.findByText('Could not load PT')
    expect(document.body.textContent).toContain('worker gone')
    spy.mockRestore()

    fireEvent.click(screen.getByText('RETRY'))
    await screen.findByText(/No routines yet/i)
  })
})
