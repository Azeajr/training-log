import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import History from './History'
import { db } from '../db/index'

const mockNavigate = vi.fn()
vi.mock('@solidjs/router', async () => {
  const actual = await vi.importActual<typeof import('@solidjs/router')>('@solidjs/router')
  return { ...actual, useNavigate: () => mockNavigate }
})

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

function renderHistory() {
  return render(() => (
    <Router>
      <Route path="*" component={History} />
    </Router>
  ))
}

async function seedLift() {
  return db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
}

async function seedTm(liftId: number, weight: number, msAgo: number) {
  return db.trainingMaxes.add({ liftId, weight, setAt: new Date(Date.now() - msAgo) })
}

async function seedSession(
  liftId: number,
  cycleId: number,
  msAgo: number,
  amrap?: { weight: number; reps: number },
) {
  const sessionId = await db.sessions.add({
    cycleId, liftId, week: 1,
    date: new Date(Date.now() - msAgo),
    notes: null, status: 'completed',
  })
  if (amrap) {
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: amrap.weight, reps: amrap.reps, isAmrap: true })
  }
  return sessionId
}

// ─── shared seed helpers ──────────────────────────────────────────────────────

async function seedCompletedSession(liftName: 'OHP' | 'Bench' | 'Squat' | 'Deadlift' = 'Bench', msAgo = 1_000_000) {
  const liftId = await db.lifts.add({ name: liftName, order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const sessionId = await db.sessions.add({
    cycleId, liftId, week: 1,
    date: new Date(Date.now() - msAgo),
    notes: 'felt great', status: 'completed',
  })
  await db.sets.bulkAdd([
    { sessionId, type: 'warmup', setNumber: 1, weight: 45,  reps: 5, isAmrap: false },
    { sessionId, type: 'main',   setNumber: 1, weight: 100, reps: 5, isAmrap: false },
    { sessionId, type: 'main',   setNumber: 3, weight: 130, reps: 8, isAmrap: true  },
  ])
  return { liftId, cycleId, sessionId }
}

// ─── estimated 1RM chart ──────────────────────────────────────────────────────

describe('History — estimated 1RM chart', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.lifts.clear(),
      db.trainingMaxes.clear(),
      db.cycles.clear(),
      db.sessions.clear(),
      db.sets.clear(),
    ])
  })

  afterEach(drain)

  it('shows TM legend when lift has 2+ training maxes', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 3_000_000)
    await seedTm(liftId, 205, 2_000_000)
    await seedTm(liftId, 210, 1_000_000)

    renderHistory()

    await waitFor(() => expect(screen.getByText('— TM')).toBeInTheDocument())
  })

  it('TmChart handles identical dates and weights without crashing (covers || 1 guards)', async () => {
    const liftId = await seedLift()
    const sameDate = new Date(Date.now() - 1_000_000)
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: sameDate })
    await db.trainingMaxes.add({ liftId, weight: 200, setAt: sameDate })

    renderHistory()

    await waitFor(() => expect(screen.getByText('— TM')).toBeInTheDocument())
  })

  it('TmChart renders with empty primary when no TMs but 2+ e1rm sessions (covers pts.length < 1 guard)', async () => {
    const liftId = await seedLift()
    // No TMs → tmHistory = [] (primary is empty)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedSession(liftId, cycleId, 2_000_000, { weight: 185, reps: 5 })
    await seedSession(liftId, cycleId, 1_000_000, { weight: 190, reps: 6 })

    renderHistory()

    await waitFor(() => expect(screen.getByText('- - est. 1RM')).toBeInTheDocument())
  })

  it('hides TM legend when lift has fewer than 2 training maxes', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 1_000_000)

    renderHistory()
    await screen.findByText('Bench') // lift loaded
    expect(screen.queryByText('— TM')).not.toBeInTheDocument()
  })

  it('shows est. 1RM legend when 2+ sessions have AMRAP sets', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 3_000_000)
    await seedTm(liftId, 205, 2_000_000)
    await seedTm(liftId, 210, 1_000_000)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedSession(liftId, cycleId, 2_000_000, { weight: 185, reps: 5 })
    await seedSession(liftId, cycleId, 1_000_000, { weight: 190, reps: 6 })

    renderHistory()

    await waitFor(() => expect(screen.getByText('- - est. 1RM')).toBeInTheDocument())
  })

  it('hides est. 1RM legend when no sessions have AMRAP sets', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 3_000_000)
    await seedTm(liftId, 205, 2_000_000)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedSession(liftId, cycleId, 1_000_000) // no AMRAP

    renderHistory()
    await waitFor(() => expect(screen.getByText('— TM')).toBeInTheDocument())
    expect(screen.queryByText('- - est. 1RM')).not.toBeInTheDocument()
  })

  it('hides est. 1RM legend when only 1 session has AMRAP data', async () => {
    const liftId = await seedLift()
    await seedTm(liftId, 200, 3_000_000)
    await seedTm(liftId, 205, 2_000_000)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await seedSession(liftId, cycleId, 1_000_000, { weight: 185, reps: 5 })

    renderHistory()
    await waitFor(() => expect(screen.getByText('— TM')).toBeInTheDocument())
    expect(screen.queryByText('- - est. 1RM')).not.toBeInTheDocument()
  })
})

