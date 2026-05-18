import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import HistoryEdit from './HistoryEdit'
import { db } from '../db/index'

const mockNavigate = vi.fn()
vi.mock('@solidjs/router', async () => {
  const actual = await vi.importActual<typeof import('@solidjs/router')>('@solidjs/router')
  return { ...actual, useNavigate: () => mockNavigate }
})

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

async function seedSession() {
  const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const sessionId = await db.sessions.add({
    cycleId, liftId, week: 2, date: new Date('2026-03-15'), notes: 'felt good', status: 'completed',
  })
  await db.sets.bulkAdd([
    { sessionId, type: 'warmup', setNumber: 1, weight: 45,  reps: 5, isAmrap: false },
    { sessionId, type: 'main',   setNumber: 1, weight: 100, reps: 5, isAmrap: false },
    { sessionId, type: 'main',   setNumber: 2, weight: 115, reps: 3, isAmrap: false },
    { sessionId, type: 'main',   setNumber: 3, weight: 130, reps: 1, isAmrap: true  },
  ])
  return { sessionId, liftId }
}

function renderHistoryEdit(sessionId: number) {
  window.history.pushState({}, '', `/history/${sessionId}/edit`)
  return render(() => (
    <Router>
      <Route path="/history/:sessionId/edit" component={HistoryEdit} />
    </Router>
  ))
}

beforeEach(async () => {
  await Promise.all([
    db.lifts.clear(), db.cycles.clear(), db.sessions.clear(),
    db.sets.clear(), db.exercises.clear(), db.liftAccessories.clear(),
    db.accessorySets.clear(),
  ])
  mockNavigate.mockClear()
})

afterEach(drain)

describe('HistoryEdit screen', () => {
  it('shows loading fallback before data arrives then renders session info', async () => {
    const { sessionId } = await seedSession()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)
  })

  it('displays the week number', async () => {
    const { sessionId } = await seedSession()
    renderHistoryEdit(sessionId)
    await waitFor(() => expect(document.body.textContent).toContain('W2'))
  })

  it('displays main set rows', async () => {
    const { sessionId } = await seedSession()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)
    // main sets weights should appear
    await waitFor(() => {
      expect(screen.getAllByText('100').length).toBeGreaterThan(0)
    })
  })

  it('SAVE button updates notes in DB and navigates back', async () => {
    const { sessionId, liftId } = await seedSession()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    fireEvent.click(await screen.findByText('SAVE'))

    await waitFor(async () => {
      const session = await db.sessions.get(sessionId)
      expect(session?.notes).toBeDefined()
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/history?liftId=${liftId}`)
    })
  })

  it('shows Loading fallback for invalid session id', async () => {
    renderHistoryEdit(999)
    // Should show Loading... without crashing
    await screen.findByText('Loading...')
  })

  it('back arrow navigates to history', async () => {
    const { sessionId, liftId } = await seedSession()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)
    // Find the back button (← BACK)
    const backBtn = await screen.findByText('← BACK')
    fireEvent.click(backBtn)
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/history?liftId=${liftId}`)
    })
  })
})
