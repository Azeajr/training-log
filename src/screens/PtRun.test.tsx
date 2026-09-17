import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import PtRun from './PtRun'
import { db } from '../db/index'
import { getPtRoutine, savePtRoutine, type PtExerciseDraft } from '../lib/pt'
import { clearPtRun, ptRun, startPtRun, togglePtSet } from '../store/pt-store'
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

function renderRun(routineId: number) {
  const api = createConfirmation()
  window.history.pushState({}, '', `/pt/${routineId}/run`)
  return render(() => (
    <ConfirmationContext.Provider value={api}>
      <Router>
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
    expect(ptRun.done).toHaveLength(1)
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
    const other = await savePtRoutine(db, { name: 'Other', exercises: [repsDraft()] })
    const id = await savePtRoutine(db, { name: 'Rehab', exercises: [repsDraft()] })
    startPtRun(other)
    togglePtSet(1, 1)

    renderRun(id)

    await screen.findByText('Band pull-apart')
    await waitFor(() => expect(ptRun.routineId).toBe(id))
    expect(ptRun.done).toEqual([])
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
    expect(ptRun.done).toHaveLength(1)
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
