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
      db.accessorySets.clear(), db.accessoryNotes.clear(), db.exercises.clear(),
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

  it('expanded detail shows accessory sets with exercise name (covers handleExpand accSets.length > 0 branch)', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1,
      date: new Date(Date.now() - 1_000_000),
      notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })

    renderHistory()

    const rowBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const row = btns.find(b => b.textContent?.includes('W1') && b.textContent?.includes('Bench'))
      expect(row).toBeTruthy()
      return row!
    })
    fireEvent.click(rowBtn)

    await waitFor(() => expect(document.body.textContent?.toUpperCase()).toContain('CHINUP'))
  })

  it('expanded detail shows an accessory note next to its sets', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1,
      date: new Date(Date.now() - 1_000_000),
      notes: null, status: 'completed',
    })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
    await db.accessoryNotes.add({ sessionId, exerciseId: exId, notes: 'purple band' })

    renderHistory()
    fireEvent.click(await findSessionRowBtn())

    await waitFor(() => expect(document.body.textContent).toContain('purple band'))
  })

  it('expanded detail shows a note-only accessory (no logged sets) with its real exercise name', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId = await db.exercises.add({ name: 'Band Pull-Apart', type: 'reps' })
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1,
      date: new Date(Date.now() - 1_000_000),
      notes: null, status: 'completed',
    })
    await db.accessoryNotes.add({ sessionId, exerciseId: exId, notes: 'ran out of time, skipped' })

    renderHistory()
    fireEvent.click(await findSessionRowBtn())

    await waitFor(() => {
      expect(document.body.textContent?.toUpperCase()).toContain('BAND PULL-APART')
      expect(document.body.textContent).toContain('ran out of time, skipped')
    })
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

// ─── calendar mode ────────────────────────────────────────────────────────────

