import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import PtRun from './PtRun'
import { db } from '../db/index'
import { getPtRoutine, savePtRoutine, type PtExerciseDraft } from '../lib/pt'
import { clearAllPtRuns as clearPtRun, getPtRun, ptRun, startPtRun, startPtSession, ptSessionRoutineIds, togglePtSet } from '../store/pt-store'
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
  sets: 2,
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

/** The sets recorded as done, across every exercise of a run. */
const doneSets = (run: { sets: Record<string, { done: boolean }[]> } | undefined) =>
  Object.values(run?.sets ?? {}).flat().filter(s => s.done)

function renderRun(routineId?: number) {
  const api = createConfirmation()
  window.history.pushState({}, '', routineId === undefined ? '/pt/run' : `/pt/${routineId}/run`)
  return render(() => (
    <ConfirmationContext.Provider value={api}>
      <Router>
        <Route path="/pt/run" component={PtRun} />
        <Route path="/pt/:routineId/run" component={PtRun} />
      </Router>
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

const checkbox = (name: RegExp) => screen.getByRole('checkbox', { name })

beforeEach(async () => {
  await Promise.all([
    db.ptRoutines.clear(), db.ptExercises.clear(),
    db.ptSessions.clear(), db.ptSetChecks.clear(), db.ptNotes.clear(),
  ])
  clearPtRun()
  mockNavigate.mockClear()
})

afterEach(drain)

describe('PtRun screen', () => {
  it('folds a routine group away without losing its ticks', async () => {
    const knee = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft({ name: 'Knee bends' })] })
    const shoulder = await savePtRoutine(db, { name: 'Shoulder', exercises: [repsDraft()] })
    startPtSession([knee, shoulder])
    renderRun()
    await screen.findByText('Knee bends')
    fireEvent.click(checkbox(/Knee bends set 1/))

    const fold = screen.getAllByRole('button', { expanded: true })[0]
    fireEvent.click(fold)
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(`pt-group-${knee}`)?.hasAttribute('hidden')).toBe(true)

    // Folding is a view concern — the run underneath it is untouched.
    expect(doneSets(getPtRun(knee))).toHaveLength(1)
    fireEvent.click(fold)
    expect(document.getElementById(`pt-group-${knee}`)?.hasAttribute('hidden')).toBe(false)
    expect(checkbox(/Knee bends set 1/).getAttribute('aria-checked')).toBe('true')
  })

  it('runs selected routines on one screen and saves their histories together', async () => {
    const knee = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft({ name: 'Knee bends' })] })
    const shoulder = await savePtRoutine(db, { name: 'Shoulder', exercises: [repsDraft()] })
    startPtSession([knee, shoulder])
    const view = renderRun()
    await screen.findByText('Knee bends')
    fireEvent.click(checkbox(/Knee bends set 1/))
    fireEvent.click(checkbox(/Band pull-apart set 2/))
    fireEvent.input(screen.getByLabelText('Notes for Knee'), { target: { value: 'knee note' } })
    fireEvent.input(screen.getByLabelText('Note for Band pull-apart'), { target: { value: 'green band' } })
    expect(doneSets(getPtRun(knee))).toHaveLength(1)
    expect(doneSets(getPtRun(shoulder))).toHaveLength(1)
    // One foldable group per routine, both open, each owning its panel.
    const folds = screen.getAllByRole('button', { expanded: true })
    expect(folds.map(f => f.getAttribute('aria-controls'))).toEqual([`pt-group-${knee}`, `pt-group-${shoulder}`])

    fireEvent.click(screen.getByText('BACK TO ROUTINES'))
    view.unmount()
    renderRun()
    await screen.findByText('Knee bends')
    expect(checkbox(/Knee bends set 1/).getAttribute('aria-checked')).toBe('true')
    expect(checkbox(/Band pull-apart set 2/).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByText('FINISH SESSION'))
    await waitFor(() => expect(ptSessionRoutineIds()).toEqual([]))
    const sessions = await db.ptSessions.toArray()
    expect(sessions.map(s => s.routineId).sort()).toEqual([knee, shoulder].sort())
    expect(sessions.find(s => s.routineId === knee)?.notes).toBe('knee note')
    expect(await db.ptSetChecks.count()).toBe(4)
    expect((await db.ptSetChecks.toArray()).filter(c => c.done)).toHaveLength(2)
    expect((await db.ptNotes.toArray())[0].notes).toBe('green band')
  })

  it('keeps all progress after a failed combined save and retries without duplicate history', async () => {
    const knee = await savePtRoutine(db, { name: 'Knee', exercises: [repsDraft({ name: 'Knee bends' })] })
    const shoulder = await savePtRoutine(db, { name: 'Shoulder', exercises: [repsDraft()] })
    startPtSession([knee, shoulder])
    renderRun()
    await screen.findByText('Knee bends')
    fireEvent.click(checkbox(/Knee bends set 1/))
    fireEvent.click(checkbox(/Band pull-apart set 1/))
    const original = db.ptSessions.add.bind(db.ptSessions)
    const spy = vi.spyOn(db.ptSessions, 'add').mockImplementationOnce(original)
      .mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(screen.getByText('FINISH SESSION'))
    await waitFor(() => expect(toast()).toContain('disk full'))
    expect(await db.ptSessions.count()).toBe(0)
    expect(await db.ptSetChecks.count()).toBe(0)
    expect(doneSets(getPtRun(knee))).toHaveLength(1)
    expect(doneSets(getPtRun(shoulder))).toHaveLength(1)
    spy.mockRestore()
    fireEvent.click(screen.getByText('FINISH SESSION'))
    await waitFor(() => expect(ptSessionRoutineIds()).toEqual([]))
    expect(await db.ptSessions.count()).toBe(2)
  })

  it('renders one checkbox per prescribed set', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ sets: 3 })] })
    renderRun(id)

    await screen.findByText('Band pull-apart')
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    expect(document.body.textContent).toContain('3 x 15 reps . red band')
  })

  it('names each checkbox with the target and resistance', async () => {
    const id = await savePtRoutine(db, { name: 'Sled', exercises: [sledDraft()] })
    renderRun(id)

    await screen.findByText('Backward sled walk')
    expect(checkbox(/Backward sled walk set 1, 50 yd, 180 lb/)).toBeTruthy()
  })

  it('shows a description and a safe video link', async () => {
    const id = await savePtRoutine(db, {
      name: 'Rehab',
      exercises: [repsDraft({ description: 'elbows locked', videoUrl: 'https://example.com/v' })],
    })
    renderRun(id)

    await screen.findByText('elbows locked')
    const link = screen.getByText('▶ WATCH') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://example.com/v')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('starts a run for this routine and ticks a set without writing to the database', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    renderRun(id)
    await screen.findByText('Band pull-apart')

    fireEvent.click(checkbox(/set 1/))

    await waitFor(() => expect(checkbox(/set 1/).getAttribute('aria-checked')).toBe('true'))
    expect(ptRun.routineId).toBe(id)
    expect(doneSets(ptRun)).toHaveLength(1)
    expect(await db.ptSessions.count()).toBe(0)
    expect(await db.ptSetChecks.count()).toBe(0)
  })

  it('counts progress in the header', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ sets: 2 })] })
    renderRun(id)
    await screen.findByText('Band pull-apart')
    await waitFor(() => expect(document.body.textContent).toContain('0/2'))

    fireEvent.click(checkbox(/set 1/))
    await waitFor(() => expect(document.body.textContent).toContain('1/2'))
  })

  it('un-ticks on a second tap', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    renderRun(id)
    await screen.findByText('Band pull-apart')

    fireEvent.click(checkbox(/set 1/))
    await waitFor(() => expect(checkbox(/set 1/).getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(checkbox(/set 1/))
    await waitFor(() => expect(checkbox(/set 1/).getAttribute('aria-checked')).toBe('false'))
  })

  /**
   * The point of per-set editing: a set logged wrong is noticed while the next
   * one is already under way, and having to finish the exercise first is how a
   * wrong number ends up saved.
   */
  it('corrects an already-recorded set while a later one is still to come', async () => {
    const id = await savePtRoutine(db, {
      name: 'Rehab',
      exercises: [repsDraft({ name: 'Step down', sets: 3, targetReps: 10, resistanceKind: 'none' })],
    })
    renderRun(id)
    await screen.findByText('Step down')

    fireEvent.click(checkbox(/Step down set 1/))
    await waitFor(() => expect(checkbox(/Step down set 1/).getAttribute('aria-checked')).toBe('true'))

    // Open set 1 again from its own readout — every set reads the same, so the
    // row is found via its tick rather than by the shared text.
    const row = checkbox(/Step down set 1/).parentElement!
    fireEvent.click(within(row).getByRole('button', { name: /× 10 reps/ }))
    fireEvent.click(await screen.findByLabelText('Decrease set 1 reps'))
    fireEvent.click(screen.getByText('LOG'))

    await waitFor(() => expect(document.body.textContent).toContain('9 reps'))
    // Set 1 stays done, and the correction did not spill onto the rest.
    expect(checkbox(/Step down set 1/).getAttribute('aria-checked')).toBe('true')
    expect(checkbox(/Step down set 2/).getAttribute('aria-checked')).toBe('false')
  })

  it('records a set dropped to bodyweight as carrying no weight at all', async () => {
    const id = await savePtRoutine(db, {
      name: 'Rehab',
      exercises: [repsDraft({
        name: 'Step up', sets: 2, targetReps: 10,
        resistanceKind: 'weight', resistanceWeight: 10,
      })],
    })
    renderRun(id)
    await screen.findByText('Step up')

    const row = checkbox(/Step up set 1/).parentElement!
    expect(row.textContent).toContain('10lb')
    fireEvent.click(within(row).getByRole('button', { name: /10 reps/ }))

    // Down from 10 in 2.5 steps: zero means unloaded, not "loaded with nothing".
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByLabelText('Decrease set 1 weight'))
    fireEvent.click(screen.getByText('LOG'))

    await waitFor(() => expect(checkbox(/Step up set 1/).parentElement!.textContent).not.toContain('lb'))
    // And it carries, like any other equipment change: putting the weight down
    // is not something you undo between sets, so set 2 is unloaded too until
    // something says otherwise.
    expect(checkbox(/Step up set 2/).parentElement!.textContent).not.toContain('lb')
  })

  it('adds a set beyond the prescription and removes one again', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ sets: 2 })] })
    renderRun(id)
    await screen.findByText('Band pull-apart')
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)

    fireEvent.click(screen.getByText('+ ADD SET'))
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(3))
    // The header counts the run's sets, not the prescription's.
    expect(document.body.textContent).toContain('0/3')

    fireEvent.click(screen.getByLabelText('Remove Band pull-apart set 3'))
    fireEvent.click(screen.getByLabelText('Yes, remove band pull-apart set 3'))
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(2))
  })

  it('resumes a run already under way for this routine', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    startPtRun(id)
    togglePtSet(exercise.id!, 2)

    renderRun(id)

    await screen.findByText('Band pull-apart')
    await waitFor(() => expect(checkbox(/set 2/).getAttribute('aria-checked')).toBe('true'))
    expect(checkbox(/set 1/).getAttribute('aria-checked')).toBe('false')
  })

  it('does not carry another routine\'s ticks into this one', async () => {
    const other = await savePtRoutine(db, { name: 'Other', exercises: [repsDraft({ name: 'Other exercise' })] })
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    startPtRun(other)
    togglePtSet(1, 1)

    renderRun(id)

    await screen.findByText('Band pull-apart')
    await waitFor(() => expect(ptRun.routineId).toBe(id))
    expect(doneSets(ptRun)).toEqual([])
  })

  it('writes the session, every check and the notes on FINISH', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft({ sets: 2 })] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    renderRun(id)
    await screen.findByText('Band pull-apart')

    fireEvent.click(checkbox(/set 1/))
    fireEvent.input(screen.getByLabelText('Note for Band pull-apart'), { target: { value: 'green band' } })
    fireEvent.input(screen.getByLabelText('Session notes'), { target: { value: 'shoulder ok' } })
    fireEvent.click(screen.getByText('FINISH'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    const [session] = await db.ptSessions.toArray()
    expect(session.routineId).toBe(id)
    expect(session.notes).toBe('shoulder ok')
    const checks = await db.ptSetChecks.where('sessionId').equals(session.id!).toArray()
    // A row per prescribed set, ticked or not — that is what makes it "1/2".
    expect(checks).toHaveLength(2)
    expect(checks.filter(c => c.done).map(c => c.setNumber)).toEqual([1])
    const notes = await db.ptNotes.toArray()
    expect(notes).toEqual([expect.objectContaining({ ptExerciseId: exercise.id, notes: 'green band' })])
    // The store is cleared, so the run does not reappear as still in progress.
    expect(ptRun.routineId).toBeNull()
  })

  it('dates the session from when the run started, not when it was saved', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const startedAt = new Date(2026, 8, 16, 23, 30).getTime()
    startPtRun(id)
    // Simulate a run begun before midnight and finished after it.
    const { setPtRun } = await import('../store/pt-store') as unknown as { setPtRun: (v: Partial<{ startedAt: number }>) => void }
    setPtRun({ startedAt })

    renderRun(id)
    await screen.findByText('Band pull-apart')
    fireEvent.click(checkbox(/set 1/))
    fireEvent.click(screen.getByText('FINISH'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    const [session] = await db.ptSessions.toArray()
    expect(session.date.getTime()).toBe(startedAt)
  })

  it('asks before saving a run with nothing ticked', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    renderRun(id)
    await screen.findByText('Band pull-apart')

    fireEvent.click(screen.getByText('FINISH'))

    await screen.findByText(/Nothing is ticked off/i)
    expect(await db.ptSessions.count()).toBe(0)

    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(async () => expect(await db.ptSessions.count()).toBe(1))
  })

  it('keeps every tick when the write fails, so the run can be retried', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('disk full'))

    renderRun(id)
    await screen.findByText('Band pull-apart')
    fireEvent.click(checkbox(/set 1/))
    fireEvent.click(screen.getByText('FINISH'))

    await waitFor(() => expect(toast()).toMatch(/could not save that run/i))
    expect(toast()).toContain('disk full')
    expect(doneSets(ptRun)).toHaveLength(1)
    expect(mockNavigate).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('discards a run without writing, after confirming', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    renderRun(id)
    await screen.findByText('Band pull-apart')
    fireEvent.click(checkbox(/set 1/))

    fireEvent.click(screen.getByText('DISCARD'))
    // Scoped to the dialog: the screen's own DISCARD button carries the same word.
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('DISCARD'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    expect(await db.ptSessions.count()).toBe(0)
    expect(ptRun.routineId).toBeNull()
  })

  it('discards an untouched run without asking', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    renderRun(id)
    await screen.findByText('Band pull-apart')

    fireEvent.click(screen.getByText('DISCARD'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt'))
    expect(ptRun.routineId).toBeNull()
  })

  it('warns when ticks are no longer being saved to the device', async () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      const { setupPtRunPersistence } = await import('../store/pt-store')
      const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
      render(() => {
        setupPtRunPersistence()
        return null
      })
      await drain()

      renderRun(id)
      await screen.findByText(/not being saved to this device/i)
    } finally {
      spy.mockRestore()
    }
  })

  it('sends the user back when the routine has gone', async () => {
    renderRun(999)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt', { replace: true }))
    expect(toast()).toMatch(/no longer exists/i)
  })

  it('sends the user back when the routine has no exercises left', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const exercise = (await getPtRoutine(db, id))!.exercises[0]
    await db.ptExercises.delete(exercise.id!)

    renderRun(id)

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/pt', { replace: true }))
    expect(toast()).toMatch(/no exercises yet/i)
  })

  it('says so when the read fails, and retries', async () => {
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    const spy = vi.spyOn(db.ptRoutines, 'get').mockRejectedValueOnce(new Error('worker gone'))

    renderRun(id)
    await screen.findByText('Could not load routine')
    spy.mockRestore()

    fireEvent.click(screen.getByText('RETRY'))
    await screen.findByText('Band pull-apart')
  })
})