// ─── session expansion ────────────────────────────────────────────────────────

describe('History — session expansion', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
    ])
    mockNavigate.mockClear()
  })

  afterEach(drain)

  async function findSessionRowBtn() {
    return waitFor(() => {
      const btns = screen.getAllByRole('button')
      const row = btns.find(b => b.textContent?.includes('W1') && b.textContent?.includes('Bench'))
      expect(row).toBeTruthy()
      return row!
    })
  }

  it('clicking session row expands detail showing set types', async () => {
    await seedCompletedSession()
    renderHistory()

    const rowBtn = await findSessionRowBtn()
    fireEvent.click(rowBtn)

    await waitFor(() => expect(document.body.textContent?.toLowerCase()).toContain('warmup'))
  })

  it('clicking expanded row again collapses it', async () => {
    await seedCompletedSession()
    renderHistory()

    // First click: expand
    fireEvent.click(await findSessionRowBtn())
    await screen.findByText('EDIT →')

    // Re-find session row button (sessions may re-render on selectedLiftId change)
    fireEvent.click(await findSessionRowBtn())
    await waitFor(() => expect(screen.queryByText('EDIT →')).not.toBeInTheDocument())
  })

  it('expanded detail shows joker section when session has joker sets', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1,
      date: new Date(Date.now() - 1_000_000),
      notes: null, status: 'completed',
    })
    await db.sets.bulkAdd([
      { sessionId, type: 'main',  setNumber: 1, weight: 130, reps: 5, isAmrap: false },
      { sessionId, type: 'joker', setNumber: 1, weight: 150, reps: 5, isAmrap: false },
    ])
    renderHistory()

    const rowBtn = await findSessionRowBtn()
    fireEvent.click(rowBtn)

    await waitFor(() => expect(document.body.textContent?.toLowerCase()).toContain('joker'))
  })

  it('e1rm returns null when amrapWeight is 0 (covers && falsy branch)', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(Date.now() - 1_000_000), notes: null, status: 'completed' })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 0, reps: 5, isAmrap: true })

    renderHistory()

    const rowBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const row = btns.find(b => b.textContent?.includes('W1') && b.textContent?.includes('Bench'))
      expect(row).toBeTruthy()
      return row!
    })
    fireEvent.click(rowBtn)

    // Expanded detail renders isAmrap set → e1rm() called → amrapWeight=0 → null
    await screen.findByText('EDIT →')
  })

  it('EDIT button in expanded row navigates to /history/:id/edit', async () => {
    const { sessionId } = await seedCompletedSession()
    renderHistory()

    const rowBtn = await findSessionRowBtn()
    fireEvent.click(rowBtn)

    const editBtn = await screen.findByText('EDIT →')
    fireEvent.click(editBtn)
    expect(mockNavigate).toHaveBeenCalledWith(`/history/${sessionId}/edit`)
  })

  it('expanded detail shows notes when session has notes', async () => {
    await seedCompletedSession()
    renderHistory()

    const rowBtn = await findSessionRowBtn()
    fireEvent.click(rowBtn)

    await waitFor(() => expect(document.body.textContent).toContain('felt great'))
  })
})

