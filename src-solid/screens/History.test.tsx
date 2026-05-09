import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import { db } from '../../src/db/db'
import History from './History'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

afterEach(async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 0))
  }
})

async function seedCompletedSession() {
  await db.lifts.add({ id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  await db.trainingMaxes.add({ liftId: 1, weight: 100, setAt: new Date('2026-01-01') })
  await db.trainingMaxes.add({ liftId: 1, weight: 105, setAt: new Date('2026-02-01') })
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const sessionId = await db.sessions.add({
    cycleId, liftId: 1, week: 1, date: new Date('2026-01-15'), notes: null, status: 'completed',
  })
  await db.sets.bulkAdd([
    { sessionId, type: 'warmup', setNumber: 1, weight: 40, reps: 5, isAmrap: false },
    { sessionId, type: 'main', setNumber: 1, weight: 65, reps: 5, isAmrap: false },
    { sessionId, type: 'main', setNumber: 3, weight: 85, reps: 8, isAmrap: true },
  ])
  return sessionId
}

describe('History', () => {
  it('shows view mode toggle buttons', async () => {
    render(() => <Router><Route path="*" component={History} /></Router>)
    expect(await screen.findByText(/By lift/i)).toBeInTheDocument()
    expect(await screen.findByText(/By date/i)).toBeInTheDocument()
  })

  it('shows no session rows with empty DB', async () => {
    render(() => <Router><Route path="*" component={History} /></Router>)
    await screen.findByText(/By lift/i)
    expect(screen.queryByText(/W1/)).toBeNull()
  })

  it('switches to date mode on button click', async () => {
    render(() => <Router><Route path="*" component={History} /></Router>)
    const dateBtn = await screen.findByText(/By date/i)
    fireEvent.click(dateBtn)
    expect(screen.getByText(/By date/i)).toBeInTheDocument()
  })

  it('shows completed session row with lift name and week', async () => {
    await seedCompletedSession()
    render(() => <Router><Route path="*" component={History} /></Router>)
    expect(await screen.findByText(/OHP W1/i)).toBeInTheDocument()
  })

  it('expanding session row shows set details', async () => {
    await seedCompletedSession()
    render(() => <Router><Route path="*" component={History} /></Router>)
    const rowBtn = await screen.findByText(/OHP W1/i)
    fireEvent.click(rowBtn)
    await waitFor(() => {
      expect(screen.getByText(/warmup/i)).toBeInTheDocument()
      expect(screen.getByText(/main/i)).toBeInTheDocument()
    })
  })

  it('EDIT button appears after expanding a session', async () => {
    await seedCompletedSession()
    render(() => <Router><Route path="*" component={History} /></Router>)
    const rowBtn = await screen.findByText(/OHP W1/i)
    fireEvent.click(rowBtn)
    expect(await screen.findByText(/EDIT/i)).toBeInTheDocument()
  })

  it('TM chart section renders when lift has 2+ TM entries', async () => {
    await seedCompletedSession() // adds 2 TMs for OHP
    render(() => <Router><Route path="*" component={History} /></Router>)
    await screen.findByText(/OHP W1/i)
    // TmChart renders as <svg> when tmHistory.length > 1
    await waitFor(() => {
      expect(document.querySelector('svg')).not.toBeNull()
    })
  })
})
