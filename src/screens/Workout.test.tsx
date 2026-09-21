import { defaultBandProfile } from '../lib/band-loading'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import Workout from './Workout'
import { db } from '../db/index'
import {
  clearSession, startSession, addAccessory, advanceSet, logAccessorySet, logCrossSet, logSet,
  setNotes, workout,
} from '../store/workout-store'
import { loadSettings, updateSettings } from '../store/settings-store'
import { toast } from '../store/toast-store'
import { failures, gaps, resetSaveFailures } from '../store/save-failure-store'
import { ConfirmationContext, createConfirmation } from '../hooks/use-confirmation'
import ConfirmationDialog from '../components/modals/ConfirmationDialog'
import type { Session } from '../types/domain'

const mockNavigate = vi.fn()
vi.mock('@solidjs/router', async () => {
  const actual = await vi.importActual<typeof import('@solidjs/router')>('@solidjs/router')
  return { ...actual, useNavigate: () => mockNavigate }
})

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

function renderWorkout() {
  const api = createConfirmation()
  return render(() => (
    <ConfirmationContext.Provider value={api}>
      <Router>
        <Route path="*" component={Workout} />
      </Router>
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

const BENCH: Session = {
  id: 1, cycleId: 1, liftId: 1, week: 1,
  date: new Date('2026-01-06'), notes: null, status: 'pending',
}

beforeEach(async () => {
  clearSession()
  await Promise.all([
    db.lifts.clear(), db.trainingMaxes.clear(),
    db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
    db.exercises.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    db.accessoryTrainingMaxes.clear(),
    db.liftSupplementals.clear(), db.settings.clear(),
  ])
  mockNavigate.mockClear()
  await db.lifts.add({ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
  await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
  await db.sessions.add(BENCH)
  await db.settings.add({ id: 1, restTimer1: 90, restTimer2: 180, restTimerFail: 300, supplementalTemplate: 'fsl+bbb' })
  await loadSettings()
})

afterEach(async () => {
  clearSession()
  await drain()
})

// SessionBar's one finish control reads FINISH while work is outstanding and
// COMPLETE SESSION once every segment is logged — same handler either way.
// Fresh sessions in these tests rarely log everything first, so match either.
const FINISH_CONTROL = /^(FINISH|COMPLETE SESSION)$/
const findFinishButton = () => screen.findByText(FINISH_CONTROL)
const getFinishButton = () => screen.getByText(FINISH_CONTROL)

// SKIP LIFT and EXIT WITHOUT SAVING moved behind the `session options`
// disclosure — one deliberate tap back from COMPLETE, which is the routine
// action they used to sit beside at equal weight.
/**
 * Put real work in the session and run the cursor past every block.
 *
 * FINISH now branches on what a session holds, and only a session with nothing
 * outstanding completes on one tap. Tests about what happens AFTER completion —
 * the TM prompts, the cycle roll-up — use this so they exercise their own
 * subject rather than the finish gate, which has its own tests.
 */
function logCompletedWork(sessionId = 1) {
  logSet({ sessionId, type: 'warmup', setNumber: 1, weight: 90, reps: 5, isAmrap: false })
  for (let i = 0; i < 60; i++) advanceSet()
}

async function findSessionOption(label: string) {
  if (!screen.queryByText(label)) {
    fireEvent.click(await screen.findByText(/session options/))
  }
  return screen.findByText(label)
}

describe('Workout screen — no active session', () => {
  it('shows fallback message when no session is active', () => {
    renderWorkout()
    expect(screen.getByText(/No active session/)).toBeTruthy()
  })

  it('clearing session while mounted triggers loadData with null session (covers !session guard)', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText(/Bench/)

    clearSession()
    await drain()

    expect(screen.getByText(/No active session/)).toBeTruthy()
  })
})

describe('Workout screen — with active session', () => {
  it('shows lift name and week label after loading', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText(/Bench/)
    await screen.findByText(/WEEK 1/)
  })

  it('renders WARM UP section', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('WARM UP')
  })

  it('renders MAIN section', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('MAIN')
  })

  it('loads and renders a cross-lift supplemental section off the movement lift TM', async () => {
    // Bench (id 1) is active. Add Squat as the movement lift with its own TM and
    // attach an FSL cross block to Bench. Exercises loadData cross-block loading,
    // crossSections offset math, and the CROSS-LIFT SUPPLEMENTAL render.
    await db.lifts.add({ id: 2, name: 'Squat', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    await db.liftSupplementals.add({
      liftId: 1, movementLiftId: 2, weightMode: 'fsl', percent: null, sets: 5, reps: 5, order: 1,
    })
    startSession(BENCH)
    renderWorkout()
    await screen.findByText(/CROSS-LIFT SUPPLEMENTAL/) // Rule wraps the label in dashes
    // Label = getCrossLabel(movementName='Squat', fsl mode) → "SQUAT  5 × 5  FSL".
    // Glyph-agnostic matcher: proves the block loaded (movement name) and composed as FSL.
    await screen.findAllByText('SQUAT')
  })

  it('logs a cross-lift set before any own-lift set, without touching currentSetIndex', async () => {
    // Cross supplemental must be loggable independently of the linear cursor
    // (issue #54) — like assistance exercises, no waiting for warmup/main.
    await db.lifts.add({ id: 2, name: 'Squat', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    await db.liftSupplementals.add({
      liftId: 1, movementLiftId: 2, weightMode: 'fsl', percent: null, sets: 5, reps: 5, order: 1,
    })
    startSession(BENCH)
    renderWorkout()

    // Two active LOG buttons appear: the warmup set 0 (linear) and the cross
    // block's set 0. The cross block renders after the main grid, so it's last.
    await screen.findAllByText('SQUAT')
    const logButtons = await screen.findAllByText('LOG')
    fireEvent.click(logButtons[logButtons.length - 1])

    await waitFor(async () => {
      const crossSets = (await db.sets.toArray()).filter(s => s.type === 'cross')
      expect(crossSets).toHaveLength(1)
      expect(crossSets[0].liftId).toBe(2)
    })
    // The linear cursor is untouched — no own-lift set was logged.
    expect(workout.currentSetIndex).toBe(0)
    expect(workout.loggedCrossSets).toHaveLength(1)
    expect(workout.loggedSets).toHaveLength(0)
  })

  it('undo removes the last logged cross-lift set from the store and DB', async () => {
    await db.lifts.add({ id: 2, name: 'Squat', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    await db.liftSupplementals.add({
      liftId: 1, movementLiftId: 2, weightMode: 'fsl', percent: null, sets: 5, reps: 5, order: 1,
    })
    startSession(BENCH)
    renderWorkout()

    await screen.findAllByText('SQUAT')
    const logButtons = await screen.findAllByText('LOG')
    fireEvent.click(logButtons[logButtons.length - 1])
    await waitFor(() => expect(workout.loggedCrossSets).toHaveLength(1))

    // The just-logged set shows an "undo" affordance; confirm it.
    fireEvent.click(await screen.findByText('undo'))
    await screen.findByText('undo set?')
    fireEvent.click(screen.getByText('yes'))

    await waitFor(async () => {
      const crossSets = (await db.sets.toArray()).filter(s => s.type === 'cross')
      expect(crossSets).toHaveLength(0)
    })
    expect(workout.loggedCrossSets).toHaveLength(0)
  })

  it('renders EXIT button', async () => {
    startSession(BENCH)
    renderWorkout()
    await findSessionOption('EXIT WITHOUT SAVING')
  })

  it('renders SKIP button', async () => {
    startSession(BENCH)
    renderWorkout()
    await findSessionOption('SKIP LIFT')
  })

  it('renders the session-finish control', async () => {
    startSession(BENCH)
    renderWorkout()
    await findFinishButton()
  })

  it('shows DELOAD label for week 4', async () => {
    const deloadSession: Session = { ...BENCH, week: 4 }
    startSession(deloadSession)
    renderWorkout()
    await screen.findByText(/DELOAD/)
  })

  it('EXIT button opens confirmation dialog', async () => {
    startSession(BENCH)
    renderWorkout()
    const exitBtn = await findSessionOption('EXIT WITHOUT SAVING')
    fireEvent.click(exitBtn)
    await screen.findByText('Discard this attempt?')
  })

  it('SKIP button opens confirmation dialog', async () => {
    startSession(BENCH)
    renderWorkout()
    const skipBtn = await findSessionOption('SKIP LIFT')
    fireEvent.click(skipBtn)
    await screen.findByText('Skip this lift?')
  })

  it('COMPLETE SESSION marks session completed in DB and navigates', async () => {
    startSession(BENCH)
    // With work in it and nothing outstanding. An empty session no longer
    // completes at all — see the FINISH-branches tests for what it does offer.
    logCompletedWork()
    renderWorkout()
    const completeBtn = await findFinishButton()
    fireEvent.click(completeBtn)
    await waitFor(async () => {
      const session = await db.sessions.get(1)
      expect(session?.status).toBe('completed')
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/today')
    })
  })

  it('COMPLETE SESSION saves assisted drop sets from active accessories', async () => {
    startSession(BENCH)
    await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
    addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 50, loggedSets: [] })
    logAccessorySet(10, { setNumber: 1, weight: -20, reps: 8, duration: null, distance: null, dropRounds: [{ weight: -40, reps: 6 }, { weight: -60, reps: 5 }] })

    renderWorkout()
    fireEvent.click(await findFinishButton())

    await waitFor(async () => {
      const accSets = await db.accessorySets.toArray()
      expect(accSets).toHaveLength(1)
      expect(accSets[0].reps).toBe(8)
      expect(accSets[0].exerciseId).toBe(10)
      expect(accSets[0].weight).toBe(-20)
      expect(accSets[0].dropRounds).toEqual([{ weight: -40, reps: 6 }, { weight: -60, reps: 5 }])
    })
  })

  it('COMPLETE SESSION saves a non-empty accessory note, and skips a blank one', async () => {
    startSession(BENCH)
    await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
    await db.exercises.add({ id: 11, name: 'Dip', type: 'reps' })
    addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 50, loggedSets: [], notes: 'purple band' })
    addAccessory({ exerciseId: 11, exerciseName: 'Dip', tm: 50, calculatedWeight: 50, loggedSets: [], notes: '  ' })

    renderWorkout()
    fireEvent.click(await findFinishButton())

    // Notes and no sets: real work, so FINISH offers to save it rather than
    // treating the session as an empty attempt.
    fireEvent.click(await screen.findByText('FINISH WITH NOTES'))

    await waitFor(async () => {
      const notes = await db.accessoryNotes.toArray()
      expect(notes).toHaveLength(1)
      expect(notes[0]).toMatchObject({ exerciseId: 10, notes: 'purple band' })
    })
  })

  // Logging an accessory at a different weight used to write a new training max
  // on the spot, from the same LOG button pressed twenty times a session. It is
  // now asked about once, after the session, like a main lift's.
  describe('accessory training max prompt', () => {
    const seedDriftedAccessory = async () => {
      await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
      await db.accessoryTrainingMaxes.add({ exerciseId: 10, weight: 60, incrementLb: 5, setAt: new Date() })
      addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 60, calculatedWeight: 45, loggedSets: [] })
      for (let i = 1; i <= 3; i++) {
        logAccessorySet(10, { setNumber: i, weight: 60, reps: 10, duration: null, distance: null })
      }
    }

    it('offers the new TM instead of writing it, and applies it on accept', async () => {
      startSession(BENCH)
      await seedDriftedAccessory()

      renderWorkout()
      fireEvent.click(await findFinishButton())

      // Nothing written yet — the prompt is the decision point.
      await screen.findByText('ACCESSORY TM')
      expect(await db.accessoryTrainingMaxes.where('exerciseId').equals(10).toArray()).toHaveLength(1)

      fireEvent.click(screen.getByText('UPDATE TM'))

      await waitFor(async () => {
        const rows = await db.accessoryTrainingMaxes.where('exerciseId').equals(10).sortBy('setAt')
        expect(rows).toHaveLength(2)
        expect(rows[1].weight).toBe(80) // 60 / 0.75
      })
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    })

    it('leaves the training max alone when dismissed', async () => {
      startSession(BENCH)
      await seedDriftedAccessory()

      renderWorkout()
      fireEvent.click(await findFinishButton())
      fireEvent.click(await screen.findByText('NOT NOW'))

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
      expect(await db.accessoryTrainingMaxes.where('exerciseId').equals(10).toArray()).toHaveLength(1)
    })

    it('does not prompt for work done at the prescribed weight', async () => {
      startSession(BENCH)
      await db.exercises.add({ id: 11, name: 'Dip', type: 'reps' })
      await db.accessoryTrainingMaxes.add({ exerciseId: 11, weight: 60, incrementLb: 5, setAt: new Date() })
      addAccessory({ exerciseId: 11, exerciseName: 'Dip', tm: 60, calculatedWeight: 45, loggedSets: [] })
      for (let i = 1; i <= 3; i++) {
        logAccessorySet(11, { setNumber: i, weight: 45, reps: 10, duration: null, distance: null })
      }

      renderWorkout()
      fireEvent.click(await findFinishButton())

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
      expect(screen.queryByText('ACCESSORY TM')).toBeNull()
    })
  })

  it('clicking LOG on active warmup set saves it to DB', async () => {
    startSession(BENCH)
    renderWorkout()

    // Wait for loadData to compose the set list — LOG appears on the active set
    const logBtn = await screen.findByText('LOG')
    fireEvent.click(logBtn)

    await waitFor(async () => {
      const sets = await db.sets.toArray()
      expect(sets.length).toBeGreaterThan(0)
      expect(sets[0].type).toBe('warmup')
    })
  })

  it('logging a warmup set advances currentSetIndex', async () => {
    startSession(BENCH)
    renderWorkout()

    const logBtn = await screen.findByText('LOG')
    fireEvent.click(logBtn)

    // After logging set 0, the next set (index 1) becomes active
    await waitFor(() => {
      expect(workout.currentSetIndex).toBe(1)
    })
  })

  it('EXIT confirmed deletes logged sets from DB and navigates', async () => {
    // Pre-seed a set in the DB for this session
    await db.sets.add({ sessionId: 1, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false })
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await findSessionOption('EXIT WITHOUT SAVING'))
    await screen.findByText('Discard this attempt?')
    fireEvent.click(screen.getByText('EXIT'))

    await waitFor(async () => {
      const sets = await db.sets.where('sessionId').equals(1).toArray()
      expect(sets).toHaveLength(0)
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/today')
    })
  })

  it('EXIT confirmed deletes the pending session row itself', async () => {
    // A leftover empty pending row would hold the week open (weekComplete)
    // and show the lift as not done on Today.
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await findSessionOption('EXIT WITHOUT SAVING'))
    await screen.findByText('Discard this attempt?')
    fireEvent.click(screen.getByText('EXIT'))

    await waitFor(async () => {
      expect(await db.sessions.get(1)).toBeUndefined()
    })
  })

  it('EXIT on a session already completed in the DB keeps its data', async () => {
    // The store's session copy goes stale after complete (status only updated
    // in the DB). If the app dies with a post-complete modal open, resume +
    // EXIT must not wipe the real completed workout.
    await db.sessions.update(1, { status: 'completed' })
    await db.sets.add({ sessionId: 1, type: 'main', setNumber: 1, weight: 130, reps: 5, isAmrap: false })
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await findSessionOption('EXIT WITHOUT SAVING'))
    await screen.findByText('Discard this attempt?')
    fireEvent.click(screen.getByText('EXIT'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    expect((await db.sessions.get(1))?.status).toBe('completed')
    expect(await db.sets.where('sessionId').equals(1).toArray()).toHaveLength(1)
  })

  it('EXIT cancelled does not navigate', async () => {
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await findSessionOption('EXIT WITHOUT SAVING'))
    await screen.findByText('Discard this attempt?')
    fireEvent.click(screen.getByText('CANCEL'))

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  it('redirects to /today when the active session row is gone from the DB', async () => {
    // Dangling store: an exit deleted the row but a crash skipped clearSession.
    // Logging into it would orphan child rows, so loadData must bounce out.
    await db.sessions.delete(1)
    startSession(BENCH)
    renderWorkout()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
  })

  it('disables COMPLETE and EXIT while a SKIP confirm is pending (runFinishing guard)', async () => {
    // runFinishing holds the guard across the whole handler — including the
    // confirm — so the other session-ending actions can't race it.
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await findSessionOption('SKIP LIFT'))
    await screen.findByText('Skip this lift?')

    expect((getFinishButton() as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('EXIT WITHOUT SAVING') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByText('CANCEL'))
    await waitFor(() =>
      expect((getFinishButton() as HTMLButtonElement).disabled).toBe(false)
    )
  })

  it('SKIP confirmed marks session as skipped and navigates', async () => {
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await findSessionOption('SKIP LIFT'))
    await screen.findByText('Skip this lift?')
    fireEvent.click(screen.getByText('SKIP'))

    await waitFor(async () => {
      const session = await db.sessions.get(1)
      expect(session?.status).toBe('skipped')
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/today')
    })
  })

  it('SKIP cancelled does not change session status', async () => {
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await findSessionOption('SKIP LIFT'))
    await screen.findByText('Skip this lift?')
    fireEvent.click(screen.getByText('CANCEL'))

    await waitFor(async () => {
      const session = await db.sessions.get(1)
      expect(session?.status).toBe('pending')
    })
  })

  // ── C4 ────────────────────────────────────────────────────────────────────
  // Logging was tied to one linear cursor, so someone who warmed up their own
  // way could not reach the main sets without logging warmups they did not do.
  // The cursor WAS the completion model, and `logSet` appends while the rows
  // read `loggedSets` by global index — two problems from one root.
  describe('skipping warmups', () => {
    const skipWarmups = async () => {
      fireEvent.click(await screen.findByText('SKIP REMAINING WARMUPS'))
      await waitFor(() => expect(workout.currentSetIndex).toBe(3))
    }

    /** The direct test for the append-versus-index-read pairing. */
    it('renders a main set logged after a skip with its own values', async () => {
      startSession(BENCH)
      renderWorkout()
      await screen.findByText('WARM UP')
      await skipWarmups()

      fireEvent.click(await screen.findByText('LOG'))
      await waitFor(() => expect(workout.loggedSets).toHaveLength(1))

      // One logged set at position 0, read by a row whose plan index is 3.
      const [logged] = workout.loggedSets
      expect(logged).toMatchObject({ type: 'main', setNumber: 1 })
      const row = screen.getAllByText('done')[0].closest('div')!.parentElement!
      expect(row.textContent).toContain(String(logged.reps))
      expect(row.textContent).toContain(`${logged.weight}lb`)
    })

    it('records no warmup sets for the ones it skipped', async () => {
      startSession(BENCH)
      renderWorkout()
      await screen.findByText('WARM UP')
      await skipWarmups()

      fireEvent.click(await screen.findByText('LOG'))
      await waitFor(() => expect(workout.loggedSets).toHaveLength(1))

      expect(workout.loggedSets.every(s => s.type !== 'warmup')).toBe(true)
      expect(await db.sets.where('sessionId').equals(1).toArray()).toHaveLength(1)
      expect(workout.skippedSets).toEqual([0, 1, 2])
    })

    it('skips only what is left when some warmups were performed', async () => {
      startSession(BENCH)
      renderWorkout()
      await logNSets(1)
      fireEvent.click(await screen.findByLabelText('SKIP REST'))
      await skipWarmups()

      expect(workout.skippedSets).toEqual([1, 2])
      expect(workout.loggedSets).toHaveLength(1)
      expect(workout.loggedSets[0].type).toBe('warmup')
    })

    it('edits the set that was logged, not the row beside it', async () => {
      startSession(BENCH)
      renderWorkout()
      await screen.findByText('WARM UP')
      await skipWarmups()
      fireEvent.click(await screen.findByText('LOG'))
      await waitFor(() => expect(workout.loggedSets).toHaveLength(1))
      const original = workout.loggedSets[0].reps

      fireEvent.click(screen.getAllByText('done')[0])
      // The edit row carries its own steppers; the active row below has a set
      // of identically-named ones.
      const editRow = (await screen.findByText('SAVE')).parentElement!
      fireEvent.click(within(editRow).getByLabelText('Decrease reps'))
      fireEvent.click(within(editRow).getByText('SAVE'))

      await waitFor(() => expect(workout.loggedSets[0].reps).toBe(original - 1))
      expect(workout.loggedSets).toHaveLength(1)
    })

    it('counts a skipped warmup as neither done nor outstanding', async () => {
      startSession(BENCH)
      renderWorkout()
      await screen.findByText('WARM UP')
      await skipWarmups()
      await drain()

      // The block leaves the session bar entirely once nothing in it is owed.
      expect(screen.queryByRole('button', { name: /^WARMUP / })).toBeNull()
      // And FINISH does not list it as outstanding.
      fireEvent.click(getFinishButton())
      await screen.findByText(/nothing logged/i)
      expect(document.body.textContent).not.toMatch(/WARMUP/)
      fireEvent.click(screen.getByText('CONTINUE WORKOUT'))
    })

    it('gives a skipped warmup back', async () => {
      startSession(BENCH)
      renderWorkout()
      await screen.findByText('WARM UP')
      await skipWarmups()

      fireEvent.click(await screen.findByLabelText('Undo skipping warmup set 2'))

      await waitFor(() => expect(workout.currentSetIndex).toBe(1))
      expect(workout.skippedSets).toEqual([0, 2])
    })
  })

  // ── C5 ────────────────────────────────────────────────────────────────────
  // The rest timer took the whole strip, so a rest hid FINISH and every section
  // link with it. Getting either back meant working out that SKIP REST was the
  // way back to them.
  describe('during rest', () => {
    const startRestByLogging = async () => {
      startSession(BENCH)
      renderWorkout()
      await logNSets(1)
      await waitFor(() => expect(workout.isResting).toBe(true))
    }

    it('keeps the finish control and the section links on screen', async () => {
      await startRestByLogging()

      expect(screen.getByTestId('rest-timer-display')).toBeTruthy()
      expect(getFinishButton()).toBeTruthy()
      expect(screen.getByRole('button', { name: /^MAIN / })).toBeTruthy()
    })

    it('does not stop the rest when a section link is used', async () => {
      await startRestByLogging()

      fireEvent.click(screen.getByRole('button', { name: /^MAIN / }))
      await drain()

      expect(workout.isResting).toBe(true)
      expect(screen.getByTestId('rest-timer-display')).toBeTruthy()
    })

    /** Finishing mid-rest is allowed; backing out of it leaves the rest alone. */
    it('leaves the rest running when an early-finish prompt is cancelled', async () => {
      await startRestByLogging()

      fireEvent.click(getFinishButton())
      await screen.findByText(/Still outstanding/)
      expect(workout.isResting).toBe(true)

      fireEvent.click(screen.getByText('CONTINUE WORKOUT'))
      await drain()

      expect(workout.isResting).toBe(true)
      expect((await db.sessions.get(1))?.status).toBe('pending')
      expect(screen.getByTestId('rest-timer-display')).toBeTruthy()
    })
  })

  /*
   * B1. FINISH went straight to completion. Starting a lift and tapping it with
   * nothing logged marked the lift done on Today, selected the next one, and
   * put an empty session in History — one tap, no question asked.
   */
  describe('FINISH branches on what is actually logged', () => {
    /** Run the linear cursor off the end, so no segment reports work still owed. */
    const finishEverySet = () => { for (let i = 0; i < 60; i++) advanceSet() }

    const completedSessions = async () =>
      (await db.sessions.toArray()).filter(s => s.status === 'completed')

    it('offers continue, discard or skip for a session with nothing in it', async () => {
      startSession(BENCH)
      renderWorkout()
      fireEvent.click(await findFinishButton())

      await screen.findByText(/nothing logged/i)
      expect(screen.queryByText(/^COMPLETE/)).toBeNull()
      expect(screen.getByText('CONTINUE WORKOUT')).toBeTruthy()
      expect(screen.getByText('DISCARD ATTEMPT')).toBeTruthy()
      expect(screen.getByText('SKIP LIFT')).toBeTruthy()

      fireEvent.click(screen.getByText('CONTINUE WORKOUT'))
      await drain()
      expect(await completedSessions()).toHaveLength(0)
      expect((await db.sessions.get(1))?.status).toBe('pending')
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('discards the empty attempt when that is chosen', async () => {
      await db.sets.add({ sessionId: 1, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false })
      startSession(BENCH)
      renderWorkout()
      fireEvent.click(await findFinishButton())

      await screen.findByText(/nothing logged/i)
      fireEvent.click(screen.getByText('DISCARD ATTEMPT'))

      await waitFor(async () => expect(await db.sessions.get(1)).toBeUndefined())
      expect(await db.sets.where('sessionId').equals(1).toArray()).toHaveLength(0)
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    })

    it('skips the lift when that is chosen, by the same path as SKIP LIFT', async () => {
      startSession(BENCH)
      renderWorkout()
      fireEvent.click(await findFinishButton())

      await screen.findByText(/nothing logged/i)
      fireEvent.click(screen.getByText('SKIP LIFT'))

      await waitFor(async () => expect((await db.sessions.get(1))?.status).toBe('skipped'))
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    })

    /** Dismissing is neither answer, and the two answers that are not "continue" destroy work. */
    it('returns to the workout when the empty prompt is dismissed', async () => {
      startSession(BENCH)
      renderWorkout()
      fireEvent.click(await findFinishButton())

      await screen.findByText(/nothing logged/i)
      fireEvent.click(screen.getByText('CONTINUE WORKOUT'))
      await drain()

      expect((await db.sessions.get(1))?.status).toBe('pending')
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    /** A note with no sets is user work, not an empty attempt. */
    it('offers to finish a notes-only session, and asks only once', async () => {
      startSession(BENCH)
      await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
      addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 50, loggedSets: [], notes: 'shoulder tight' })
      setNotes('ran out of time')

      renderWorkout()
      fireEvent.click(await findFinishButton())

      await screen.findByText(/notes and no logged sets/i)
      expect(screen.queryByText('DISCARD ATTEMPT')).toBeNull()
      fireEvent.click(screen.getByText('FINISH WITH NOTES'))

      await waitFor(async () => expect((await db.sessions.get(1))?.status).toBe('completed'))
      // Straight through: no second, partial-work confirmation behind the first.
      expect(screen.queryByText(/Still outstanding/)).toBeNull()
      expect((await db.sessions.get(1))?.notes).toBe('ran out of time')
      expect(await db.accessoryNotes.toArray()).toHaveLength(1)
    })

    it('names what is still outstanding on a partly logged session', async () => {
      startSession(BENCH)
      logSet({ sessionId: 1, type: 'warmup', setNumber: 1, weight: 90, reps: 5, isAmrap: false })
      advanceSet()

      renderWorkout()
      // `segments()` reports nothing until the plan lands, and the section
      // heading renders before it does — so wait for the chain, not the header.
      await screen.findByText('WARM UP')
      await drain()
      fireEvent.click(await findFinishButton())

      const prompt = await screen.findByText(/Still outstanding/)
      expect(prompt.textContent).toMatch(/MAIN/)
      expect(screen.getByText('FINISH WITH 1 LOGGED')).toBeTruthy()

      fireEvent.click(screen.getByText('CONTINUE WORKOUT'))
      await drain()
      expect((await db.sessions.get(1))?.status).toBe('pending')
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    /** Assistance done, main not: a partial session whose outstanding block is the main lift. */
    it('names the main lift when only assistance was logged', async () => {
      startSession(BENCH)
      await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
      addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 50, loggedSets: [], slot: 'pull' })
      logAccessorySet(10, { setNumber: 1, weight: 50, reps: 8 })

      renderWorkout()
      await screen.findByText('WARM UP')
      await drain()
      fireEvent.click(await findFinishButton())

      const prompt = await screen.findByText(/Still outstanding/)
      expect(prompt.textContent).toMatch(/MAIN/)
      fireEvent.click(screen.getByText('FINISH WITH 1 LOGGED'))
      await waitFor(async () => expect((await db.sessions.get(1))?.status).toBe('completed'))
    })

    it('completes a session with nothing outstanding without an extra tap', async () => {
      startSession(BENCH)
      logSet({ sessionId: 1, type: 'warmup', setNumber: 1, weight: 90, reps: 5, isAmrap: false })
      renderWorkout()
      await screen.findByText('WARM UP')
      finishEverySet()

      fireEvent.click(await findFinishButton())

      await waitFor(async () => expect((await db.sessions.get(1))?.status).toBe('completed'))
      expect(screen.queryByText(/Still outstanding/)).toBeNull()
      expect(screen.queryByText(/nothing logged/i)).toBeNull()
    })

    /**
     * The guard the new branch sits in front of: `runFinishing` is held across
     * the choice and the action, and `finalizePendingSession` is
     * status-conditional, so neither a second tap nor a retry writes twice.
     */
    it('does not duplicate records on repeated taps or a retry', async () => {
      startSession(BENCH)
      await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
      addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 50, loggedSets: [] })
      logAccessorySet(10, { setNumber: 1, weight: 50, reps: 8 })
      renderWorkout()
      await screen.findByText('WARM UP')
      finishEverySet()

      const finish = await findFinishButton()
      finish.click(); finish.click(); finish.click()
      await waitFor(async () => expect((await db.sessions.get(1))?.status).toBe('completed'))
      await drain()

      fireEvent.click(finish)
      await drain()

      expect(await db.accessorySets.toArray()).toHaveLength(1)
      expect((await db.sessions.toArray()).filter(s => s.status === 'completed')).toHaveLength(1)
    })
  })

  it('notes textarea updates workout notes on input', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('WARM UP')

    const textarea = screen.getByPlaceholderText('session notes...')
    fireEvent.input(textarea, { target: { value: 'great session' } })

    await waitFor(() => {
      expect(workout.notes).toBe('great session')
    })
  })

  it('week 4 session hides joker button and shows deload styling', async () => {
    const deloadSession: Session = { ...BENCH, week: 4 }
    startSession(deloadSession)
    renderWorkout()

    await screen.findByText(/DELOAD/)
    // Week 4 should not show FSL section as active (no AMRAP) — just verify no crash
    expect(screen.queryByText(/JOKER SET/)).toBeNull()
  })

  it('ADD EXTRA ASSISTANCE button shows accessory picker', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('WARM UP')

    fireEvent.click(await screen.findByText('+ ADD EXTRA ASSISTANCE'))

    // AccessoryPicker should appear — wait for it to render
    await waitFor(() => {
      // Picker opens, exercises list or loading state appears
      expect(document.body.textContent).toBeTruthy()
    })
  })

  it('loadData returns early when liftId not in DB (covers !l guard)', async () => {
    // Session liftId 999 has no matching lift in DB
    startSession({ ...BENCH, liftId: 999 })
    renderWorkout()

    // Component still renders (activeSession is set), but lift name is fallback
    await waitFor(() => expect(document.body.textContent).toContain('...'))
  })

  it('loadData uses tmWeight=0 when no training maxes exist (covers ?? 0 branch)', async () => {
    await db.trainingMaxes.clear()
    startSession(BENCH)
    renderWorkout()

    // Screen renders without crashing — sets calculated from 0 TM
    await screen.findByText(/Bench/)
  })

  it('COMPLETE SESSION with null accessory weight/reps and missing setNumber (covers ?? null and setNumber guard)', async () => {
    startSession(BENCH)
    await db.exercises.add({ id: 20, name: 'Plank', type: 'timed' })
    addAccessory({ exerciseId: 20, exerciseName: 'Plank', tm: 0, calculatedWeight: 0, loggedSets: [] })
    logAccessorySet(20, { setNumber: 1, weight: null, reps: null, duration: 60, distance: null })
    logAccessorySet(20, { duration: 30 }) // no setNumber → s.setNumber != null is false

    renderWorkout()
    fireEvent.click(await findFinishButton())

    await waitFor(async () => {
      const accSets = await db.accessorySets.toArray()
      expect(accSets).toHaveLength(1)
      expect(accSets[0].weight).toBeNull()
      expect(accSets[0].reps).toBeNull()
    })
  })
})

