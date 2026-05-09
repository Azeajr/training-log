import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import { db } from '../../src/db/db'
import { clearSession, startSession } from '../store/workoutStore'
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
})
