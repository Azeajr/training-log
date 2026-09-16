import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import Today from './Today'
import { db } from '../db/index'
import { clearSession, startSession, workout } from '../store/workout-store'
import { ConfirmationContext, createConfirmation } from '../hooks/use-confirmation'
import ConfirmationDialog from '../components/modals/ConfirmationDialog'
import type { Session } from '../types/domain'

const mockNavigate = vi.fn()
vi.mock('@solidjs/router', async () => {
  const actual = await vi.importActual<typeof import('@solidjs/router')>('@solidjs/router')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Per-lift latency on the TM read, so the selection races in the F17 tests are
// deterministic instead of depending on microtask order. Empty by default, so
// every other test in this file runs against the real timing.
const slow = vi.hoisted(() => ({ tmDelayMs: new Map<number, number>() }))
vi.mock('../lib/training-max', async () => {
  const actual = await vi.importActual<typeof import('../lib/training-max')>('../lib/training-max')
  return {
    ...actual,
    getCurrentTm: async (db: Parameters<typeof actual.getCurrentTm>[0], liftId: number) => {
      const weight = await actual.getCurrentTm(db, liftId)
      const ms = slow.tmDelayMs.get(liftId) ?? 0
      if (ms > 0) await new Promise(r => setTimeout(r, ms))
      return weight
    },
  }
})

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

function renderToday() {
  const api = createConfirmation()
  return render(() => (
    <ConfirmationContext.Provider value={api}>
      <Router>
        <Route path="*" component={Today} />
      </Router>
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

// Selecting a lift clears the previous lift's numbers and holds START disabled
// until the new lift's own TM and defaults land (F17). These tests used to race
// that read — they clicked START while the outgoing lift's TM still stood — so
// they now give the lift a TM of its own and wait for the button.
const selectLiftAndWaitForStart = async (name: string) => {
  fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.includes(name))!)
  const startBtn = await screen.findByText('START WORKOUT') as HTMLButtonElement
  await waitFor(() => expect(startBtn.disabled).toBe(false))
  return startBtn
}

const LIFTS = [
  { id: 1, name: 'OHP'      as const, order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { id: 2, name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
  { id: 3, name: 'Bench'    as const, order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { id: 4, name: 'Squat'    as const, order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

beforeEach(async () => {
  clearSession()
  await Promise.all([
    db.lifts.clear(), db.trainingMaxes.clear(),
    db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
    db.liftSupplementals.clear(),
  ])
  mockNavigate.mockClear()
  await db.lifts.bulkAdd(LIFTS)
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
  return cycleId
})

afterEach(drain)

describe('Today screen', () => {
  it('renders a button for each lift', async () => {
    renderToday()
    // Lift names appear in multiple places (button + rule); use role query for buttons
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const names = buttons.map(b => b.textContent ?? '')
      expect(names.some(t => t.includes('OHP'))).toBe(true)
      expect(names.some(t => t.includes('Deadlift'))).toBe(true)
      expect(names.some(t => t.includes('Bench'))).toBe(true)
      expect(names.some(t => t.includes('Squat'))).toBe(true)
    })
  })

  it('shows WEEK 1 label', async () => {
    renderToday()
    await waitFor(() => {
      expect(document.body.textContent).toContain('WEEK 1')
    })
  })

  it('renders START WORKOUT button', async () => {
    renderToday()
    await screen.findByText('START WORKOUT')
  })

  it('START WORKOUT navigates to /workout', async () => {
    renderToday()
    const btn = await screen.findByText('START WORKOUT')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/workout')
    })
  })

  it('shows SESSION IN PROGRESS banner when workout is active', async () => {
    const session: Session = {
      id: 10, cycleId: 1, liftId: 1, week: 1,
      date: new Date(), notes: null, status: 'pending',
    }
    startSession(session)
    renderToday()
    await screen.findByText(/SESSION IN PROGRESS/)
    clearSession()
  })

  it('navigates to /workout when active session matches selected lift', async () => {
    // Resume requires matching lift AND cycle/week, so use the real cycle id —
    // the auto-increment counter does not reset when the table is cleared.
    const cycleId = (await db.cycles.toArray())[0].id!
    const session: Session = {
      id: 10, cycleId, liftId: 1, week: 1,
      date: new Date(), notes: null, status: 'pending',
    }
    startSession(session)
    renderToday()
    const btn = await screen.findByText('START WORKOUT')
    fireEvent.click(btn)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/workout')
    })
    clearSession()
  })

  it('shows deload label for week 4', async () => {
    await db.sessions.clear()
    const cycleId = (await db.cycles.toArray())[0].id!
    for (const lift of LIFTS) {
      for (const week of [1, 2, 3] as const) {
        await db.sessions.add({ cycleId, liftId: lift.id!, week, date: new Date(), notes: null, status: 'completed' })
      }
    }
    renderToday()
    await screen.findByText(/DELOAD/)
  })

  it('shows no-TM warning when selected lift has no training max', async () => {
    renderToday()
    await screen.findByText('START WORKOUT')

    // Deadlift (id 2) has no TM in beforeEach
    const allBtns = screen.getAllByRole('button')
    const deadliftBtn = allBtns.find(b => b.textContent?.includes('Deadlift'))!
    fireEvent.click(deadliftBtn)

    await waitFor(() => expect(document.body.textContent).toContain('No training max set'))
  })

  it('shows "done" label for completed session', async () => {
    const cycleId = (await db.cycles.toArray())[0].id!
    await db.sessions.add({ cycleId, liftId: 2, week: 1, date: new Date(), notes: null, status: 'completed' })
    renderToday()
    await waitFor(() => expect(document.body.textContent).toContain('done'))
  })

  it('shows "skip" label for skipped session', async () => {
    const cycleId = (await db.cycles.toArray())[0].id!
    await db.sessions.add({ cycleId, liftId: 3, week: 1, date: new Date(), notes: null, status: 'skipped' })
    renderToday()
    await waitFor(() => expect(document.body.textContent).toContain('skip'))
  })

  it('a reopened week shows lifts as still-to-do, not done, despite old completed rows', async () => {
    // Simulate Settings reopen: every lift has an old completed week-1 row plus a
    // fresh pending one. Today must read the pending row (work owed), not the
    // stale completed one, so no lift shows "done".
    await db.sessions.clear()
    const cycleId = (await db.cycles.toArray())[0].id!
    for (const lift of LIFTS) {
      await db.sessions.add({ cycleId, liftId: lift.id!, week: 1, date: new Date(), notes: null, status: 'completed' })
      await db.sessions.add({ cycleId, liftId: lift.id!, week: 1, date: new Date(), notes: null, status: 'pending' })
    }
    renderToday()
    await waitFor(() => expect(document.body.textContent).toContain('WEEK 1'))
    // OHP (id 1) is auto-selected (marked with ▸); the rest are pending → no 'done'.
    const liftButtons = screen.getAllByRole('button').filter(b => /OHP|Deadlift|Bench|Squat/.test(b.textContent ?? ''))
    expect(liftButtons.some(b => b.textContent?.includes('done'))).toBe(false)
  })

  it('renders a cross-supplemental preview block driven by the movement lift TM', async () => {
    // OHP (id 1) is auto-selected. Give it an FSL cross block off Deadlift (id 2),
    // which needs its own TM so calcCrossSets has a weight. Exercises the whole
    // crossPreview resource + its render loop (previously unexercised).
    await db.trainingMaxes.add({ liftId: 2, weight: 135, setAt: new Date() })
    await db.liftSupplementals.add({
      liftId: 1, movementLiftId: 2, weightMode: 'fsl', percent: null, sets: 5, reps: 10, order: 1,
    })
    renderToday()
    await screen.findByText(/DEADLIFT\s+5 × 10\s+FSL/)
  })

  // Selection is its own channel (▸ + aria-pressed) so status keeps the colour
  // and a completed lift still reads as done while selected.
  it('marks the selected lift without spending the status colour on it', async () => {
    renderToday()
    await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const ohp = btns.find(b => b.textContent?.includes('OHP'))
      expect(ohp?.textContent).toContain('▸')
      expect(ohp?.getAttribute('aria-pressed')).toBe('true')
    })
  })

  it('SessionPreview hidden when selected lift has no training max', async () => {
    renderToday()
    await screen.findByText('START WORKOUT')

    const allBtns = screen.getAllByRole('button')
    const deadliftBtn = allBtns.find(b => b.textContent?.includes('Deadlift'))!
    fireEvent.click(deadliftBtn)

    await waitFor(() => expect(document.body.textContent).toContain('No training max'))
    expect(screen.queryByText('WARM UP')).not.toBeInTheDocument()
  })

  it('START WORKOUT with a different active session shows confirm dialog', async () => {
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    const session: Session = {
      id: 10, cycleId: 1, liftId: 1, week: 1,
      date: new Date(), notes: null, status: 'pending',
    }
    startSession(session)
    renderToday()
    await screen.findByText('START WORKOUT')

    // Select Deadlift (liftId 2, no active session for that lift), then START —
    // active session is OHP (liftId 1), selected is Deadlift (liftId 2).
    fireEvent.click(await selectLiftAndWaitForStart('Deadlift'))

    await screen.findByText(/Abandon OHP session\?/)
    clearSession()
  })

  it('abandon confirm shows even when active session liftId not found in lifts', async () => {
    // liftId 999 does not exist → activeLiftName falls back to ''
    startSession({ id: 10, cycleId: 1, liftId: 999, week: 1, date: new Date(), notes: null, status: 'pending' })
    renderToday()
    await screen.findByText('START WORKOUT')

    // OHP (liftId 1) is selected; active session is liftId 999 (not matching → abandons)
    fireEvent.click(await screen.findByText('START WORKOUT'))

    await screen.findByText(/Abandon.*session\?/)
    clearSession()
  })

  it('reuses existing pending session instead of creating a new one', async () => {
    const cycleId = (await db.cycles.toArray())[0].id!
    const existingId = await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending',
    })
    renderToday()
    const btn = await screen.findByText('START WORKOUT')
    fireEvent.click(btn)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
    expect(workout.activeSession?.id).toBe(existingId)
  })

  it('confirming NO in abandon dialog does not navigate', async () => {
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    startSession({ id: 10, cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending' })
    renderToday()
    await screen.findByText('START WORKOUT')

    fireEvent.click(await selectLiftAndWaitForStart('Deadlift'))
    await screen.findByText(/Abandon OHP session\?/)
    fireEvent.click(screen.getByText('CANCEL'))

    // confirm resolved false → handleStart returns early → no navigate
    await drain()
    expect(mockNavigate).not.toHaveBeenCalled()
    clearSession()
  })

  it('confirming YES abandons active session and starts new workout', async () => {
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    startSession({ id: 10, cycleId: 1, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending' })
    renderToday()
    await screen.findByText('START WORKOUT')

    fireEvent.click(await selectLiftAndWaitForStart('Deadlift'))
    await screen.findByText(/Abandon OHP session\?/)

    fireEvent.click(screen.getByText('YES'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
    clearSession()
  })

  it('starting an already-completed lift asks for redo confirmation; cancel creates nothing', async () => {
    const cycleId = (await db.cycles.toArray())[0].id!
    await db.sessions.add({ cycleId, liftId: 1, week: 1, date: new Date(), notes: null, status: 'completed' })
    renderToday()
    await screen.findByText('START WORKOUT')

    // OHP is done, so auto-select moved on — pick OHP back explicitly, then
    // wait for its TM to load (START stays disabled until tm > 0).
    const ohpBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('OHP'))!
    fireEvent.click(ohpBtn)
    const startBtn = await screen.findByText('START WORKOUT') as HTMLButtonElement
    await waitFor(() => expect(startBtn.disabled).toBe(false))
    fireEvent.click(startBtn)

    await screen.findByText(/OHP is already completed this week/)
    fireEvent.click(screen.getByText('CANCEL'))

    await drain()
    expect(mockNavigate).not.toHaveBeenCalled()
    expect((await db.sessions.toArray()).filter(s => s.liftId === 1)).toHaveLength(1)
  })

  it('confirming REDO on a completed lift starts a fresh pending session', async () => {
    const cycleId = (await db.cycles.toArray())[0].id!
    await db.sessions.add({ cycleId, liftId: 1, week: 1, date: new Date(), notes: null, status: 'completed' })
    renderToday()
    await screen.findByText('START WORKOUT')

    const ohpBtn = screen.getAllByRole('button').find(b => b.textContent?.includes('OHP'))!
    fireEvent.click(ohpBtn)
    const startBtn = await screen.findByText('START WORKOUT') as HTMLButtonElement
    await waitFor(() => expect(startBtn.disabled).toBe(false))
    fireEvent.click(startBtn)

    await screen.findByText(/OHP is already completed this week/)
    fireEvent.click(screen.getByText('REDO'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
    const rows = (await db.sessions.toArray()).filter(s => s.liftId === 1)
    expect(rows.map(s => s.status).sort()).toEqual(['completed', 'pending'])
    expect(workout.activeSession?.status).toBe('pending')
    clearSession()
  })

  it('confirming abandon deletes session, sets, and accessory sets from DB', async () => {
    // Covers the db.transaction cleanup block (Today.tsx ~lines 97-103).
    // The previous "confirming YES" test uses id=10 which is NOT in the DB, so the
    // transaction runs but deletes nothing. This test uses a real persisted session.
    await db.trainingMaxes.add({ liftId: 2, weight: 300, setAt: new Date() })
    const cycleId = (await db.cycles.toArray())[0].id!
    const sessionId = await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending',
    })
    await db.sets.add({ sessionId, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false })
    await db.accessorySets.add({
      sessionId, exerciseId: 1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null,
    })

    startSession({ id: sessionId, cycleId, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending' })
    renderToday()
    await screen.findByText('START WORKOUT')

    // Select Deadlift (liftId=2) — different from active OHP session
    fireEvent.click(await selectLiftAndWaitForStart('Deadlift'))
    await screen.findByText(/Abandon OHP session\?/)
    fireEvent.click(screen.getByText('YES'))

    await waitFor(async () => {
      expect(await db.sessions.get(sessionId)).toBeUndefined()
      expect(await db.sets.where('sessionId').equals(sessionId).toArray()).toHaveLength(0)
      expect(await db.accessorySets.where('sessionId').equals(sessionId).toArray()).toHaveLength(0)
    })
    clearSession()
  })
})

// ─── F13: the RESUME banner is an entry point, so it reconciles too ───────────
// START runs reconcileActiveSession before it resumes. The banner was a plain
// <A href="/workout">, which walked straight past that check and into live
// workout controls over a session the database had already finished.

describe('Today screen — RESUME banner', () => {
  const activeOn = async (status: Session['status']) => {
    const cycleId = (await db.cycles.toArray())[0].id!
    const id = await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date(), notes: null, status,
    })
    startSession({ id, cycleId, liftId: 1, week: 1, date: new Date(), notes: null, status: 'pending' })
    return id
  }

  it('resumes into the workout when the row is still pending', async () => {
    await activeOn('pending')
    renderToday()
    fireEvent.click(await screen.findByText(/SESSION IN PROGRESS/))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
  })

  it('does not resume a session the database already completed', async () => {
    await activeOn('completed')
    renderToday()
    fireEvent.click(await screen.findByText(/SESSION IN PROGRESS/))

    await waitFor(() => expect(workout.activeSession).toBeNull())
    expect(mockNavigate).not.toHaveBeenCalledWith('/workout')
    await waitFor(() => expect(screen.queryByText(/SESSION IN PROGRESS/)).not.toBeInTheDocument())
  })

  it('does not resume a session whose row was deleted out from under it', async () => {
    const id = await activeOn('pending')
    await db.sessions.delete(id)
    renderToday()
    fireEvent.click(await screen.findByText(/SESSION IN PROGRESS/))

    await waitFor(() => expect(workout.activeSession).toBeNull())
    expect(mockNavigate).not.toHaveBeenCalledWith('/workout')
  })
})

// ─── F16: starting a session is one operation ────────────────────────────────

describe('Today screen — START is single-flight', () => {
  const pendingRows = async () =>
    (await db.sessions.toArray()).filter(s => s.status === 'pending')

  it('two taps before the insert settles create one pending session, not two', async () => {
    renderToday()
    const btn = await screen.findByText('START WORKOUT')

    fireEvent.click(btn)
    fireEvent.click(btn)
    await drain()

    expect(await pendingRows()).toHaveLength(1)
    expect(workout.activeSession?.liftId).toBe(1)
  })

  it('a second tap does not abandon the session the first one started', async () => {
    renderToday()
    const btn = await screen.findByText('START WORKOUT')

    fireEvent.click(btn)
    fireEvent.click(btn)
    await drain()

    const rows = await pendingRows()
    expect(workout.activeSession?.id).toBe(rows[0].id)
  })
})

// ─── F17: TM and assistance belong to the lift that is selected NOW ──────────

describe('Today screen — stale selection results', () => {
  afterEach(() => slow.tmDelayMs.clear())

  it('a slow zero-TM result cannot overwrite the lift selected after it', async () => {
    // Deadlift (2) has no TM and answers slowly; OHP (1) has 200 and answers at
    // once. Selecting Deadlift then OHP used to land Deadlift's 0 last, which
    // disabled START and warned about a missing TM under OHP's name.
    await db.exercises.add({ id: 50, name: 'Good Morning', type: 'reps' })
    await db.assistanceDefaults.add({ liftId: 2, section: 'legs_core', exerciseId: 50 })
    slow.tmDelayMs.set(2, 60)

    renderToday()
    await screen.findByText('START WORKOUT')
    const btn = (name: string) =>
      screen.getAllByRole('button').find(b => b.textContent?.includes(name))!

    fireEvent.click(btn('Deadlift'))
    fireEvent.click(btn('OHP'))
    await new Promise(r => setTimeout(r, 120))

    expect(document.body.textContent).not.toContain('No training max set')
    expect(document.body.textContent).not.toContain('Good Morning')
    expect((screen.getByText('START WORKOUT') as HTMLButtonElement).disabled).toBe(false)
  })

  it('START is disabled while the selected lift is still unresolved', async () => {
    await db.trainingMaxes.add({ liftId: 3, weight: 180, setAt: new Date() })
    slow.tmDelayMs.set(3, 60)

    renderToday()
    await screen.findByText('START WORKOUT')
    fireEvent.click(screen.getAllByRole('button').find(b => b.textContent?.includes('Bench'))!)

    expect((screen.getByText('START WORKOUT') as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() =>
      expect((screen.getByText('START WORKOUT') as HTMLButtonElement).disabled).toBe(false),
    )
  })

  it('refuses to start when the captured lift lost its TM after selection', async () => {
    renderToday()
    const btn = await screen.findByText('START WORKOUT')

    // Another tab (or a destructive import) takes the TM away between the
    // selection and the tap. The button was enabled against a value that is
    // no longer true.
    await db.trainingMaxes.clear()
    fireEvent.click(btn)
    await drain()

    expect(await db.sessions.toArray()).toHaveLength(0)
    expect(mockNavigate).not.toHaveBeenCalledWith('/workout')
  })
})

// ─── F18: resuming is not starting ───────────────────────────────────────────
// A backup restore leaves database rows and no local workout state. START used
// to run those through startSession, which resets the store to empty — so a
// half-finished session looked untouched and the next LOG wrote a duplicate of
// a set already saved.

describe('Today screen — resuming a session the local store never saw', () => {
  const seedPendingWithWork = async () => {
    const cycleId = (await db.cycles.toArray())[0].id!
    const sessionId = await db.sessions.add({
      cycleId, liftId: 1, week: 1, date: new Date(), notes: 'tweaked shoulder', status: 'pending',
    })
    for (const [type, setNumber, weight] of [
      ['warmup', 1, 80], ['warmup', 2, 100], ['warmup', 3, 120], ['main', 1, 130],
    ] as const) {
      await db.sets.add({ sessionId, type, setNumber, weight, reps: 5, isAmrap: false })
    }
    return sessionId
  }

  it('restores the saved sets, the cursor and the notes instead of resetting them', async () => {
    const sessionId = await seedPendingWithWork()
    renderToday()
    fireEvent.click(await screen.findByText('START WORKOUT'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
    expect(workout.activeSession?.id).toBe(sessionId)
    expect(workout.loggedSets.map(s => `${s.type}${s.setNumber}`))
      .toEqual(['warmup1', 'warmup2', 'warmup3', 'main1'])
    expect(workout.currentSetIndex).toBe(4)
    expect(workout.notes).toBe('tweaked shoulder')
    clearSession()
  })

  it('restores the database ids, so the next edit or undo addresses the saved rows', async () => {
    const sessionId = await seedPendingWithWork()
    const savedIds = (await db.sets.where('sessionId').equals(sessionId).toArray()).map(s => s.id)
    renderToday()
    fireEvent.click(await screen.findByText('START WORKOUT'))

    await waitFor(() => expect(workout.loggedSets).toHaveLength(4))
    expect(workout.loggedSets.map(s => s.id).sort()).toEqual(savedIds.sort())
    clearSession()
  })

  it('still seeds the assistance defaults, which were never saved', async () => {
    await seedPendingWithWork()
    await db.exercises.add({ id: 60, name: 'Chinup', type: 'reps' })
    await db.accessoryTrainingMaxes.add({ exerciseId: 60, weight: 100, incrementLb: 5, setAt: new Date() })
    await db.assistanceDefaults.add({ liftId: 1, section: 'pull', exerciseId: 60 })

    renderToday()
    fireEvent.click(await screen.findByText('START WORKOUT'))

    await waitFor(() => expect(workout.activeAccessories).toHaveLength(1))
    expect(workout.activeAccessories[0].exerciseName).toBe('Chinup')
    clearSession()
  })

  it('a genuinely fresh session still starts empty', async () => {
    renderToday()
    fireEvent.click(await screen.findByText('START WORKOUT'))

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
    expect(workout.loggedSets).toHaveLength(0)
    expect(workout.currentSetIndex).toBe(0)
    clearSession()
  })
})
