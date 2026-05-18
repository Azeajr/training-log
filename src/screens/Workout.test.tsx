import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import Workout from './Workout'
import { db } from '../db/index'
import { clearSession, startSession } from '../store/workout-store'
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

describe('Workout screen — no active session', () => {
  it('shows fallback message when no session is active', () => {
    renderWorkout()
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
})
