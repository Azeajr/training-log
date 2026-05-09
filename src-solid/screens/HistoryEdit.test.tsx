import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import { db } from '../../src/db/db'
import { clearSession } from '../store/workoutStore'
import HistoryEdit from './HistoryEdit'

beforeEach(async () => {
  window.history.pushState({}, '', '/1')
  clearSession()
  await db.delete()
  await db.open()
  await db.lifts.add({ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  await db.sessions.add({
    id: 1, cycleId: 1, liftId: 1, week: 1 as const,
    date: new Date('2026-01-15'), notes: null, status: 'completed' as const,
  })
  await db.sets.bulkAdd([
    { id: 1, sessionId: 1, type: 'main' as const, setNumber: 1, weight: 170, reps: 5, isAmrap: false },
    { id: 2, sessionId: 1, type: 'main' as const, setNumber: 2, weight: 185, reps: 3, isAmrap: false },
    { id: 3, sessionId: 1, type: 'main' as const, setNumber: 3, weight: 205, reps: 1, isAmrap: true },
  ])
})

afterEach(async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 0))
  }
})

describe('HistoryEdit', () => {
  it('shows session lift name and week', async () => {
    render(() => (
      <Router>
        <Route path="/:sessionId" component={HistoryEdit} />
      </Router>
    ))
    expect(await screen.findByText(/OHP/)).toBeInTheDocument()
    expect(screen.getByText(/W1/)).toBeInTheDocument()
  })

  it('shows main section label', async () => {
    render(() => (
      <Router>
        <Route path="/:sessionId" component={HistoryEdit} />
      </Router>
    ))
    expect(await screen.findByText(/^main$/i)).toBeInTheDocument()
  })

  it('shows set weights', async () => {
    render(() => (
      <Router>
        <Route path="/:sessionId" component={HistoryEdit} />
      </Router>
    ))
    // Sets load after session info; use findByText to wait for the Stepper value
    expect(await screen.findByText('170')).toBeInTheDocument()
  })

  it('shows SAVE button', async () => {
    render(() => (
      <Router>
        <Route path="/:sessionId" component={HistoryEdit} />
      </Router>
    ))
    expect(await screen.findByRole('button', { name: /^SAVE$/i })).toBeInTheDocument()
  })

  it('shows notes textarea', async () => {
    render(() => (
      <Router>
        <Route path="/:sessionId" component={HistoryEdit} />
      </Router>
    ))
    expect(await screen.findByPlaceholderText(/Session notes/i)).toBeInTheDocument()
  })

  it('shows ADD ACCESSORY button', async () => {
    render(() => (
      <Router>
        <Route path="/:sessionId" component={HistoryEdit} />
      </Router>
    ))
    expect(await screen.findByRole('button', { name: /ADD ACCESSORY/i })).toBeInTheDocument()
  })

  it('shows AMRAP label on amrap set', async () => {
    render(() => (
      <Router>
        <Route path="/:sessionId" component={HistoryEdit} />
      </Router>
    ))
    expect(await screen.findByText('AMRAP')).toBeInTheDocument()
  })

  it('shows Loading fallback when session not found', async () => {
    window.history.pushState({}, '', '/99')
    await db.delete()
    await db.open()
    render(() => (
      <Router>
        <Route path="/:sessionId" component={HistoryEdit} />
      </Router>
    ))
    expect(await screen.findByText(/Loading/i)).toBeInTheDocument()
  })
})
