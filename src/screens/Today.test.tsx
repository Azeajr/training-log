import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import Today from './Today'
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
    const session: Session = {
      id: 10, cycleId: 1, liftId: 1, week: 1,
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
})