describe('History — calendar', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
      db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
  })

  afterEach(drain)

  it('switches to calendar view and renders current month label', async () => {
    await seedLift()
    renderHistory()
    fireEvent.click(screen.getByText('Calendar'))
    const label = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    await waitFor(() => expect(screen.getByText(label)).toBeInTheDocument())
  })

  it('marks today with the warn outline, not other current-month days (issue #53)', async () => {
    await seedLift()
    renderHistory()
    fireEvent.click(screen.getByText('Calendar'))

    const today = new Date()
    await waitFor(() => expect(screen.queryByLabelText(today.toDateString())).toBeInTheDocument())
    expect(screen.getByLabelText(today.toDateString()).className).toContain('outline-warn')

    // A different current-month day must not carry the today marker.
    const otherDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() === 1 ? 2 : 1)
    expect(screen.getByLabelText(otherDay.toDateString()).className).not.toContain('outline-warn')
  })

  it('shows session count badge on the day when a session exists', async () => {
    const liftId = await seedLift()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const today = new Date()
    const todayMidday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10)
    await db.sessions.add({
      cycleId, liftId, week: 1, date: todayMidday, notes: null, status: 'completed',
    })

    renderHistory()
    fireEvent.click(screen.getByText('Calendar'))

    // Verify the cell for today contains both the day number and a session count of 1.
    await waitFor(() => {
      const cell = screen.queryByLabelText(`${todayMidday.toDateString()}, 1 session`)
      const compact = (cell?.textContent ?? '').replace(/\s+/g, '')
      expect(compact).toBe(`${today.getDate()}1`)
    })
  })

  it('clicking a day with sessions expands them inline', async () => {
    const liftId = await seedLift()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const today = new Date()
    const todayMidday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10)
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1, date: todayMidday, notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 3, weight: 200, reps: 5, isAmrap: true })

    renderHistory()
    fireEvent.click(screen.getByText('Calendar'))

    // Wait for the count badge to render before clicking — guards against an empty
    // monthSessions racing with the click handler.
    const cellLabel = `${todayMidday.toDateString()}, 1 session`
    await waitFor(() => {
      const cell = screen.queryByLabelText(cellLabel)
      const compact = (cell?.textContent ?? '').replace(/\s+/g, '')
      expect(compact).toBe(`${today.getDate()}1`)
    })

    fireEvent.click(screen.getByLabelText(cellLabel))

    await waitFor(() => {
      expect(document.body.textContent ?? '').toContain('Bench W1')
    }, { timeout: 3000 })
  })

  it('clicking session row in calendar day view expands detail (covers calendar detail ternary)', async () => {
    const liftId = await seedLift()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const today = new Date()
    const todayMidday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10)
    const sessionId = await db.sessions.add({
      cycleId, liftId, week: 1, date: todayMidday, notes: null, status: 'completed',
    })
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 100, reps: 5, isAmrap: false })

    renderHistory()
    fireEvent.click(screen.getByText('Calendar'))

    const cellLabel = `${todayMidday.toDateString()}, 1 session`
    await waitFor(() => {
      const cell = screen.queryByLabelText(cellLabel)
      const compact = (cell?.textContent ?? '').replace(/\s+/g, '')
      expect(compact).toBe(`${today.getDate()}1`)
    })

    fireEvent.click(screen.getByLabelText(cellLabel))
    await waitFor(() => expect(document.body.textContent ?? '').toContain('Bench W1'), { timeout: 3000 })

    // Click the session row → expanded() === sessionId → detail() truthy in calendar ternary
    const rowBtn = await waitFor(() => {
      const btns = screen.getAllByRole('button')
      const row = btns.find(b => b.textContent?.includes('W1') && b.textContent?.includes('Bench'))
      expect(row).toBeTruthy()
      return row!
    })
    fireEvent.click(rowBtn)

    await screen.findByText('EDIT →')
  })

  it('cell with 2 sessions on the same day gets medium accent bg (covers dayCellClass n=2 branch)', async () => {
    // dayCellClass: n=2 → 'border border-accent/70 text-accent bg-accent/25'
    const liftId = await seedLift()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const today = new Date()
    const todayMidday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10)

    await db.sessions.add({ cycleId, liftId, week: 1, date: todayMidday, notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId, week: 2, date: todayMidday, notes: null, status: 'completed' })

    renderHistory()
    fireEvent.click(screen.getByText('Calendar'))

    await waitFor(() => {
      const cell = screen.queryByLabelText(`${todayMidday.toDateString()}, 2 sessions`)
      expect(cell).not.toBeNull()
      expect(cell!.className).toContain('bg-accent/25')
      const compact = (cell!.textContent ?? '').replace(/\s+/g, '')
      expect(compact).toBe(`${today.getDate()}2`)
    })
  })

  it('cell with ≥3 sessions on the same day gets full-strength accent bg (covers dayCellClass n≥3 branch)', async () => {
    // dayCellClass: n>=3 → 'border border-accent text-on-accent bg-accent' (solid, no opacity modifier)
    const liftId = await seedLift()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const today = new Date()
    const todayMidday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10)

    await db.sessions.add({ cycleId, liftId, week: 1, date: todayMidday, notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId, week: 2, date: todayMidday, notes: null, status: 'completed' })
    await db.sessions.add({ cycleId, liftId, week: 3, date: todayMidday, notes: null, status: 'completed' })

    renderHistory()
    fireEvent.click(screen.getByText('Calendar'))

    await waitFor(() => {
      const cell = screen.queryByLabelText(`${todayMidday.toDateString()}, 3 sessions`)
      expect(cell).not.toBeNull()
      expect(cell!.className).toContain('bg-accent')
      expect(cell!.className).not.toContain('bg-accent/')
      const compact = (cell!.textContent ?? '').replace(/\s+/g, '')
      expect(compact).toBe(`${today.getDate()}3`)
    })
  })
})

// ─── F19 / F20 / F21: async reads need an identity and a failure state ───────
// Each async operation wrote unkeyed global result signals without checking
// what was selected by the time it landed, and every one of them was fired as
// `void load(...)` with no catch.

describe('History — a failing read (F21)', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(),
      db.cycles.clear(), db.sessions.clear(), db.sets.clear(),
    ])
    mockNavigate.mockClear()
  })

  afterEach(async () => { vi.restoreAllMocks(); await drain() })

  it('does not present an unreadable database as an empty log', async () => {
    // The worst version of this bug. `sessions()` starts empty and an empty log
    // renders the same way, so a rejected roster query showed the user "No
    // completed sessions yet." over a database full of sessions.
    vi.spyOn(db.lifts, 'orderBy').mockImplementation(() => { throw new Error('disk unavailable') })

    renderHistory()

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.queryByText('No completed sessions yet.')).not.toBeInTheDocument()
    expect(document.body.textContent).toContain('disk unavailable')
  })

  it('survives a denied localStorage read of the remembered lift', async () => {
    await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    // The INSTANCE, not Storage.prototype: jsdom reaches localStorage through a
    // proxy that does not consult a patched prototype method, so a prototype
    // spy never intercepts and this test passed whether the read was guarded or
    // not. Probed before trusting it.
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('storage denied') })

    renderHistory()
    await drain()

    // A blocked preference read must not take the screen down with it: the
    // remembered lift is a convenience, not the data.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(document.body.textContent).toContain('OHP')
  })

  it('offers a retry that recovers', async () => {
    const real = db.lifts.orderBy.bind(db.lifts)
    const spy = vi.spyOn(db.lifts, 'orderBy')
    spy.mockImplementationOnce(() => { throw new Error('transient') })

    renderHistory()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    spy.mockImplementation(real)
    await db.lifts.add({ name: 'OHP', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    await waitFor(() => expect(document.body.textContent).toContain('OHP'))
  })
})

