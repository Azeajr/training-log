import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import { db } from '../../src/db/db'
import { clearSession, startSession, workout } from '../store/workoutStore'
import Workout from './Workout'

const MOCK_SESSION = {
  id: 1, cycleId: 1, liftId: 1, week: 1 as const,
  date: new Date(), notes: null, status: 'pending' as const,
}

beforeEach(async () => {
  clearSession()
  await db.delete()
  await db.open()
})

afterEach(async () => {
  // drain pending fake-indexeddb promises (e.g. fire-and-forget db.sets.add in handleLog)
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 0))
  }
})

async function seedOhpSession(week: 1 | 2 | 3 | 4 = 1) {
  await db.lifts.add({ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  await db.trainingMaxes.add({ liftId: 1, weight: 100, setAt: new Date() })
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const sessionId = await db.sessions.add({ cycleId, liftId: 1, week, date: new Date(), notes: null, status: 'pending' })
  const session = await db.sessions.get(sessionId)
  return { cycleId, sessionId, session: session! }
}

describe('Workout', () => {
  it('renders nothing visible when no active session', () => {
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    expect(screen.queryByRole('button', { name: /LOG/i })).toBeNull()
    expect(screen.queryByText(/SKIP/i)).toBeNull()
  })

  it('shows set weights after session starts with DB data', async () => {
    await db.lifts.add({ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId: 1, weight: 100, setAt: new Date() })
    startSession(MOCK_SESSION)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    const lbSpans = await screen.findAllByText(/lb/)
    expect(lbSpans.length).toBeGreaterThan(1)
  })

  it('shows SKIP button when session is active', async () => {
    await db.lifts.add({ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId: 1, weight: 100, setAt: new Date() })
    startSession(MOCK_SESSION)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    expect(await screen.findByRole('button', { name: /SKIP/i })).toBeInTheDocument()
  })

  // --- Daily flow: full persistence coverage ---

  it('LOG button writes set to DB', async () => {
    const { session } = await seedOhpSession()
    startSession(session)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    const logBtn = await screen.findByRole('button', { name: /^LOG$/i })
    fireEvent.click(logBtn)
    await waitFor(async () => {
      expect(await db.sets.count()).toBeGreaterThan(0)
    })
  })

  it('LOG starts rest timer', async () => {
    const { session } = await seedOhpSession()
    startSession(session)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    await screen.findByRole('button', { name: /^LOG$/i })
    expect(workout.isResting).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /^LOG$/i }))
    await waitFor(() => {
      expect(workout.isResting).toBe(true)
    })
  })

  it('COMPLETE SESSION marks session as completed in DB', async () => {
    const { sessionId, session } = await seedOhpSession()
    startSession(session)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    const completeBtn = await screen.findByRole('button', { name: /COMPLETE SESSION/i })
    fireEvent.click(completeBtn)
    await waitFor(async () => {
      const updated = await db.sessions.get(sessionId)
      expect(updated?.status).toBe('completed')
    })
  })

  it('COMPLETE SESSION clears workout store', async () => {
    const { session } = await seedOhpSession()
    startSession(session)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    await screen.findByRole('button', { name: /COMPLETE SESSION/i })
    fireEvent.click(screen.getByRole('button', { name: /COMPLETE SESSION/i }))
    await waitFor(() => {
      expect(workout.activeSession).toBeNull()
    })
  })

  it('SKIP LIFT → CONFIRM SKIP marks session as skipped in DB', async () => {
    const { sessionId, session } = await seedOhpSession()
    startSession(session)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    const skipBtn = await screen.findByRole('button', { name: /^SKIP LIFT$/i })
    fireEvent.click(skipBtn)
    const confirmBtn = await screen.findByRole('button', { name: /CONFIRM SKIP/i })
    fireEvent.click(confirmBtn)
    await waitFor(async () => {
      const updated = await db.sessions.get(sessionId)
      expect(updated?.status).toBe('skipped')
    })
  })

  it('joker button hidden on week 4 (deload)', async () => {
    const { session } = await seedOhpSession(4)
    startSession(session)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    await screen.findAllByText(/lb/) // wait for load
    expect(screen.queryByText(/\+ JOKER SET/i)).toBeNull()
  })

  it('warmup and FSL sets rendered with weight labels for OHP TM=100', async () => {
    const { session } = await seedOhpSession()
    startSession(session)
    render(() => <Router><Route path="*" component={Workout} /></Router>)
    // WARM UP and FSL 5×10 section headers should be present
    expect(await screen.findByText(/WARM UP/i)).toBeInTheDocument()
    expect(await screen.findByText(/FSL/i)).toBeInTheDocument()
    // at least one weight from calc (65lb is main set 1 weight for TM=100 w1)
    const lbItems = await screen.findAllByText(/lb/)
    expect(lbItems.length).toBeGreaterThan(3)
  })

  it('cycle complete modal appears after completing final week-4 session', async () => {
    // seed 4 lifts, TMs, cycle with all weeks 1-4 except the last lift's week-4
    const lifts = [
      { id: 1, name: 'OHP'      as const, order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
      { id: 2, name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
      { id: 3, name: 'Bench'    as const, order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
      { id: 4, name: 'Squat'    as const, order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
    ]
    await db.lifts.bulkAdd(lifts)
    for (const l of lifts) {
      await db.trainingMaxes.add({ liftId: l.id!, weight: 150, setAt: new Date() })
    }
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    for (const week of [1, 2, 3, 4] as const) {
      for (const l of lifts.slice(0, week === 4 ? 3 : 4)) { // week 4: only first 3 lifts done
        await db.sessions.add({ cycleId, liftId: l.id!, week, date: new Date(), notes: null, status: 'completed' })
      }
    }
    // last session: lift 4 (Squat), week 4
    const lastSessionId = await db.sessions.add({ cycleId, liftId: 4, week: 4, date: new Date(), notes: null, status: 'pending' })
    const lastSession = await db.sessions.get(lastSessionId)
    startSession(lastSession!)

    render(() => <Router><Route path="*" component={Workout} /></Router>)
    await screen.findByRole('button', { name: /COMPLETE SESSION/i })
    fireEvent.click(screen.getByRole('button', { name: /COMPLETE SESSION/i }))

    expect(await screen.findByText(/CYCLE COMPLETE/i)).toBeInTheDocument()
  })
})