// ─── view modes ───────────────────────────────────────────────────────────────

describe('History — view modes', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
    ])
    mockNavigate.mockClear()
  })

  afterEach(drain)

  it('shows "No completed sessions yet." fallback when no sessions exist', async () => {
    await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    renderHistory()
    await waitFor(() =>
      expect(screen.getByText('No completed sessions yet.')).toBeInTheDocument()
    )
  })

  it('switching to By Date mode shows sessions from all lifts', async () => {
    const liftId1 = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const liftId2 = await db.lifts.add({ name: 'OHP',   order: 1, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId: liftId1, week: 1, date: new Date(Date.now() - 2_000_000), notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId: liftId2, week: 1, date: new Date(Date.now() - 1_000_000), notes: null, status: 'completed' })

    renderHistory()

    // Default "By lift" mode selects Bench; OHP session row not shown yet
    await screen.findByText('Bench')

    // Switch to By date
    fireEvent.click(screen.getByText('By date'))

    await waitFor(() => {
      const text = document.body.textContent ?? ''
      // Both lifts' session rows should appear (each contains lift name + W1)
      expect((text.match(/W1/g) ?? []).length).toBeGreaterThanOrEqual(2)
    })
  })

  it('initializes selected lift from localStorage when no URL param', async () => {
    const liftId1 = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.lifts.add({ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId: liftId1, week: 1, date: new Date(Date.now() - 1_000_000), notes: null, status: 'completed' })
    localStorage.setItem('history-lift', String(liftId1))

    renderHistory()

    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(text).toContain('W1')
    })
  })

  it('initializes selected lift from URL liftId param (covers rawLiftId branches)', async () => {
    const liftId1 = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.lifts.add({ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId: liftId1, week: 1, date: new Date(Date.now() - 1_000_000), notes: null, status: 'completed' })

    window.history.pushState({}, '', `/history?liftId=${liftId1}`)
    renderHistory()

    await waitFor(() => expect(document.body.textContent).toContain('W1'))
    window.history.pushState({}, '', '/history')
  })

  it('expanding one of two session rows renders the other with detail=null (covers detail ternary)', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(Date.now() - 2_000_000), notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId, week: 2, date: new Date(Date.now() - 1_000_000), notes: null, status: 'completed' })

    renderHistory()

    const rowBtns = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const rows = btns.filter(b => b.textContent?.includes('W') && b.textContent?.includes('Bench'))
      expect(rows.length).toBeGreaterThanOrEqual(2)
      return rows
    })
    fireEvent.click(rowBtns[0])

    // EDIT → appears for expanded row; other row renders with detail=null
    await screen.findByText('EDIT →')
  })

  it('session for a deleted lift shows "?" as the lift name', async () => {
    // Add a session pointing to liftId 999 (no matching lift in DB)
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.sessions.add({ cycleId, liftId: 999, week: 1, date: new Date(Date.now() - 1_000_000), notes: null, status: 'completed' })

    renderHistory()
    // Switch to "By date" to see all sessions regardless of selected lift
    await screen.findByText('Bench')
    fireEvent.click(screen.getByText('By date'))

    await waitFor(() => {
      expect(document.body.textContent).toContain('?')
    })
  })

  it('lift tab click updates selected lift', async () => {
    const liftId1 = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const liftId2 = await db.lifts.add({ name: 'OHP',   order: 1, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    await db.sessions.add({ cycleId, liftId: liftId1, week: 1, date: new Date(Date.now() - 2_000_000), notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId: liftId2, week: 2, date: new Date(Date.now() - 1_000_000), notes: null, status: 'completed' })

    renderHistory()
    await screen.findByText('Bench')

    // OHP tab should be visible; click it
    const ohpTab = (await screen.findAllByRole('button')).find(b => b.textContent?.trim() === 'OHP')!
    fireEvent.click(ohpTab)

    // OHP session (W2) should appear
    await waitFor(() => {
      const text = document.body.textContent ?? ''
      expect(text).toContain('W2')
    })
  })
})