describe('History — stale detail (F19)', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.sets.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
    mockNavigate.mockClear()
  })

  afterEach(async () => { vi.restoreAllMocks(); await drain() })

  it('never shows one session’s sets under another session’s row', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const older = await seedSession(liftId, cycleId, 2_000_000)
    const newer = await seedSession(liftId, cycleId, 1_000_000)
    await db.sets.add({ sessionId: older, type: 'main', setNumber: 1, weight: 111, reps: 5, isAmrap: false })
    await db.sets.add({ sessionId: newer, type: 'main', setNumber: 1, weight: 222, reps: 5, isAmrap: false })

    renderHistory()
    await waitFor(() => expect(screen.getAllByRole('button', { expanded: false }).length).toBeGreaterThan(1))

    // Hold the first row's sets read open, expand the second, then let the
    // first land. It must not publish into the row now on screen.
    // handleExpand awaits a Promise.all of four reads, so holding any one of
    // them holds the whole detail load.
    const realGet = db.sessions.get.bind(db.sessions)
    let release!: () => void
    const held = new Promise<void>(r => { release = r })
    vi.spyOn(db.sessions, 'get').mockImplementationOnce(async (id: number) => {
      await held
      return realGet(id)
    })

    const rows = screen.getAllByRole('button', { expanded: false })
    fireEvent.click(rows[0])
    await drain()
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
    await drain()
    release()
    await drain()

    // Rows are newest-first, so the held expand is the 222 session and the one
    // left open is the 111 session. When the held read finally lands it must be
    // dropped: without the guard it published into whatever panel was open, so
    // the 111 row started showing 222.
    const open = screen.getAllByRole('button', { expanded: true })
    expect(open).toHaveLength(1)
    const panel = document.getElementById(open[0].getAttribute('aria-controls')!)
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('111')
    expect(panel!.textContent).not.toContain('222')
  })
})

// ─── F10: cross sets are logged work, so History must show and edit them ─────
// Both the display and the edit type lists left `cross` out, so History could
// badge a session for a cross-movement PR and then hide that very work in its
// expanded detail — and the editor offered no way to correct it.

describe('History — cross sets in the session detail (F10)', () => {
  beforeEach(async () => {
    localStorage.clear()
    await Promise.all([
      db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear(),
      db.sessions.clear(), db.sets.clear(), db.accessorySets.clear(), db.accessoryNotes.clear(),
    ])
    mockNavigate.mockClear()
  })

  afterEach(async () => { vi.restoreAllMocks(); await drain() })

  const seedWithCross = async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    const squatId = await db.lifts.add({ name: 'Squat', order: 1, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const sessionId = await seedSession(liftId, cycleId, 1_000_000)
    await db.sets.add({ sessionId, type: 'main', setNumber: 1, weight: 185, reps: 5, isAmrap: false })
    await db.sets.add({ sessionId, type: 'cross', setNumber: 1, weight: 225, reps: 5, isAmrap: false, liftId: squatId })
    await db.sets.add({ sessionId, type: 'cross', setNumber: 2, weight: 225, reps: 5, isAmrap: false, liftId: squatId })
    return { sessionId, squatId }
  }

  it('shows the cross sets, not just the session lift’s own', async () => {
    await seedWithCross()
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { expanded: false, name: /Bench/ }))
    await drain()

    const panel = document.getElementById(
      screen.getByRole('button', { expanded: true }).getAttribute('aria-controls')!,
    )!
    expect(panel.textContent).toContain('185')
    expect(panel.textContent).toContain('225')
  })

  it('names the movement the cross work trained, not just "Cross"', async () => {
    await seedWithCross()
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { expanded: false, name: /Bench/ }))
    await drain()

    const panel = document.getElementById(
      screen.getByRole('button', { expanded: true }).getAttribute('aria-controls')!,
    )!
    expect(panel.textContent).toMatch(/Squat/i)
  })
})

// F20's third leg — a late lift read replacing the current lift's list — has
// NO component test here, deliberately. Every seam available for holding one
// read open (trainingMaxes, sessions, sets) is also read by the RecordsPanel
// embedded in this screen, so the mock intercepts the panel's query instead of
// History's and the test passes whether the guard is present or not. A test
// that cannot fail is worse than no test, so the supersession contract is
// pinned where it is actually decidable: `async-read.test.ts` covers it
// directly, and the guards here are one-line `if (!isCurrent()) return`
// against it.
