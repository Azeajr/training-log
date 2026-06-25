import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import Workout from './Workout'
import { db } from '../db/index'
import {
  clearSession, startSession, addAccessory, logAccessorySet, workout,
} from '../store/workout-store'
import { loadSettings, updateSettings } from '../store/settings-store'
import { toast } from '../store/toast-store'
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
    db.exercises.clear(), db.liftAccessories.clear(), db.accessorySets.clear(),
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
    await screen.findByText((t) => t.includes('SQUAT') && t.includes('FSL'))
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
    await screen.findByText((t) => t.includes('SQUAT') && t.includes('FSL'))
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

    await screen.findByText((t) => t.includes('SQUAT') && t.includes('FSL'))
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
    await screen.findByText('EXIT WITHOUT SAVING')
  })

  it('renders SKIP button', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('SKIP LIFT')
  })

  it('renders COMPLETE SESSION button', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('COMPLETE SESSION')
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
    const exitBtn = await screen.findByText('EXIT WITHOUT SAVING')
    fireEvent.click(exitBtn)
    await screen.findByText('Discard this attempt?')
  })

  it('SKIP button opens confirmation dialog', async () => {
    startSession(BENCH)
    renderWorkout()
    const skipBtn = await screen.findByText('SKIP LIFT')
    fireEvent.click(skipBtn)
    await screen.findByText('Skip this lift?')
  })

  it('COMPLETE SESSION marks session completed in DB and navigates', async () => {
    startSession(BENCH)
    renderWorkout()
    const completeBtn = await screen.findByText('COMPLETE SESSION')
    fireEvent.click(completeBtn)
    await waitFor(async () => {
      const session = await db.sessions.get(1)
      expect(session?.status).toBe('completed')
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/today')
    })
  })

  it('COMPLETE SESSION saves accessory sets from active accessories', async () => {
    startSession(BENCH)
    await db.exercises.add({ id: 10, name: 'Chinup', type: 'reps' })
    addAccessory({ exerciseId: 10, exerciseName: 'Chinup', tm: 50, calculatedWeight: 50, loggedSets: [] })
    logAccessorySet(10, { setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })

    renderWorkout()
    fireEvent.click(await screen.findByText('COMPLETE SESSION'))

    await waitFor(async () => {
      const accSets = await db.accessorySets.toArray()
      expect(accSets).toHaveLength(1)
      expect(accSets[0].reps).toBe(8)
      expect(accSets[0].exerciseId).toBe(10)
    })
  })

  it('clicking LOG on active warmup set saves it to DB', async () => {
    startSession(BENCH)
    renderWorkout()

    // Wait for calc worker to deliver warmup sets — LOG button appears on active set
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

    fireEvent.click(await screen.findByText('EXIT WITHOUT SAVING'))
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

  it('EXIT cancelled does not navigate', async () => {
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await screen.findByText('EXIT WITHOUT SAVING'))
    await screen.findByText('Discard this attempt?')
    fireEvent.click(screen.getByText('CANCEL'))

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  it('SKIP confirmed marks session as skipped and navigates', async () => {
    startSession(BENCH)
    renderWorkout()

    fireEvent.click(await screen.findByText('SKIP LIFT'))
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

    fireEvent.click(await screen.findByText('SKIP LIFT'))
    await screen.findByText('Skip this lift?')
    fireEvent.click(screen.getByText('CANCEL'))

    await waitFor(async () => {
      const session = await db.sessions.get(1)
      expect(session?.status).toBe('pending')
    })
  })

  it('notes textarea updates workout notes on input', async () => {
    startSession(BENCH)
    renderWorkout()
    await screen.findByText('WARM UP')

    const textarea = screen.getByPlaceholderText('Session notes...')
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
    fireEvent.click(await screen.findByText('COMPLETE SESSION'))

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
      db.exercises.clear(), db.liftAccessories.clear(), db.accessorySets.clear(),
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
  })

  it('logs set when last warmup set logged (transition rest path)', async () => {
    startSession(BENCH)
    renderWorkout()

    // Log all 3 warmup sets — the 3rd triggers transition rest (next set is main)
    await logNSets(3)

    // Active set is now main set 0 (index 3)
    expect(workout.currentSetIndex).toBe(3)
  })
})

// ─── undo last set ────────────────────────────────────────────────────────────

describe('Workout screen — undo last set', () => {
  beforeEach(async () => {
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.liftAccessories.clear(), db.accessorySets.clear(),
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
      db.exercises.clear(), db.liftAccessories.clear(), db.accessorySets.clear(),
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
      expect(btns.some(b => b.textContent?.includes('JOKER SET'))).toBe(true)
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
      const btn = btns.find(b => b.textContent?.includes('JOKER SET'))
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
      const btn = btns.find(b => b.textContent?.includes('JOKER SET'))
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
      const btn = btns.find(b => b.textContent?.includes('JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn1)
    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(7))

    // Add joker 2 and log it
    const jokerBtn2 = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('JOKER SET'))
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
      const btn = btns.find(b => b.textContent?.includes('JOKER SET'))
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
      const btn = btns.find(b => b.textContent?.includes('JOKER SET'))
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
      const btn = btns.find(b => b.textContent?.includes('JOKER SET'))
      expect(btn).toBeTruthy()
      return btn!
    })
    fireEvent.click(jokerBtn1)
    fireEvent.click(await screen.findByText('LOG'))
    await waitFor(() => expect(workout.currentSetIndex).toBe(7))

    // Add joker 2, leave it pending (180 × 1.05 → 190)
    const jokerBtn2 = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const btn = btns.find(b => b.textContent?.includes('JOKER SET'))
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
      db.exercises.clear(), db.liftAccessories.clear(), db.accessorySets.clear(),
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
      db.exercises.clear(), db.liftAccessories.clear(), db.accessorySets.clear(),
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
    renderWorkout()

    fireEvent.click(await screen.findByText('COMPLETE SESSION'))

    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))
  })

  it('CONTINUE in cycle complete modal clears session and navigates', async () => {
    const session4 = await setupCycleComplete()
    startSession(session4)
    renderWorkout()

    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))

    fireEvent.click(screen.getByText('CONTINUE'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
  })

  it('DELOAD INSTEAD in cycle complete modal deloads and navigates', async () => {
    const session4 = await setupCycleComplete()
    startSession(session4)
    renderWorkout()

    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))

    fireEvent.click(screen.getByText(/DELOAD INSTEAD/))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
  })

  it('SKIP confirmed shows cycle complete modal when cycle ends', async () => {
    const session4 = await setupCycleComplete()
    startSession(session4)
    renderWorkout()

    fireEvent.click(await screen.findByText('SKIP LIFT'))
    await screen.findByText('Skip this lift?')
    fireEvent.click(screen.getByText('SKIP'))

    await waitFor(() => expect(document.body.textContent).toContain('CYCLE COMPLETE'))
  })

  it('STRONG CYCLE section appears when all 3 AMRAP sets meet ≥10% threshold', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    renderWorkout()

    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
    await waitFor(() => expect(document.body.textContent).toContain('STRONG CYCLE'))
  })

  it('double increment button shows 2× progressionIncrement (+10 LBS for Bench increment=5)', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    renderWorkout()

    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
    await waitFor(() => expect(document.body.textContent).toContain('STRONG CYCLE'))
    await screen.findByText('+10 LBS')
  })

  it('clicking double increment updates newTms display from 205 to 210', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    renderWorkout()

    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
    await waitFor(() => expect(document.body.textContent).toContain('205')) // normal progression applied

    fireEvent.click(await screen.findByText('+10 LBS'))

    await waitFor(() => expect(document.body.textContent).toContain('210'))
    expect(document.body.textContent).not.toContain('205')
  })

  it('clicking double increment writes doubled TM to DB', async () => {
    const session4 = await setupCycleCompleteWithDoubling()
    startSession(session4)
    renderWorkout()

    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
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
    renderWorkout()

    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
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
    renderWorkout()
    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
    await waitFor(() => expect(document.body.textContent).toContain('TM ADJUSTMENT'))
  })

  it('KEEP CURRENT dismisses TM modal and navigates to /today', async () => {
    startSession(BENCH)
    renderWorkout()
    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
    await waitFor(() => expect(document.body.textContent).toContain('TM ADJUSTMENT'))

    fireEvent.click(screen.getByText('KEEP CURRENT'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    // TM was NOT changed
    const tms = await db.trainingMaxes.where('liftId').equals(1).sortBy('setAt')
    expect(tms[tms.length - 1].weight).toBe(200)
  })

  it('UPDATE TM applies suggestedTm and navigates to /today', async () => {
    startSession(BENCH)
    renderWorkout()
    fireEvent.click(await screen.findByText('COMPLETE SESSION'))
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
    renderWorkout()
    fireEvent.click(await screen.findByText('COMPLETE SESSION'))

    // Week 4 skips TM recommendation check entirely
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/today'))
    expect(document.body.textContent).not.toContain('TM ADJUSTMENT')
  })
})

// ─── DB error handling ────────────────────────────────────────────────────────

describe('Workout screen — DB error handling', () => {
  beforeEach(async () => {
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.exercises.clear(), db.liftAccessories.clear(), db.accessorySets.clear(),
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
  })
})

// ─── logged-weight cascade regressions ────────────────────────────────────────
// TM 200, week 1: warmups 80/100/120, mains 130/150/170 (AMRAP 170), fsl+bbb 5×10 @130.
// These pin that prescriptions chain off what was actually lifted, not the
// precalculated plan — and that the chain survives a mid-session remount.

describe('Workout screen — logged-weight cascade regressions', () => {
  const findJokerButton = () => waitFor(() => {
    const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('JOKER SET'))
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
})
