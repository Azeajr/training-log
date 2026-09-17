import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import PtRoutineEdit from './PtRoutineEdit'
import { db } from '../db/index'
import { getPtRoutine, savePtRoutine, type PtExerciseDraft } from '../lib/pt'
import { toast } from '../store/toast-store'

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
  window.history.pushState({}, '', '/pt/new')
  return render(() => (
    <Router>
      <Route path="/pt/new" component={PtRoutineEdit} />
    </Router>
  ))
}

function renderEdit(routineId: number) {
  window.history.pushState({}, '', `/pt/${routineId}/edit`)
  return render(() => (
    <Router>
      <Route path="/pt/:routineId/edit" component={PtRoutineEdit} />
    </Router>
  ))
}

const typeInto = (label: string, value: string) => {
  const field = screen.getByLabelText(label) as HTMLInputElement
  fireEvent.input(field, { target: { value } })
}

beforeEach(async () => {
  await Promise.all([
    db.ptRoutines.clear(), db.ptExercises.clear(),
    db.ptSessions.clear(), db.ptSetChecks.clear(), db.ptNotes.clear(),
  ])
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

  it('writes nothing until DONE', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Shoulder rehab')
    typeInto('Exercise 1 name', 'Band pull-apart')

    expect(await db.ptRoutines.count()).toBe(0)
    expect(await db.ptExercises.count()).toBe(0)
  })

  it('saves the routine and its exercise on DONE', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Shoulder rehab')
    typeInto('Routine notes', '3x a week')
    typeInto('Exercise 1 name', 'Band pull-apart')

    fireEvent.click(screen.getByText('DONE'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    const [routine] = await db.ptRoutines.toArray()
    expect(routine.name).toBe('Shoulder rehab')
    expect(routine.notes).toBe('3x a week')
    const detail = await getPtRoutine(db, routine.id!)
    expect(detail!.exercises[0]).toMatchObject({
      name: 'Band pull-apart', sets: 3, measure: 'reps', targetReps: 10, resistanceKind: 'none',
    })
  })

  it('leaves the database alone on CANCEL', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'Abandoned')
    typeInto('Exercise 1 name', 'Something')

    fireEvent.click(screen.getByText('CANCEL'))

    expect(mockNavigate).toHaveBeenCalledWith('/pt')
    expect(await db.ptRoutines.count()).toBe(0)
  })

  it('reports a validation failure and writes nothing', async () => {
    renderNew()
    await screen.findByText('NEW PT ROUTINE')
    typeInto('Routine name', 'No exercise name')

    fireEvent.click(screen.getByText('DONE'))

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

    fireEvent.click(screen.getByText('DONE'))

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
    fireEvent.click(screen.getByText('DONE'))

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
    fireEvent.click(screen.getByText('DONE'))

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
    fireEvent.click(screen.getByText('DONE'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    expect((await getPtRoutine(db, id))!.exercises.map(e => e.name)).toEqual(['Second', 'First'])
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