// ─── shared helpers ───────────────────────────────────────────────────────────

async function logNSets(n: number) {
  for (let i = 0; i < n; i++) {
    const btn = await screen.findByText('LOG')
    fireEvent.click(btn)
    await waitFor(() => expect(workout.currentSetIndex).toBe(i + 1))
  }
}

async function setupCycleComplete(): Promise<Session> {
  await db.lifts.add({ id: 2, name: 'OHP',      order: 2, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' })
  await db.lifts.add({ id: 3, name: 'Squat',    order: 3, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
  await db.lifts.add({ id: 4, name: 'Deadlift', order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
  await db.trainingMaxes.add({ liftId: 2, weight: 150, setAt: new Date() })
  await db.trainingMaxes.add({ liftId: 3, weight: 250, setAt: new Date() })
  await db.trainingMaxes.add({ liftId: 4, weight: 300, setAt: new Date() })
  await db.sessions.add({ cycleId: 1, liftId: 2, week: 4, date: new Date(), notes: null, status: 'completed' })
  await db.sessions.add({ cycleId: 1, liftId: 3, week: 4, date: new Date(), notes: null, status: 'completed' })
  await db.sessions.add({ cycleId: 1, liftId: 4, week: 4, date: new Date(), notes: null, status: 'completed' })
  const sid = await db.sessions.add({ cycleId: 1, liftId: 1, week: 4, date: new Date(), notes: null, status: 'pending' })
  return { id: sid, cycleId: 1, liftId: 1, week: 4, date: new Date(), notes: null, status: 'pending' }
}

// Bench progressionIncrement=5; TM=200 in beforeEach; all 3 working weeks at exactly 10% delta:
//   week1: 170lbs×13reps → suggestedTm=220 (10%), week2: 180lbs×11reps → 220, week3: 190lbs×9reps → 220
async function setupCycleCompleteWithDoubling(): Promise<Session> {
  await db.lifts.add({ id: 2, name: 'OHP',      order: 2, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' })
  await db.lifts.add({ id: 3, name: 'Squat',    order: 3, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
  await db.lifts.add({ id: 4, name: 'Deadlift', order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
  await db.trainingMaxes.add({ liftId: 2, weight: 150, setAt: new Date() })
  await db.trainingMaxes.add({ liftId: 3, weight: 250, setAt: new Date() })
  await db.trainingMaxes.add({ liftId: 4, weight: 300, setAt: new Date() })
  for (const { week, weight, reps } of [
    { week: 1 as const, weight: 170, reps: 13 },
    { week: 2 as const, weight: 180, reps: 11 },
    { week: 3 as const, weight: 190, reps: 9 },
  ]) {
    const sessionId = await db.sessions.add({ cycleId: 1, liftId: 1, week, date: new Date(), notes: null, status: 'completed' })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
  }
  await db.sessions.add({ cycleId: 1, liftId: 2, week: 4, date: new Date(), notes: null, status: 'completed' })
  await db.sessions.add({ cycleId: 1, liftId: 3, week: 4, date: new Date(), notes: null, status: 'completed' })
  await db.sessions.add({ cycleId: 1, liftId: 4, week: 4, date: new Date(), notes: null, status: 'completed' })
  const sid = await db.sessions.add({ cycleId: 1, liftId: 1, week: 4, date: new Date(), notes: null, status: 'pending' })
  return { id: sid, cycleId: 1, liftId: 1, week: 4, date: new Date(), notes: null, status: 'pending' }
}

// ─── rest types ───────────────────────────────────────────────────────────────

describe('Workout screen — rest types', () => {
  beforeEach(async () => {
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
    mockNavigate.mockClear()
    await db.lifts.add({ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
    await db.sessions.add(BENCH)
  })

  afterEach(async () => {
    clearSession()
    await drain()
  })

  it('logs set when reps decreased below target (fail rest path)', async () => {
    startSession(BENCH)
    renderWorkout()

    // Wait for the first active set (warmup — weight + reps Steppers visible)
    await screen.findByText('LOG')

    // Click reps − (2nd stepper; weight is 1st) to decrease below default (5 → 4)
    fireEvent.click(screen.getAllByText('−')[1])

    fireEvent.click(screen.getByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(1))
    await waitFor(() => expect(workout.restType).toBe('fail'))
  })

  it('uses the completed-set rest when the next set starts a new section', async () => {
    startSession(BENCH)
    renderWorkout()

    // Log all 3 warmup sets — moving to main must not change the bell schedule.
    await logNSets(3)

    // Active set is now main set 0 (index 3)
    expect(workout.currentSetIndex).toBe(3)
    expect(workout.restType).toBe('normal')
  })
})

// ─── undo last set ────────────────────────────────────────────────────────────

// ─── collapsing finished sections ─────────────────────────────────────────────

describe('Workout screen — finished sections fold away', () => {
  beforeEach(async () => {
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
    mockNavigate.mockClear()
    await db.lifts.add({ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
    await db.sessions.add(BENCH)
  })

  afterEach(async () => {
    clearSession()
    await drain()
  })

  // A section's fold control, which is the only button here that carries
  // `aria-expanded`. Matching on the label alone also caught the session bar's
  // segment link for the same block — which used to be hidden during rest and,
  // since C5, is not.
  const sectionToggle = (label: string) =>
    screen.queryAllByRole('button')
      .find(b => b.hasAttribute('aria-expanded') && b.textContent?.startsWith(label))

  it('leaves an in-progress section open with no toggle', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('LOG')
    expect(sectionToggle('WARM UP')).toBeUndefined()
  })

  it('collapses warm up once the cursor moves past it', async () => {
    startSession(BENCH)
    renderWorkout()
    await logNSets(3)

    await waitFor(() => expect(sectionToggle('WARM UP')).toBeDefined())
    expect(sectionToggle('WARM UP')).toHaveAttribute('aria-expanded', 'false')
    // MAIN still holds the cursor, so it stays open and untoggleable.
    expect(sectionToggle('MAIN')).toBeUndefined()
  })

  // The invariant the whole design rests on: a section can only fold once the
  // cursor has left it, so the row the scroll-to-active effect tracks is never
  // inside a collapsed panel.
  it('never hides the active set row', async () => {
    startSession(BENCH)
    renderWorkout()
    await logNSets(3)

    await waitFor(() => expect(sectionToggle('WARM UP')).toBeDefined())
    const active = screen.getAllByTestId('active-weight')[0]
    expect(active.closest('[hidden]')).toBeNull()
  })

  it('reopens warm up when an undo walks the cursor back into it', async () => {
    startSession(BENCH)
    renderWorkout()
    await logNSets(3)
    await waitFor(() => expect(sectionToggle('WARM UP')).toBeDefined())

    fireEvent.click(screen.getByText('undo'))
    await screen.findByText('undo set?')
    fireEvent.click(screen.getByText('yes'))

    await waitFor(() => expect(workout.currentSetIndex).toBe(2))
    await waitFor(() => expect(sectionToggle('WARM UP')).toBeUndefined())
  })

  it('can be reopened by hand without disturbing the cursor', async () => {
    startSession(BENCH)
    renderWorkout()
    await logNSets(3)
    await waitFor(() => expect(sectionToggle('WARM UP')).toBeDefined())

    fireEvent.click(sectionToggle('WARM UP')!)
    expect(sectionToggle('WARM UP')).toHaveAttribute('aria-expanded', 'true')
    expect(workout.currentSetIndex).toBe(3)
  })
})

describe('Workout screen — undo last set', () => {
  beforeEach(async () => {
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
    mockNavigate.mockClear()
    await db.lifts.add({ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
    await db.sessions.add(BENCH)
  })

  afterEach(async () => {
    clearSession()
    await drain()
  })

  it('undo confirmed removes last logged set from workout store', async () => {
    startSession(BENCH)
    renderWorkout()

    // Log first warmup set
    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(1))

    // Completed set 0 shows "undo" (onDelete provided for i=0 when currentSetIndex=1)
    fireEvent.click(screen.getByText('undo'))
    await screen.findByText('undo set?')
    fireEvent.click(screen.getByText('yes'))

    // deleteLastSet() runs → currentSetIndex back to 0
    await waitFor(() => expect(workout.currentSetIndex).toBe(0))
  })
})

// ─── joker sets ───────────────────────────────────────────────────────────────

describe('Workout screen — joker sets', () => {
  beforeEach(async () => {
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
    mockNavigate.mockClear()
    await db.lifts.add({ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
    await db.sessions.add(BENCH)
  })

  afterEach(async () => {
    clearSession()
    await drain()
  })

  it('JOKER SET button appears after all warmup and main sets logged', async () => {
    startSession(BENCH)
    renderWorkout()

    // 3 warmup + 3 main = 6 sets; AMRAP (main set 3) has reps=5 >= JOKER_MIN_REPS[1]=5
    await logNSets(6)

    await waitFor(() => {
      const btns = screen.getAllByRole('button')
      expect(btns.some(b => b.textContent?.includes('+ JOKER SET'))).toBe(true)
    })
  })

  it('logging all 11 sets shows + ADD SET button', async () => {
    startSession(BENCH)
    renderWorkout()

    // 3 warmup + 3 main + 5 FSL = 11 sets total
    await logNSets(11)

    await waitFor(() => {
      const btns = screen.getAllByRole('button')
      expect(btns.some(b => b.textContent?.includes('ADD SET'))).toBe(true)
    })
  })

  it('clicking completed warmup row enters edit mode; SAVE triggers handleEdit', async () => {
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(1))
    await waitFor(() => expect(workout.loggedSets[0]?.id).toBeDefined())

    // Completed warmup set at index 0 shows "done" — click to enter edit mode
    fireEvent.click(screen.getAllByText('done')[0])
    await screen.findByText('SAVE')
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(workout.loggedSets).toHaveLength(1))
  })

  it('clicking + ADD SET appends an extra FSL set row', async () => {
    startSession(BENCH)
    renderWorkout()

    await logNSets(11) // complete all standard sets

    const addFslBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('ADD SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(addFslBtn)

    // New FSL set added at index 11 (currentSetIndex=11) → LOG button reappears
    await screen.findByText('LOG')
  })

  it('clicking JOKER SET button adds a joker set row', async () => {
    startSession(BENCH)
    renderWorkout()

    await logNSets(6)

    const jokerBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('+ JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn)

    await waitFor(() => expect(document.body.textContent).toContain('JOKER SETS'))
  })

  it('clicking completed main set enters edit mode; SAVE triggers handleEdit', async () => {
    startSession(BENCH)
    renderWorkout()

    // Log 3 warmup + 1 main = 4 sets; the main set is now completed
    await logNSets(4)

    // All 4 completed rows show "done"; the last is the main set
    const doneSigns = screen.getAllByText('done')
    fireEvent.click(doneSigns[doneSigns.length - 1])

    // Edit mode shows SAVE button
    await screen.findByText('SAVE')
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(workout.loggedSets).toHaveLength(4))
  })

  it('logging and editing a joker set covers joker onLog and onEdit', async () => {
    startSession(BENCH)
    renderWorkout()

    // Log warmup (3) + main (3) to unlock JOKER button
    await logNSets(6)

    const jokerBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('+ JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn)

    // Log the joker set (covers joker onLog)
    const logBtn = await screen.findByText('LOG')
    fireEvent.click(logBtn)
    await waitFor(() => expect(workout.currentSetIndex).toBe(7))

    // Click "done" on the completed joker set to enter edit mode (last "done")
    const doneSigns = screen.getAllByText('done')
    fireEvent.click(doneSigns[doneSigns.length - 1])

    // SAVE triggers joker onEdit
    await screen.findByText('SAVE')
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(workout.loggedSets).toHaveLength(7))
  })

  it('undo last joker triggers joker delete branch and reloads with remaining joker', async () => {
    startSession(BENCH)
    renderWorkout()

    await logNSets(6) // 3 warmup + 3 main

    // Add joker 1 and log it
    const jokerBtn1 = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('+ JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn1)
    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(7))

    // Add joker 2 and log it
    const jokerBtn2 = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('+ JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn2)
    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(8))

    // Undo joker 2 — triggers handleDeleteSet's joker branch (lines 101-107)
    fireEvent.click(screen.getByText('undo'))
    await screen.findByText('undo set?')
    fireEvent.click(screen.getByText('yes'))

    await waitFor(() => expect(workout.currentSetIndex).toBe(7))
    await waitFor(() => expect(document.body.textContent).toContain('JOKER SETS'))
    // drain allows the async loadData() re-run to complete (covers restoredJokers lines 63-64)
    await drain()
  })

  // Sets a value on an inline-edit Stepper via its text input.
  const setEditStepper = (label: 'edit-weight' | 'edit-reps', value: number) => {
    const stepper = screen.getByTestId(`stepper-${label}`)
    fireEvent.click(within(stepper).getByTestId('stepper-value'))
    const input = within(stepper).getByTestId('stepper-input')
    fireEvent.input(input, { target: { value: String(value) } })
    fireEvent.blur(input)
  }

  // Weight shown on the active set row (the big "<n>lb" readout).
  const activeRowWeight = () =>
    screen.queryAllByTestId('active-weight')[0]?.textContent?.replace(/\s+/g, '')

  // TM 200, week 1: AMRAP logged at 170×5 → joker prescription 170×1.05 → 180.
  it('editing the logged AMRAP weight re-derives a pending joker', async () => {
    startSession(BENCH)
    renderWorkout()

    await logNSets(6) // 3 warmup + 3 main

    const jokerBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('+ JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    expect(jokerBtn.textContent).toContain('180')
    fireEvent.click(jokerBtn)
    await screen.findByText('LOG') // pending joker is the active row at 180

    // Edit the logged AMRAP (last "done" row) 170 → 180
    const doneSigns = screen.getAllByText('done')
    fireEvent.click(doneSigns[doneSigns.length - 1])
    await screen.findByText('SAVE')
    setEditStepper('edit-weight', 180)
    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => expect(workout.loggedSets[5]?.weight).toBe(180))

    // Pending joker re-derives: 180 × 1.05 = 189 → 190
    await waitFor(() => expect(activeRowWeight()).toBe('190lb'))
  })

  it('editing AMRAP reps across the double-goal threshold re-derives the pending joker increment', async () => {
    startSession(BENCH)
    renderWorkout()

    await logNSets(6)

    const jokerBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('+ JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn) // pending joker at 180 (5% increment)

    // Edit AMRAP reps 5 → 11 (> 2× the week-1 goal of 5) → increment becomes 10%
    const doneSigns = screen.getAllByText('done')
    fireEvent.click(doneSigns[doneSigns.length - 1])
    await screen.findByText('SAVE')
    setEditStepper('edit-reps', 11)
    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => expect(workout.loggedSets[5]?.reps).toBe(11))

    // Pending joker re-derives: 170 × 1.10 = 187 → 185
    await waitFor(() => expect(activeRowWeight()).toBe('185lb'))
  })

  it('editing a logged joker weight re-derives the next pending joker', async () => {
    startSession(BENCH)
    renderWorkout()

    await logNSets(6)

    // Add joker 1 and log it at the prescribed 180
    const jokerBtn1 = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('+ JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn1)
    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(7))

    // Add joker 2, leave it pending (180 × 1.05 → 190)
    const jokerBtn2 = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('+ JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn2)
    await screen.findByText('LOG')

    // Edit logged joker 1 (last "done" row) 180 → 200
    const doneSigns = screen.getAllByText('done')
    fireEvent.click(doneSigns[doneSigns.length - 1])
    await screen.findByText('SAVE')
    setEditStepper('edit-weight', 200)
    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => expect(workout.loggedSets[6]?.weight).toBe(200))

    // Pending joker 2 re-derives off the edited joker 1: 200 × 1.05 = 210
    await waitFor(() => expect(activeRowWeight()).toBe('210lb'))
  })
})

// ─── FSL / AMRAP / picker branches ───────────────────────────────────────────

describe('Workout screen — FSL and AMRAP weight branches', () => {
  beforeEach(async () => {
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
    mockNavigate.mockClear()
    await db.lifts.add({ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
    await db.sessions.add(BENCH)
  })

  afterEach(async () => {
    clearSession()
    await drain()
  })

  it('main set 1 logged with changed weight propagates to FSL sets', async () => {
    startSession(BENCH)
    renderWorkout()

    // Log 3 warmup sets to reach main set 1 (globalIdx=3)
    await logNSets(3)

    // main set 1 is now active; weight stepper is always visible (1st −)
    await screen.findByText('LOG')
    await waitFor(() => expect(screen.getAllByText('−').length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getAllByText('−')[0]) // weight − to decrease (step=2.5)

    // LOG — weight !== s.weight → FSL propagation branch fires
    fireEvent.click(screen.getByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(4))
  })

  it('AMRAP weight change calls handleAmrapWeightChange (else-if path)', async () => {
    startSession(BENCH)
    renderWorkout()

    // Log 5 sets (3 warmup + 2 main) to reach AMRAP set (main set 3, idx 5)
    await logNSets(5)

    await screen.findByText('LOG') // AMRAP active
    // weight stepper always visible; + increases weight → onWeightChange → handleAmrapWeightChange
    await waitFor(() => expect(screen.getAllByText('+').length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getAllByText('+')[0])

    // No crash = handleAmrapWeightChange ran; still on same set
    await waitFor(() => expect(workout.currentSetIndex).toBe(5))
  })

  it('AMRAP weight change with prior session calls calcAmrapTargets path', async () => {
    // Seed a prior completed session so prevAmrapSets.length > 0
    const prevSessId = await db.sessions.add({
      cycleId: 1, liftId: 1, week: 1, date: new Date(Date.now() - 1_000_000), notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId: prevSessId, type: 'main', setNumber: 3, weight: 170, reps: 8, isAmrap: true })

    startSession(BENCH)
    renderWorkout()
    await drain() // ensure loadData (including getAmrapTargets) fully completes

    await logNSets(5) // reach AMRAP set

    await screen.findByText('LOG')
    await waitFor(() => expect(screen.getAllByText('+').length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getAllByText('+')[0]) // weight + triggers calcAmrapTargets path

    await waitFor(() => expect(workout.currentSetIndex).toBe(5))
  })

  it('logging FSL set with changed weight propagates to subsequent FSL sets', async () => {
    startSession(BENCH)
    renderWorkout()

    // 3 warmup + 3 main to reach first FSL set (index 6)
    await logNSets(6)

    await screen.findByText('LOG')
    // weight + reps Steppers always visible → weight is the 1st '+' button
    await waitFor(() => expect(screen.getAllByText('+').length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getAllByText('+')[0])

    // LOG — s.type === 'fsl' && weight !== s.weight → propagation fires
    fireEvent.click(screen.getByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(7))
  })

  it('clicking completed FSL row enters edit mode; SAVE triggers handleEdit and updates DB', async () => {
    startSession(BENCH)
    renderWorkout()

    // 3 warmup + 3 main + 5 FSL = 11 standard sets
    await logNSets(11)
    // wait for fire-and-forget db.sets.add to propagate id into loggedSets
    await waitFor(() => { expect(workout.loggedSets[6]?.id).toBeDefined() })

    // FSL sets start at globalIdx 6 (3 warmup + 3 main); click first FSL "done"
    const doneSigns = screen.getAllByText('done')
    fireEvent.click(doneSigns[6])

    await screen.findByText('SAVE')
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const dbId = workout.loggedSets[6]?.id
      expect(dbId).toBeDefined()
      const dbSet = await db.sets.get(dbId!)
      expect(dbSet?.reps).toBe(workout.loggedSets[6].reps)
    })
  })

  it('handleAmrapWeightChange does nothing when tmWeight=0 (covers else-if false branch)', async () => {
    // With no TMs: tmWeight=0, calcMainSets uses 45lb minimum, 0 warmup sets
    // AMRAP set (main set 3) is at index 2 after logging 2 main sets
    await db.trainingMaxes.clear()
    startSession(BENCH)
    renderWorkout()

    await logNSets(2) // 0 warmup + 2 main → AMRAP (index 2) is active

    await screen.findByText('LOG')
    await waitFor(() => expect(screen.getAllByText('+').length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getAllByText('+')[0]) // weight + → handleAmrapWeightChange → else-if (tmWeight > 0) false

    await waitFor(() => expect(workout.currentSetIndex).toBe(2))
  })

  it('undo FSL set triggers fslOverride in loadData (covers lines 57-59)', async () => {
    startSession(BENCH)
    renderWorkout()

    // Log 3 warmup + 3 main + 2 FSL = 8 sets
    await logNSets(8)

    // After logging 8 sets, currentSetIndex=8; last completed is index 7 (2nd FSL)
    // undo button shows for index 7 (globalIdx === currentSetIndex-1)
    fireEvent.click(screen.getByText('undo'))
    await screen.findByText('undo set?')
    fireEvent.click(screen.getByText('yes'))

    await waitFor(() => expect(workout.currentSetIndex).toBe(7))
    // loadData now runs with 1 FSL set still in loggedSets → fslOverride is set
    await drain()
  })

  it('AccessoryPicker ← BACK calls onClose without crashing', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('WARM UP')

    fireEvent.click(await screen.findByText('+ ADD EXTRA ASSISTANCE'))
    // Picker opens
    await screen.findByText('← BACK')

    // ← BACK calls props.onClose() → setPickerSlot(null), loadData()
    fireEvent.click(screen.getByText('← BACK'))

    // No navigation happened — just verified the branch ran without crashing
    await waitFor(() => expect(mockNavigate).not.toHaveBeenCalled())
  })
})

// ─── supplemental templates ───────────────────────────────────────────────────

describe('Workout screen — supplemental templates', () => {
  it('FSL+BBB template (default) renders FSL header', async () => {
    startSession(BENCH)
    renderWorkout()
    await waitFor(() => expect(document.body.textContent).toMatch(/FSL/))
  })

  it('BBB template renders BBB header', async () => {
    await updateSettings({ supplementalTemplate: 'bbb' })
    startSession(BENCH)
    renderWorkout()
    await waitFor(() => expect(document.body.textContent).toMatch(/BBB/))
  })

  it('BBB template renders 5 set rows in supplemental section', async () => {
    await updateSettings({ supplementalTemplate: 'bbb' })
    startSession(BENCH)
    renderWorkout()
    await waitFor(() => expect(document.body.textContent).toMatch(/BBB.*50%/s))
  })

  it('SSL template renders SSL header', async () => {
    await updateSettings({ supplementalTemplate: 'ssl' })
    startSession(BENCH)
    renderWorkout()
    await waitFor(() => expect(document.body.textContent).toMatch(/SSL/))
  })

  it('BBS template week 1 renders BBS header with 60% TM', async () => {
    await updateSettings({ supplementalTemplate: 'bbs' })
    startSession(BENCH) // week 1
    renderWorkout()
    await waitFor(() => expect(document.body.textContent).toMatch(/BBS.*60%/))
  })

  it('BBS template week 4 hides supplemental section entirely', async () => {
    await updateSettings({ supplementalTemplate: 'bbs' })
    await db.sessions.update(1, { week: 4 })
    startSession({ ...BENCH, week: 4 })
    renderWorkout()
    await screen.findByText('WARM UP')
    await waitFor(() => expect(document.body.textContent).not.toMatch(/BBS/))
  })

  it('none template hides supplemental section entirely', async () => {
    await updateSettings({ supplementalTemplate: 'none' })
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('WARM UP')
    await waitFor(() => expect(document.body.textContent).not.toMatch(/FSL|SSL|BBB|BBS/))
  })
})

// ─── cycle complete ───────────────────────────────────────────────────────────

describe('Workout screen — cycle complete', () => {
  beforeEach(async () => {
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
    mockNavigate.mockClear()
    await db.lifts.add({ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
    await db.sessions.add(BENCH)
  })

  afterEach(async () => {
    clearSession()
    await drain()
  })

  it('COMPLETE SESSION shows cycle complete modal when cycle ends', async () => {
    const session4 = await setupCycleComplete()
    startSession(session4)
    logCompletedWork(session4.id!)
    renderWorkout()

    fireEvent.click(await findFinishButton())

    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))
  })

  it('CONTINUE in cycle complete modal clears session and navigates', async () => {
    const session4 = await setupCycleComplete()
    startSession(session4)
    logCompletedWork(session4.id!)
    renderWorkout()

    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))

    fireEvent.click(screen.getByText('CONTINUE'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
  })

  it('CUT ALL TMS INSTEAD in cycle complete modal deloads and navigates', async () => {
    const session4 = await setupCycleComplete()
    startSession(session4)
    logCompletedWork(session4.id!)
    renderWorkout()

    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))

    fireEvent.click(screen.getByText(/CUT ALL TMS INSTEAD/))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
  })

  it('SKIP confirmed shows cycle complete modal when cycle ends', async () => {
    const session4 = await setupCycleComplete()
    startSession(session4)
    renderWorkout()

    fireEvent.click(await findSessionOption('SKIP LIFT'))
    await screen.findByText('Skip this lift?')
    fireEvent.click(screen.getByText('SKIP'))

    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))
  })

  it('STRONG CYCLE section appears when all 3 AMRAP sets meet ≥10% threshold', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    logCompletedWork(session4.id!)
    renderWorkout()

    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('STRONG CYCLE'))
  })

  it('double increment button shows 2× progressionIncrement (+10 LBS for Bench increment=5)', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    logCompletedWork(session4.id!)
    renderWorkout()

    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('STRONG CYCLE'))
    await screen.findByText('+10 LBS')
  })

  it('clicking double increment updates newTms display from 205 to 210', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    logCompletedWork(session4.id!)
    renderWorkout()

    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('205')) // normal progression applied

    fireEvent.click(await screen.findByText('+10 LBS'))

    await waitFor(() => expect(document.body.textContent).toContain('210'))
    expect(document.body.textContent).not.toContain('205')
  })

  it('clicking double increment writes doubled TM to DB', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    logCompletedWork(session4.id!)
    renderWorkout()

    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('STRONG CYCLE'))
    fireEvent.click(await screen.findByText('+10 LBS'))

    await waitFor(async () => {
      const tms = await db.trainingMaxes.where('liftId').equals(1).sortBy('setAt')
      expect(tms[tms.length - 1].weight).toBe(210)
    })
  })

  it('clicking double increment removes lift from STRONG CYCLE section', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    logCompletedWork(session4.id!)
    renderWorkout()

    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('STRONG CYCLE'))
    fireEvent.click(await screen.findByText('+10 LBS'))

    await waitFor(() => expect(document.body.textContent).not.toContain('STRONG CYCLE'))
  })
})

// ─── TM recommendation modal ──────────────────────────────────────────────────
// Math: TM=200, AMRAP weight=190, reps=11 → e1RM=259.7, suggestedTm=235, delta=17.5% ≥ 15%

describe('Workout screen — TM recommendation modal', () => {
  beforeEach(async () => {
    // Pre-seed an AMRAP set for session 1 (week 1, liftId 1)
    // Session.week !== 4 so handleComplete checks for TM recommendation
    await db.sets.add({ sessionId: 1, type: 'main' as const, setNumber: 3, weight: 190, reps: 11, isAmrap: true })
  })

  afterEach(async () => {
    clearSession()
    await drain()
  })

  it('COMPLETE SESSION shows TM ADJUSTMENT modal when AMRAP delta ≥ 15%', async () => {
    startSession(BENCH)
    logCompletedWork()
    renderWorkout()
    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('TM ADJUSTMENT'))
  })

  it('KEEP CURRENT dismisses TM modal and navigates to /today', async () => {
    startSession(BENCH)
    logCompletedWork()
    renderWorkout()
    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('TM ADJUSTMENT'))

    fireEvent.click(screen.getByText('KEEP CURRENT'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    // TM was NOT changed
    const tms = await db.trainingMaxes.where('liftId').equals(1).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(200)
  })

  it('UPDATE TM applies suggestedTm and navigates to /today', async () => {
    startSession(BENCH)
    logCompletedWork()
    renderWorkout()
    fireEvent.click(await findFinishButton())
    await waitFor(() => expect(document.body.textContent).toContain('TM ADJUSTMENT'))

    fireEvent.click(screen.getByText('UPDATE TM'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    const tms = await db.trainingMaxes.where('liftId').equals(1).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(235)
  })

  it('TM ADJUSTMENT does not appear for week-4 session', async () => {
    await db.sessions.update(1, { week: 4 })
    // A second active lift keeps the cycle from completing on this lone week-4
    // session, so the flow navigates to /today instead of opening the cycle modal.
    await db.lifts.add({ name: 'OHP', order: 2, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    startSession({ ...BENCH, week: 4 })
    logCompletedWork()
    renderWorkout()
    fireEvent.click(await findFinishButton())

    // Week 4 skips TM recommendation check entirely
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    expect(document.body.textContent).not.toContain('TM ADJUSTMENT')
  })
})

// ─── DB error handling ────────────────────────────────────────────────────────

describe('Workout screen — DB error handling', () => {
  beforeEach(async () => {
    clearSession()
    // The failure banner is module-global and outlives a render by design —
    // clear it so each test starts from no outstanding gaps.
    resetSaveFailures()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
      db.settings.clear(),
    ])
    mockNavigate.mockClear()
    await db.lifts.add({ id: 1, name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
    await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
    await db.sessions.add(BENCH)
    await db.settings.add({ id: 1, restTimer1: 90, restTimer2: 180, restTimerFail: 300, supplementalTemplate: 'fsl+bbb' })
    await loadSettings()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    clearSession()
    await drain()
  })

  it('db.sets.add failure shows toast and rolls back logged set state', async () => {
    // Covers the catch block at Workout.tsx ~lines 187-191.
    // logSet + advanceSet run before the await; on failure deleteLastSet reverts both.
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('LOG')

    vi.spyOn(db.sets, 'add').mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(screen.getByText('LOG'))

    await waitFor(() => expect(toast()).toContain('Failed to save set'))
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
    const sets = await db.sets.toArray()
    expect(sets).toHaveLength(0)

    // The toast clears itself after 2.5s; the banner is what still says the set
    // is missing once the user looks up from the bar.
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain('Warmup set 1')
    expect(banner.textContent).toContain('disk full')
    expect(gaps().map(g => g.describe)).toEqual(['Warmup set 1 · 80lb × 5'])
  })

  it('db.sets.update failure in handleEdit shows toast and reverts to the pre-edit values', async () => {
    // editSet(new values) runs before the await; on failure the snapshot taken
    // BEFORE the store mutation restores the original reps/weight. (Reading the
    // store proxy after editSet would "revert" to the already-edited values.)
    startSession(BENCH)
    renderWorkout()

    // Log first warmup set (80lb × 5 at TM 200) so loggedSets[0] has a DB-assigned id
    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.loggedSets[0]?.id).toBeDefined())

    // Click the completed set row to enter edit mode and decrease reps 5 → 4
    fireEvent.click(screen.getAllByText('done')[0])
    await screen.findByText('SAVE')
    fireEvent.click(screen.getAllByText('−')[1])

    vi.spyOn(db.sets, 'update').mockRejectedValueOnce(new Error('constraint violation'))
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(toast()).toContain('Failed to save edit'))
    expect(workout.loggedSets[0].reps).toBe(5)
    expect(workout.loggedSets[0].weight).toBe(80)

    const banner = await screen.findByRole('alert')
    expect(banner.textContent).toContain('Edit to Warmup set 1')
    expect(gaps()).toHaveLength(1)
  })

  it('retrying a failed set save from the banner writes it and clears the gap', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('LOG')

    // One transient failure, then the real implementation takes over.
    vi.spyOn(db.sets, 'add').mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(screen.getByText('LOG'))
    await screen.findByRole('alert')
    expect(await db.sets.toArray()).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'RETRY' }))

    await waitFor(async () => expect(await db.sets.toArray()).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(gaps()).toHaveLength(0)
    expect(workout.loggedSets).toHaveLength(1)
  })

  it('dismissing a failed save leaves the set unwritten and drops the gap', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('LOG')

    vi.spyOn(db.sets, 'add').mockRejectedValue(new Error('disk full'))
    fireEvent.click(screen.getByText('LOG'))
    await screen.findByRole('alert')

    fireEvent.click(screen.getByRole('button', { name: /^Dismiss unsaved/ }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(gaps()).toHaveLength(0)
    expect(await db.sets.toArray()).toHaveLength(0)
  })
})

// ─── logged-weight cascade regressions ────────────────────────────────────────
// TM 200, week 1: warmups 80/100/120, mains 130/150/170 (AMRAP 170), fsl+bbb 5×10 @130.
// These pin that prescriptions chain off what was actually lifted, not the
// precalculated plan — and that the chain survives a mid-session remount.

describe('Workout screen — logged-weight cascade regressions', () => {
  const findJokerButton = () => waitFor(() => {
    const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('+ JOKER SET'))
    expect(btn).toBeTruthy()
    return btn!
  })

  // Click the always-visible weight Stepper's + twice (2 × 2.5lb)
  const bumpActiveWeightBy5 = async () => {
    await waitFor(() => expect(screen.getAllByText('+').length).toBeGreaterThanOrEqual(2))
    fireEvent.click(screen.getAllByText('+')[0])
    fireEvent.click(screen.getAllByText('+')[0])
  }

  it('joker prescription chains off the logged AMRAP weight, not the planned one', async () => {
    startSession(BENCH)
    renderWorkout()

    await logNSets(5)               // 3 warmups + 2 mains → AMRAP (planned 170) active
    await bumpActiveWeightBy5()     // 170 → 175
    fireEvent.click(screen.getByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(6))

    // 175 × 1.05 = 183.75 → 185; the old planned-weight chain showed 180
    const jokerBtn = await findJokerButton()
    expect(jokerBtn.textContent).toContain('185lb')
    expect(jokerBtn.textContent).not.toContain('180lb')

    fireEvent.click(jokerBtn)
    await waitFor(() => expect(document.body.textContent).toContain('JOKER SETS'))
    expect(document.body.textContent).toContain('185lb')
  })

  it('ssl: logging main set 2 at a higher weight cascades into the SSL sets', async () => {
    await updateSettings({ supplementalTemplate: 'ssl' })
    startSession(BENCH)
    renderWorkout()

    await logNSets(4)               // 3 warmups + main set 1 → main set 2 (planned 150) active
    await bumpActiveWeightBy5()     // 150 → 155
    fireEvent.click(screen.getByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(5))

    // SSL sets follow main set 2: planned 150 must be gone everywhere
    await waitFor(() => expect(document.body.textContent).toContain('155lb'))
    expect(document.body.textContent).not.toContain('150lb')
  })

  it('overridden main set 1 weight survives a mid-session remount', async () => {
    startSession(BENCH)
    const first = renderWorkout()

    await logNSets(3)               // warmups → main set 1 (planned 130) active
    await bumpActiveWeightBy5()     // 130 → 135
    fireEvent.click(screen.getByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(4))

    first.unmount()
    renderWorkout()                 // same active session — loadData recomposes from loggedSets

    await waitFor(() => expect(document.body.textContent).toContain('135lb'))
    expect(document.body.textContent).not.toContain('130lb')
  })

  it('editing the logged main set 1 weight re-cascades pending FSL sets', async () => {
    startSession(BENCH)
    renderWorkout()

    await logNSets(4)               // 3 warmups + main set 1 at planned 130
    await waitFor(() => expect(workout.loggedSets[3]?.id).toBeDefined())

    fireEvent.click(screen.getAllByText('done')[3])   // main set 1 row → edit mode
    await screen.findByText('SAVE')
    fireEvent.click(screen.getAllByText('+')[0])      // edit-weight stepper: 130 → 132.5
    fireEvent.click(screen.getAllByText('+')[0])      // → 135
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(() => expect(document.body.textContent).not.toContain('130lb'))
    expect(document.body.textContent).toContain('135lb')
  })

  it('a user-added extra supplemental set is restored after a remount', async () => {
    startSession(BENCH)
    const first = renderWorkout()

    await logNSets(11)              // 3 warmup + 3 main + 5 fsl+bbb
    const addBtn = await waitFor(() => {
      const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('ADD SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(addBtn)
    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(12))

    first.unmount()
    renderWorkout()

    await waitFor(() => expect(screen.getAllByText('done')).toHaveLength(12))
  })
})

// ─── AMRAP PR toast ───────────────────────────────────────────────────────────

describe('Workout screen — AMRAP PR toast', () => {
  // Week 1 main sets at TM 200 are 130/150/170; the LOG button logs the AMRAP
  // (main set 3) at 170×5 → e1RM 170*(1+5/30) ≈ 198.
  async function seedPriorAmrap(weight: number, reps: number) {
    const sessionId = await db.sessions.add({
      cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-01'), notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight, reps, isAmrap: true })
  }

  it('rep PR without e1RM PR: toast reports REP PR only', async () => {
    await seedPriorAmrap(170, 3)  // beaten on reps at the exact weight (5 > 3)
    await seedPriorAmrap(200, 8)  // prior best e1RM ≈ 253 stays unbeaten
    startSession(BENCH)
    renderWorkout()

    await logNSets(6) // 3 warmup + 3 main; 6th logged set is the AMRAP at 170×5

    await waitFor(() => expect(toast()).toContain('REP PR'))
    expect(toast()).not.toContain('e1RM')
  })

  it('e1RM PR without rep PR: toast reports e1RM only', async () => {
    await seedPriorAmrap(160, 2)  // prior best e1RM ≈ 171; no prior AMRAP at 170
    startSession(BENCH)
    renderWorkout()

    await logNSets(6)

    await waitFor(() => expect(toast()).toContain('e1RM'))
    expect(toast()).not.toContain('REP PR')
  })

  // The record baseline is completed sessions plus the one being logged. The
  // live session is `pending` while the workout happens, so if Workout stops
  // passing it to detectPRs the toast is measured against a history that
  // excludes everything done today — in the session it exists to report on.
  it('scores against sets logged earlier in this same live session', async () => {
    // BENCH is the live session (id 1, pending). Put earlier work in it, the
    // way logging a joker before the AMRAP would.
    // A completed session so the baseline is not empty — otherwise "no history
    // at all is not a toast" hides whether the live session was consulted.
    await seedPriorAmrap(100, 5)  // e1RM ≈ 117, well under the 170×5 to come
    await db.sets.add({ sessionId: 1, type: 'joker', setNumber: 1, weight: 400, reps: 8, isAmrap: false })
    startSession(BENCH)
    renderWorkout()
    // The toast store is module-level and can still hold a previous test's
    // message, so assert on CHANGE rather than content.
    const before = toast()

    await logNSets(6) // AMRAP at 170×5, e1RM ≈ 198

    // 198 does not beat the 400×8 logged earlier in this very session, so no
    // toast fires. If Workout stops passing the live session to detectPRs that
    // set becomes invisible and a PR is announced instead.
    await new Promise(r => setTimeout(r, 50))
    expect(toast()).toBe(before)
  })

  it('does not score against a skipped session (F22/F38)', async () => {
    const sessionId = await db.sessions.add({
      cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-01'), notes: null, status: 'skipped',
    })
    // Abandoned work that History will never show must not suppress a real PR.
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 400, reps: 8, isAmrap: true })
    startSession(BENCH)
    renderWorkout()

    await logNSets(6)

    await waitFor(() => expect(toast()).toContain('e1RM'))
  })
})

// ── F52 ──────────────────────────────────────────────────────────────────────
// crossSections() rebuilds its wrapper objects on every evaluation, and <For>
// keys items by reference — so each re-derive remounts every cross block and
// destroys SetRow's uncommitted local state with it. crossSections() depends on
// workout.loggedCrossSets, so logging a set in ONE block wipes a weight the user
// has dialled into ANOTHER — the case the independent-cursor design exists to
// support. COMMON_MISTAKES #6 names this exact hazard and prescribes <Index>.
describe('Workout screen — cross block identity', () => {
  async function twoCrossBlocks() {
    await db.lifts.add({ id: 2, name: 'Squat', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
    await db.lifts.add({ id: 3, name: 'Deadlift', order: 3, progressionIncrement: 10, baseWeight: 155, liftType: 'lower' })
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    await db.trainingMaxes.add({ liftId: 3, weight: 400, setAt: new Date() })
    await db.liftSupplementals.add({ liftId: 1, movementLiftId: 2, weightMode: 'fsl', percent: null, sets: 5, reps: 5, order: 1 })
    await db.liftSupplementals.add({ liftId: 1, movementLiftId: 3, weightMode: 'fsl', percent: null, sets: 5, reps: 5, order: 2 })
  }

  it('keeps a weight dialled in one block when another block logs a set (F52)', async () => {
    await twoCrossBlocks()
    startSession(BENCH)
    renderWorkout()
    await screen.findByText(/CROSS-LIFT SUPPLEMENTAL/)
    await screen.findAllByText('SQUAT')

    // Two cross blocks, each with an active set: [0] = Squat, [1] = Deadlift.
    const bumps = () => screen.getAllByRole('button', { name: 'Increase weight' })
    const readouts = () => screen.getAllByTestId('active-weight')
    const squatBefore = readouts()[1].textContent

    // Dial Squat's weight up three times.
    fireEvent.click(bumps()[1]); fireEvent.click(bumps()[1]); fireEvent.click(bumps()[1])
    const dialled = readouts()[1].textContent
    expect(dialled).not.toBe(squatBefore)

    // Log a set in the OTHER block. That re-derives crossSections().
    const logs = screen.getAllByRole('button', { name: /^LOG$/ })
    fireEvent.click(logs[logs.length - 1])
    await new Promise(r => setTimeout(r, 50))

    // Squat's uncommitted weight must survive — it is not this block's business.
    expect(screen.getAllByTestId('active-weight')[1].textContent).toBe(dialled)
  })
})

// ─── F13: a stale store must not rewrite a finished session ───────────────────
// The persisted workout store outlives its row. Kill the app while a
// post-complete modal is open and it comes back holding a session the database
// already finished — and every session-ending path used to write its status
// unconditionally.

describe('Workout screen — stale active session', () => {
  const completedRow = async (fields: Partial<Session> = {}) => {
    await db.sessions.update(1, { status: 'completed', notes: 'the real workout', date: new Date('2026-01-06'), ...fields })
  }

  it('SKIP does not rewrite a session the database already completed', async () => {
    await completedRow()
    startSession(BENCH)          // store still says 'pending'
    renderWorkout()

    fireEvent.click(await findSessionOption('SKIP LIFT'))
    await screen.findByText('Skip this lift?')
    fireEvent.click(screen.getByText('SKIP'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    const row = await db.sessions.get(1)
    expect(row?.status).toBe('completed')
    expect(row?.notes).toBe('the real workout')
    expect(workout.activeSession).toBeNull()
  })

  it('COMPLETE does not duplicate accessory sets or overwrite the saved date and notes', async () => {
    await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
    // What the first, real completion wrote.
    await completedRow()
    await db.accessorySets.add({
      sessionId: 1, exerciseId: 10, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null,
    })

    // The resurrected store still holds the accessory work and a new note.
    startSession(BENCH)
    addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 50, loggedSets: [] })
    logAccessorySet(10, { setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    setNotes('typed again after the reload')

    renderWorkout()
    fireEvent.click(await findFinishButton())
    await drain()

    expect(await db.accessorySets.where('sessionId').equals(1).toArray()).toHaveLength(1)
    const row = await db.sessions.get(1)
    expect(row?.notes).toBe('the real workout')
    expect(new Date(row!.date).getTime()).toBe(new Date('2026-01-06').getTime())
  })

  it('entering the screen on a completed row drops the dead session and leaves', async () => {
    await completedRow()
    startSession(BENCH)
    renderWorkout()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    expect(workout.activeSession).toBeNull()
  })

  it('a skipped row is not resumable either', async () => {
    await db.sessions.update(1, { status: 'skipped' })
    startSession(BENCH)
    renderWorkout()

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    expect(workout.activeSession).toBeNull()
  })
})

// ─── F14 / F15: set mutations share a positional model ───────────────────────
// `loggedSets[i]` is the set at position i of the plan, and a rollback says
// "remove the last one". That is only true while one mutation is in flight.

describe('Workout screen — overlapping set mutations', () => {
  beforeEach(() => resetSaveFailures())
  afterEach(async () => {
    vi.restoreAllMocks()
    clearSession()
    await drain()
  })

  const logButton = () => screen.getAllByRole('button', { name: /^LOG$/ })[0]

  // Every logged set in the store claims a database row. One without an id is a
  // set the database refused, which the rollback is supposed to have removed.
  const assertStoreMatchesDb = async () => {
    const rows = await db.sets.toArray()
    expect(workout.loggedSets.every(s => s.id != null)).toBe(true)
    expect(rows.map(r => r.setNumber).sort()).toEqual(workout.loggedSets.map(s => s.setNumber).sort())
    expect(workout.currentSetIndex).toBe(workout.loggedSets.length)
  }

  it('a failed save does not pop a later successful one', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('LOG')

    vi.spyOn(db.sets, 'add').mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(logButton())
    fireEvent.click(logButton())
    await drain()

    await assertStoreMatchesDb()
    expect(await db.sets.toArray()).toHaveLength(1)
    expect(gaps()).toHaveLength(1)
  })

  it('an undo before the insert settles deletes the row it wrote', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('LOG')

    const realAdd = db.sets.add.bind(db.sets)
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    vi.spyOn(db.sets, 'add').mockImplementationOnce(async (data) => {
      await held
      return realAdd(data)
    })

    fireEvent.click(logButton())
    await waitFor(() => expect(workout.loggedSets).toHaveLength(1))

    fireEvent.click(await screen.findByText('undo'))
    await screen.findByText('undo set?')
    fireEvent.click(screen.getByText('yes'))
    release()
    await drain()

    expect(await db.sets.toArray()).toHaveLength(0)
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
  })

  it('finishing waits for a set still being written', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('LOG')

    const realAdd = db.sets.add.bind(db.sets)
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    vi.spyOn(db.sets, 'add').mockImplementationOnce(async (data) => {
      await held
      return realAdd(data)
    })

    fireEvent.click(logButton())
    await waitFor(() => expect(workout.loggedSets).toHaveLength(1))
    fireEvent.click(getFinishButton())

    // The session must not be marked completed while the set is still in flight.
    await drain()
    expect((await db.sessions.get(1))?.status).toBe('pending')

    release()
    // One set of many: the finish prompt names what is still outstanding, and
    // only appears now — `runFinishing` waits for the write before asking.
    fireEvent.click(await screen.findByText('FINISH WITH 1 LOGGED'))
    await waitFor(async () => expect((await db.sessions.get(1))?.status).toBe('completed'))
    expect(await db.sets.toArray()).toHaveLength(1)
  })
})

describe('Workout screen — a retry belongs to the session that produced it', () => {
  beforeEach(() => resetSaveFailures())
  afterEach(async () => {
    vi.restoreAllMocks()
    clearSession()
    await drain()
  })

  const failOneLog = async () => {
    renderWorkout()
    await screen.findByText('LOG')
    vi.spyOn(db.sets, 'add').mockRejectedValueOnce(new Error('disk full'))
    fireEvent.click(screen.getAllByRole('button', { name: /^LOG$/ })[0])
    await screen.findByRole('alert')
  }

  it('a failure from another session is not offered for retry here', async () => {
    startSession(BENCH)
    await failOneLog()
    expect(gaps()).toHaveLength(1)

    // Move to a different session — the gap record outlives it, the banner does not.
    const other = await db.sessions.add({
      cycleId: 1, liftId: 1, week: 2, date: new Date(), notes: null, status: 'pending',
    })
    startSession({ ...BENCH, id: other, week: 2 })

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(gaps()).toHaveLength(1)
  })

  it('the retry itself refuses to write into a session other than its own', async () => {
    startSession(BENCH)
    await failOneLog()
    const failure = failures()[0]
    expect(failure.retry).toBeDefined()

    const other = await db.sessions.add({
      cycleId: 1, liftId: 1, week: 2, date: new Date(), notes: null, status: 'pending',
    })
    startSession({ ...BENCH, id: other, week: 2 })

    // Held from before the switch, the way the banner holds it. Replaying the
    // positional handler used to read the live session and write the old set
    // into the new one.
    await failure.retry!()

    expect(await db.sets.toArray()).toHaveLength(0)
  })

  it('withdraws RETRY once the slot it refers to has been logged by hand', async () => {
    startSession(BENCH)
    await failOneLog()
    expect(screen.queryByRole('button', { name: 'RETRY' })).toBeTruthy()

    // The user logs the set again themselves. Replaying the old handler now
    // would duplicate that slot and misassign its database id.
    fireEvent.click(screen.getAllByRole('button', { name: /^LOG$/ })[0])
    await waitFor(() => expect(workout.loggedSets).toHaveLength(1))

    expect(screen.queryByRole('button', { name: 'RETRY' })).toBeNull()
    await drain()
    expect(await db.sets.toArray()).toHaveLength(1)
  })
})

// ─── F32: cross work that lost its plan is still work that was done ──────────
// Logged self-supplemental sets survive their plan disappearing. Cross sets had
// no such path, so removing a block mid-session — or moving deloadSupplemental
// to `skip` during a week-4 session — made already-logged cross work vanish
// from the screen while its rows stayed in the database and kept counting
// toward History, PRs and Stats.

describe('Workout screen — cross work with no remaining block', () => {
  const seedSquat = async () => {
    await db.lifts.add({ id: 2, name: 'Squat', order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
  }

  const loggedSquatCrossSets = () => {
    logCrossSet({ sessionId: 1, type: 'cross', setNumber: 1, weight: 225, reps: 5, isAmrap: false, liftId: 2 })
    logCrossSet({ sessionId: 1, type: 'cross', setNumber: 2, weight: 225, reps: 5, isAmrap: false, liftId: 2 })
  }

  it('still shows the logged sets when the block has been removed', async () => {
    await seedSquat()          // no liftSupplementals row: the block is gone
    startSession(BENCH)
    loggedSquatCrossSets()
    renderWorkout()

    await screen.findByText(/CROSS-LIFT SUPPLEMENTAL/)
    expect((await screen.findAllByText(/SQUAT/)).length).toBeGreaterThan(0)
    expect(screen.getByText(/no longer prescribed/)).toBeInTheDocument()
    // The sets themselves, not just the heading.
    expect(screen.getAllByText('225').length).toBeGreaterThan(0)
  })

  it('still shows them when the deload setting skipped supplemental this week', async () => {
    await seedSquat()
    await db.liftSupplementals.add({ liftId: 1, movementLiftId: 2, weightMode: 'fsl', percent: null, sets: 5, reps: 5, order: 1 })
    await updateSettings({ deloadSupplemental: 'skip' })
    startSession({ ...BENCH, week: 4 })
    loggedSquatCrossSets()
    renderWorkout()

    await screen.findByText(/CROSS-LIFT SUPPLEMENTAL/)
    expect((await screen.findAllByText(/SQUAT/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('225').length).toBeGreaterThan(0)
  })

  it('a block that still exists keeps its prescription in the label', async () => {
    await seedSquat()
    await db.liftSupplementals.add({ liftId: 1, movementLiftId: 2, weightMode: 'fsl', percent: null, sets: 5, reps: 5, order: 1 })
    startSession(BENCH)
    loggedSquatCrossSets()
    renderWorkout()

    await screen.findByText(/CROSS-LIFT SUPPLEMENTAL/)
    expect((await screen.findAllByText(/SQUAT/)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/no longer prescribed/)).not.toBeInTheDocument()
  })

  it('renders no cross section at all when nothing is planned and nothing logged', async () => {
    await seedSquat()
    startSession(BENCH)
    renderWorkout()

    await screen.findByText('LOG')
    expect(screen.queryByText(/CROSS-LIFT SUPPLEMENTAL/)).not.toBeInTheDocument()
  })
})


it('persists effective main-lift load and the exact band setup across raw-load edits', async () => {
  await db.lifts.update(1, { name: 'Chin-ups', bandProfile: defaultBandProfile('Chin-ups') })
  startSession(BENCH)
  renderWorkout()
  const picker = await screen.findByRole('combobox', { name: 'band' })
  fireEvent.change(picker, { target: { value: 'Green' } })
  fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
  await waitFor(async () => expect(await db.sets.count()).toBe(1))
  // 191 raw − 50 assistance = 141, the measured load, not a 5lb-grid value.
  expect((await db.sets.toArray())[0]).toMatchObject({ weight: 141, bandLoad: { band: 'Green', rawLoad: 191, assistance: 50, addedWeight: 0 } })
  fireEvent.click(screen.getByRole('button', { name: 'Band settings for Chin-ups' }))
  fireEvent.click(screen.getByRole('button', { name: 'Increase raw load' }))
  fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect((await db.sets.toArray())[0]).toMatchObject({ weight: 141, bandLoad: { rawLoad: 191 } })
  expect((await db.lifts.get(1))?.bandProfile?.rawLoad).toBe(192)
})

// Band settings write to the exercise ROW. Workout holds a copy of that row in
// `exercises()` and does not refetch, so a save kept locally inside one
// AccessoryLog was invisible to every other logger on the same exercise until a
// reload — the two disagreed about whether bands were even on.
it('a band profile edited from an accessory reaches the exercise list', async () => {
  startSession(BENCH)
  // The shortcut is only offered for an exercise that already uses bands (C1),
  // so setting one up for the first time goes through Settings. Editing the
  // profile of one that does still belongs on the logging screen.
  await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps', bandProfile: defaultBandProfile('Chinup')! })
  addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 150, loggedSets: [] })
  renderWorkout()

  fireEvent.click(await screen.findByRole('button', { name: 'Band settings for Chinup' }))
  fireEvent.click(screen.getByRole('button', { name: 'Increase raw load' }))
  fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

  expect((await db.exercises.get(10))?.bandProfile).toMatchObject({ enabled: true, rawLoad: 192 })
  // The logger follows the row it was saved to, without a reload.
  expect(await screen.findByRole('combobox', { name: 'band' })).toBeInTheDocument()
})

// ── C1 ──────────────────────────────────────────────────────────────────────
// Bands apply to about two movements. The shortcut was rendered on every lift's
// logging screen, every cross block and every accessory header — and above the
// save-failure banner, so a write error was pushed down the page by a control
// nobody on that screen wanted.
describe('band shortcuts appear only where bands are used', () => {
  it('renders none for an ordinary lift and an ordinary accessory', async () => {
    startSession(BENCH)
    await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
    addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 150, loggedSets: [] })
    renderWorkout()
    await screen.findByText('WARM UP')
    await drain()

    expect(screen.queryByRole('button', { name: /^Band settings for/ })).toBeNull()
  })

  it('renders one for a band-assisted lift, below the save-failure banner', async () => {
    await db.lifts.update(1, { bandProfile: defaultBandProfile('Chin-ups')! })
    startSession(BENCH)
    renderWorkout()

    const shortcut = await screen.findByRole('button', { name: 'Band settings for Bench' })
    const banner = document.querySelector('[data-testid="save-failure-banner"]')
    // Order matters even with no failure to show: the banner's slot is above.
    if (banner) {
      expect(banner.compareDocumentPosition(shortcut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('drops the shortcut again when the profile is turned off', async () => {
    await db.lifts.update(1, { bandProfile: defaultBandProfile('Chin-ups')! })
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await screen.findByRole('button', { name: 'Band settings for Bench' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Use raw load and bands/ }))
    fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Band settings for Bench' })).toBeNull())
    expect((await db.lifts.get(1))?.bandProfile).toMatchObject({ enabled: false })
  })
})