describe('a parked draft whose routine is gone', () => {
  it('does not block starting a healthy routine', async () => {
    // An IMPORT clears every table and leaves the `pt-store` localStorage draft
    // pointing at routine ids that no longer exist. Refusing the whole load on
    // one bad id bounced the user back to /pt from every routine they tried,
    // with no way out: the stale routine is not on the list to delete.
    const gone = await savePtRoutine(db, { name: 'Old', exercises: [repsDraft()] })
    startPtSession([gone])
    await db.ptRoutines.clear()
    await db.ptExercises.clear()
    const good = await savePtRoutine(db, { name: 'Good', exercises: [repsDraft({ name: 'Rows' })] })
    expect(ptSessionRoutineIds()).toContain(gone)

    renderRun(good)

    expect(await screen.findByText('Rows')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalledWith('/pt', { replace: true })
    // The dead draft is dropped rather than left to fail again next time.
    expect(ptSessionRoutineIds()).not.toContain(gone)
  })

  it('still redirects when nothing at all resolves', async () => {
    const gone = await savePtRoutine(db, { name: 'Old', exercises: [repsDraft()] })
    startPtSession([gone])
    await db.ptRoutines.clear()
    await db.ptExercises.clear()

    renderRun()
    await drain()

    expect(mockNavigate).toHaveBeenCalledWith('/pt', { replace: true })
    expect(ptSessionRoutineIds()).toHaveLength(0)
  })
})

const timeDraft = (over: Partial<PtExerciseDraft> = {}): PtExerciseDraft => ({
  name: 'Side plank',
  sets: 2,
  measure: 'time',
  targetSeconds: 30,
  resistanceKind: 'none',
  ...over,
})

// A hold is a core rehab prescription, and until now `measure: 'time'` was only
// ever tested on its rejection path — no test built a valid one, so neither the
// validator's success branch nor the per-set time editor ran at all.
describe('timed holds', () => {
  it('saves a valid hold and nulls the off-measure targets', async () => {
    const id = await savePtRoutine(db, { name: 'Core', exercises: [timeDraft()] })
    const [exercise] = (await getPtRoutine(db, id))!.exercises
    expect(exercise).toMatchObject({
      measure: 'time', targetSeconds: 30,
      targetReps: null, targetDistance: null, distanceUnit: null,
    })
  })

  it('records a hold shorter than prescribed, per set', async () => {
    const id = await savePtRoutine(db, { name: 'Core', exercises: [timeDraft()] })
    renderRun(id)
    await screen.findByText('Side plank')

    const row = checkbox(/Side plank set 1/).parentElement!
    fireEvent.click(within(row).getByRole('button', { name: /0:30/ }))
    // 30s prescribed, 22s managed.
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByLabelText('Decrease set 1 seconds'))
    fireEvent.click(screen.getByText('LOG'))

    await waitFor(() =>
      expect(checkbox(/Side plank set 1/).parentElement!.textContent).toContain('0:22'))
    // Effort, not equipment — what set 1 managed says nothing about set 2.
    expect(checkbox(/Side plank set 2/).parentElement!.textContent).toContain('0:30')
  })

  it('records a distance short of the prescription, per set', async () => {
    const id = await savePtRoutine(db, { name: 'Sled', exercises: [sledDraft({ sets: 2 })] })
    renderRun(id)
    await screen.findByText('Backward sled walk')

    const row = checkbox(/Backward sled walk set 1/).parentElement!
    fireEvent.click(within(row).getByRole('button', { name: /50 yd/ }))
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByLabelText('Decrease set 1 distance'))
    fireEvent.click(screen.getByText('LOG'))

    await waitFor(() =>
      expect(checkbox(/Backward sled walk set 1/).parentElement!.textContent).toContain('40 yd'))
  })

  it('records a band swap and carries it forward', async () => {
    const id = await savePtRoutine(db, { name: 'Shoulder', exercises: [repsDraft({ sets: 2 })] })
    renderRun(id)
    await screen.findByText('Band pull-apart')

    const row = checkbox(/Band pull-apart set 1/).parentElement!
    fireEvent.click(within(row).getByRole('button', { name: /red band/ }))
    fireEvent.input(screen.getByLabelText('Set 1 band'), { target: { value: 'green' } })
    fireEvent.click(screen.getByText('LOG'))

    await waitFor(() =>
      expect(checkbox(/Band pull-apart set 1/).parentElement!.textContent).toContain('green band'))
    // Equipment, so it carries to the sets still to come.
    expect(checkbox(/Band pull-apart set 2/).parentElement!.textContent).toContain('green band')
  })

  it('zeroes the equipment height to record a step taken at floor level', async () => {
    const id = await savePtRoutine(db, {
      name: 'Rehab',
      exercises: [repsDraft({ name: 'Step down', measure: 'reps', targetReps: 10, resistanceKind: 'none', equipmentHeight: 6, equipmentHeightUnit: 'in' })],
    })
    renderRun(id)
    await screen.findByText('Step down')

    const row = checkbox(/Step down set 1/).parentElement!
    expect(row.textContent).toContain('6 in high')
    fireEvent.click(within(row).getByRole('button', { name: /10 reps/ }))

    // Zero is "no box", the same reading the weight field takes — not a box of
    // height nothing. Both the height and its unit have to clear together.
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByLabelText('Decrease set 1 equipment height'))
    fireEvent.click(screen.getByText('LOG'))

    await waitFor(() =>
      expect(checkbox(/Step down set 1/).parentElement!.textContent).not.toContain('high'))
    expect(checkbox(/Step down set 2/).parentElement!.textContent).not.toContain('high')
  })
})
