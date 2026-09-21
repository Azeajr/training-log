import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import PtRoutineEdit from './PtRoutineEdit'
import { db } from '../db/index'
import { commitPtRun, getPtRoutine, listArchivedPtRoutines, savePtRoutine, type PtExerciseDraft } from '../lib/pt'
import { toast } from '../store/toast-store'
import { ConfirmationContext, createConfirmation } from '../hooks/use-confirmation'
import ConfirmationDialog from '../components/modals/ConfirmationDialog'

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

function renderNew() {
  const api = createConfirmation()
  window.history.pushState({}, '', '/pt/new')
  return render(() => (
    <ConfirmationContext.Provider value={api}>
      <Router>
        <Route path="/pt/new" component={PtRoutineEdit} />
      </Router>
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

function renderEdit(routineId: number) {
  const api = createConfirmation()
  window.history.pushState({}, '', `/pt/${routineId}/edit`)
  return render(() => (
    <ConfirmationContext.Provider value={api}>
      <Router>
        <Route path="/pt/:routineId/edit" component={PtRoutineEdit} />
      </Router>
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

/** The exercise rows in the order the form shows them, cards open or not. */
const rowNames = () => screen.getAllByLabelText(/^Move .* up$/)
  .map(el => el.getAttribute('aria-label')!.replace(/^Move | up$/g, ''))

const typeInto = (label: string, value: string) => {
  const field = screen.getByLabelText(label) as HTMLInputElement
  fireEvent.input(field, { target: { value } })
}

beforeEach(async () => {
  await Promise.all([
    db.ptRoutines.clear(), db.ptExercises.clear(),
    db.ptSessions.clear(), db.ptSetChecks.clear(), db.ptNotes.clear(),
  ])
  // The form parks unsaved work in localStorage now, and that outlives a test:
  // left standing, the next render restores the previous test's draft.
  localStorage.clear()
  mockNavigate.mockClear()
})

afterEach(drain)

describe('PtRoutineEdit screen', () => {
  it('opens a new routine with one blank exercise', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    expect(document.body.textContent).toContain('EXERCISE 1')
    expect(screen.getByLabelText('Routine name')).toBeTruthy()
  })

  it('writes nothing until SAVE ROUTINE', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Shoulder rehab')
    typeInto('Exercise 1 name', 'Band pull-apart')

    expect(await db.ptRoutines.count()).toBe(0)
    expect(await db.ptExercises.count()).toBe(0)
  })

  it('saves the routine and its exercise on SAVE ROUTINE', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Shoulder rehab')
    typeInto('Routine notes', '3x a week')
    typeInto('Exercise 1 name', 'Band pull-apart')

    fireEvent.click(screen.getByText('SAVE ROUTINE'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    const [routine] = await db.ptRoutines.toArray()
    expect(routine.name).toBe('Shoulder rehab')
    expect(routine.notes).toBe('3x a week')
    const detail = await getPtRoutine(db, routine.id!)
    expect(detail!.exercises[0]).toMatchObject({
      name: 'Band pull-apart', sets: 3, measure: 'reps', targetReps: 10, resistanceKind: 'none',
    })
  })

  it('leaves the database alone on BACK', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Abandoned')
    typeInto('Exercise 1 name', 'Something')

    fireEvent.click(screen.getByText('BACK'))

    expect(mockNavigate).toHaveBeenCalledWith('/pt')
    expect(await db.ptRoutines.count()).toBe(0)
  })

  it('reports a validation failure and writes nothing', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'No exercise name')

    fireEvent.click(screen.getByText('SAVE ROUTINE'))

    await waitFor(() => expect(toast()).toMatch(/exercise name is required/i))
    expect(await db.ptRoutines.count()).toBe(0)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('rejects an unsafe video link rather than storing it', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Rehab')
    typeInto('Exercise 1 name', 'Band pull-apart')
    typeInto('Exercise 1 video link', 'javascript:alert(1)')

    fireEvent.click(screen.getByText('SAVE ROUTINE'))

    await waitFor(() => expect(toast()).toMatch(/http:\/\/ or https:\/\//i))
    expect(await db.ptExercises.count()).toBe(0)
  })

  it('loads an existing routine into the form', async () => {
    const id = await savePtRoutine(db, {
      name: 'Shoulder rehab',
      notes: 'clinic',
      exercises: [repsDraft(), repsDraft({ name: 'Wall slide' })],
    })

    renderEdit(id)

    await screen.findByText('EDIT PT ROUTINE')
    await waitFor(() =>
      expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('Shoulder rehab'))
    expect(document.body.textContent).toContain('Band pull-apart')
    expect(document.body.textContent).toContain('Wall slide')
    expect(document.body.textContent).toContain('3 x 15 reps . red band')
  })

  it('edits an exercise in place, keeping its row id', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const before = (await getPtRoutine(db, id))!.exercises[0]

    renderEdit(id)
    await screen.findByText('EDIT PT ROUTINE')
    fireEvent.click(await screen.findByText('Band pull-apart'))
    typeInto('Exercise 1 name', 'Band pull-apart v2')
    fireEvent.click(screen.getByText('SAVE ROUTINE'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    const after = (await getPtRoutine(db, id))!.exercises
    expect(after).toHaveLength(1)
    expect(after[0].id).toBe(before.id)
    expect(after[0].name).toBe('Band pull-apart v2')
  })

  it('switches an exercise to distance, with its own unit', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Sled day')
    typeInto('Exercise 1 name', 'Backward sled walk')
    fireEvent.click(screen.getByText('DISTANCE'))
    fireEvent.click(screen.getByText('WEIGHT'))
    fireEvent.click(screen.getByText('SAVE ROUTINE'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    const [routine] = await db.ptRoutines.toArray()
    const exercise = (await getPtRoutine(db, routine.id!))!.exercises[0]
    expect(exercise).toMatchObject({
      measure: 'distance', targetDistance: 25, distanceUnit: 'yd',
      resistanceKind: 'weight', resistanceWeight: 10,
      targetReps: null, targetSeconds: null, resistanceBand: null,
    })
  })

  it('adds and removes exercise rows in the draft only', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    fireEvent.click(screen.getByText('+ ADD EXERCISE'))
    expect(document.body.textContent).toContain('EXERCISE 2')

    fireEvent.click(screen.getByLabelText('Remove exercise 2'))
    fireEvent.click(await screen.findByRole('button', { name: /yes, remove exercise 2/i }))

    await waitFor(() => expect(document.body.textContent).not.toContain('EXERCISE 2'))
    expect(await db.ptExercises.count()).toBe(0)
  })

  it('reorders rows with the arrows and saves the new order', async () => {
    const id = await savePtRoutine(db, {
      name: 'Rehab',
      exercises: [repsDraft({ name: 'First' }), repsDraft({ name: 'Second' })],
    })

    renderEdit(id)
    await screen.findByText('First')
    fireEvent.click(screen.getByLabelText('Move Second up'))
    fireEvent.click(screen.getByText('SAVE ROUTINE'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    expect((await getPtRoutine(db, id))!.exercises.map(e => e.name)).toEqual(['Second', 'First'])
  })

  /*
   * C10. The form lived entirely in component-local signals, so entering a name
   * and an exercise, tapping Today and coming back with Back reset the lot.
   */

  it('restores a half-entered new routine after leaving and coming back', async () => {
    const first = renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Shoulder rehab')
    typeInto('Routine notes', '3x a week')
    typeInto('Exercise 1 name', 'Band pull-apart')
    fireEvent.click(screen.getByText('+ ADD EXERCISE'))
    typeInto('Exercise 2 name', 'Sleeper stretch')
    fireEvent.click(screen.getByText('BACK'))
    first.unmount()

    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    await waitFor(() =>
      expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('Shoulder rehab'))
    expect((screen.getByLabelText('Routine notes') as HTMLTextAreaElement).value).toBe('3x a week')
    expect(rowNames()).toEqual(['Band pull-apart', 'Sleeper stretch'])
    fireEvent.click(screen.getByText('Band pull-apart'))
    expect((screen.getByLabelText('Exercise 1 name') as HTMLInputElement).value).toBe('Band pull-apart')
    // Still nothing written: parking a draft is not saving it.
    expect(await db.ptRoutines.count()).toBe(0)
  })

  it('restores an edit of an existing routine, in order', async () => {
    const id = await savePtRoutine(db, {
      name: 'Shoulder rehab',
      exercises: [repsDraft(), repsDraft({ name: 'Sleeper stretch' })],
    })

    const first = renderEdit(id)
    await screen.findByText('Sleeper stretch')
    typeInto('Routine name', 'Shoulder rehab v2')
    fireEvent.click(screen.getByLabelText('Move Sleeper stretch up'))
    expect(rowNames()).toEqual(['Sleeper stretch', 'Band pull-apart'])
    first.unmount()

    renderEdit(id)
    await screen.findByText('EDIT PT ROUTINE')
    await waitFor(() =>
      expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('Shoulder rehab v2'))
    expect(rowNames()).toEqual(['Sleeper stretch', 'Band pull-apart'])
    // And the database still has the routine as it was.
    const detail = await getPtRoutine(db, id)
    expect(detail!.routine.name).toBe('Shoulder rehab')
    expect(detail!.exercises[0].name).toBe('Band pull-apart')
  })

  /** The moment a draft is worth the most is the one a failed save creates. */
  it('keeps the draft when the save is rejected', async () => {
    const first = renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Shoulder rehab')
    // No exercise name: validation refuses this.
    fireEvent.click(screen.getByText('SAVE ROUTINE'))
    await waitFor(() => expect(toast()).toMatch(/name/i))
    first.unmount()

    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    await waitFor(() =>
      expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('Shoulder rehab'))
  })

  it('drops the draft once the routine is saved', async () => {
    const first = renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Shoulder rehab')
    typeInto('Exercise 1 name', 'Band pull-apart')
    fireEvent.click(screen.getByText('SAVE ROUTINE'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    first.unmount()

    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    await drain()
    expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('')
  })

  it('discards the draft on request and gives the saved routine back', async () => {
    const id = await savePtRoutine(db, { name: 'Shoulder rehab', exercises: [repsDraft()] })

    renderEdit(id)
    await screen.findByText('Band pull-apart')
    typeInto('Routine name', 'Scratch that')
    await screen.findByText('DISCARD DRAFT')

    fireEvent.click(screen.getByText('DISCARD DRAFT'))
    fireEvent.click(await screen.findByText('DISCARD'))

    await waitFor(() =>
      expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('Shoulder rehab'))
    expect(screen.queryByText('DISCARD DRAFT')).toBeNull()
  })

  it('offers no discard until something differs from what is saved', async () => {
    const id = await savePtRoutine(db, { name: 'Shoulder rehab', exercises: [repsDraft()] })

    renderEdit(id)
    await screen.findByText('Band pull-apart')
    await drain()
    expect(screen.queryByText('DISCARD DRAFT')).toBeNull()

    typeInto('Routine name', 'Changed')
    await screen.findByText('DISCARD DRAFT')
    // Typed back to what is saved: nothing to discard, and nothing parked.
    typeInto('Routine name', 'Shoulder rehab')
    await waitFor(() => expect(screen.queryByText('DISCARD DRAFT')).toBeNull())
    expect(localStorage.getItem('pt-routine-draft')).toBeNull()
  })

  /**
   * A draft outlives the routine it was taken against, and other screens — an
   * import most of all — can move that routine underneath it.
   */
  it('asks before restoring a draft taken against an older version of the routine', async () => {
    const id = await savePtRoutine(db, { name: 'Shoulder rehab', exercises: [repsDraft()] })

    const first = renderEdit(id)
    await screen.findByText('Band pull-apart')
    typeInto('Routine name', 'My version')
    await screen.findByText('DISCARD DRAFT')
    first.unmount()

    // The routine changes underneath the parked draft.
    await savePtRoutine(db, {
      id, name: 'Renamed elsewhere',
      exercises: [repsDraft({ name: 'Different exercise' })],
    })

    renderEdit(id)
    await screen.findByText(/changed since your unsaved draft/i)
    fireEvent.click(screen.getByText('RESTORE'))
    await waitFor(() =>
      expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('My version'))
  })

  it('discards a stale draft when the restore is declined', async () => {
    const id = await savePtRoutine(db, { name: 'Shoulder rehab', exercises: [repsDraft()] })

    const first = renderEdit(id)
    await screen.findByText('Band pull-apart')
    typeInto('Routine name', 'My version')
    await screen.findByText('DISCARD DRAFT')
    first.unmount()

    await savePtRoutine(db, { id, name: 'Renamed elsewhere', exercises: [repsDraft()] })

    const second = renderEdit(id)
    await screen.findByText(/changed since your unsaved draft/i)
    fireEvent.click(screen.getByText('DISCARD'))

    await waitFor(() =>
      expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('Renamed elsewhere'))
    await drain()
    expect(localStorage.getItem('pt-routine-draft')).toBeNull()
    second.unmount()
  })

  it('restores without asking when the routine has not moved', async () => {
    const id = await savePtRoutine(db, { name: 'Shoulder rehab', exercises: [repsDraft()] })

    const first = renderEdit(id)
    await screen.findByText('Band pull-apart')
    typeInto('Routine name', 'My version')
    await screen.findByText('DISCARD DRAFT')
    first.unmount()

    renderEdit(id)
    await waitFor(() =>
      expect((screen.getByLabelText('Routine name') as HTMLInputElement).value).toBe('My version'))
    expect(screen.queryByText(/changed since your unsaved draft/i)).toBeNull()
  })

  it('archives an existing routine, keeping its runs', async () => {
    const id = await savePtRoutine(db, { name: 'Old block', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await commitPtRun(db, {
      routineId: id,
      date: new Date(2026, 8, 16),
      checks: [{ ptExerciseId: exercise.id!, setNumber: 1, done: true }],
    })

    renderEdit(id)
    fireEvent.click(await screen.findByText('ARCHIVE ROUTINE'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('ARCHIVE'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    expect((await listArchivedPtRoutines(db)).map(r => r.name)).toEqual(['Old block'])
    // Archive is the non-destructive half of the pair: the run survives.
    expect(await db.ptSessions.count()).toBe(1)
    expect(await db.ptSetChecks.count()).toBe(1)
  })

  it('leaves the routine alone when the archive is declined', async () => {
    const id = await savePtRoutine(db, { name: 'Old block', exercises: [repsDraft()] })

    renderEdit(id)
    fireEvent.click(await screen.findByText('ARCHIVE ROUTINE'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('CANCEL'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await listArchivedPtRoutines(db)).toEqual([])
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('offers no archive on a routine that does not exist yet', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    expect(screen.queryByText('ARCHIVE ROUTINE')).toBeNull()
  })

  it('sends the user back when the routine has gone', async () => {
    renderEdit(999)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt', { replace: true }))
    expect(toast()).toMatch(/no longer exists/i)
  })

  it('says so when the read fails, and retries', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const spy = vi.spyOn(db.ptRoutines, 'get').mockRejectedValueOnce(new Error('worker gone'))

    renderEdit(id)
    await screen.findByText('Could not load routine')
    spy.mockRestore()

    fireEvent.click(screen.getByText('RETRY'))
    await screen.findByText('EDIT PT ROUTINE')
  })
})
