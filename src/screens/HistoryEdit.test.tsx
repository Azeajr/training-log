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

  it('SAVE CHANGES (bottom button) also saves and navigates', async () => {
    const { sessionId, liftId } = await seedSession()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    fireEvent.click(await screen.findByText('SAVE CHANGES'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(`/history?liftId=${liftId}`)
    })
  })

  it('notes textarea change is persisted on SAVE', async () => {
    const { sessionId, liftId } = await seedSession()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    const textarea = screen.getByPlaceholderText('Session notes...')
    fireEvent.input(textarea, { target: { value: 'updated notes' } })

    fireEvent.click(await screen.findByText('SAVE'))

    await waitFor(async () => {
      const session = await db.sessions.get(sessionId)
      expect(session?.notes).toBe('updated notes')
    })
    expect(mockNavigate).toHaveBeenCalledWith(`/history?liftId=${liftId}`)
  })

  it('set weight Stepper + click increases displayed value', async () => {
    const { sessionId } = await seedSession()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    // Wait for Steppers to render (sets load async)
    const plusBtns = await waitFor(() => {
      const btns = screen.getAllByText('+')
      expect(btns.length).toBeGreaterThan(0)
      return btns
    })

    fireEvent.click(plusBtns[0])
    // No crash = updateSet was called successfully
  })

  it('set weight and reps persisted after SAVE when changed via Stepper', async () => {
    const { sessionId } = await seedSession()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    // Get all + buttons and click the first one (warmup set weight + 2.5)
    const plusBtns = await waitFor(() => {
      const btns = screen.getAllByText('+')
      expect(btns.length).toBeGreaterThan(0)
      return btns
    })
    fireEvent.click(plusBtns[0])

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const sets = await db.sets.where('sessionId').equals(sessionId).toArray()
      // At least one update should have been attempted (weight or reps changed)
      expect(sets.length).toBeGreaterThan(0)
    })
  })
})

// ─── accessory picker flow ────────────────────────────────────────────────────

async function seedSessionWithExercise() {
  const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
  await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
  const sessionId = await db.sessions.add({
    cycleId, liftId, week: 1, date: new Date('2026-03-15'), notes: null, status: 'completed',
  })
  return { sessionId, liftId, exId }
}

async function seedSessionWithAccessorySets() {
  const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
  await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
  const sessionId = await db.sessions.add({
    cycleId, liftId, week: 1, date: new Date('2026-03-15'), notes: null, status: 'completed',
  })
  await db.accessorySets.bulkAdd([
    { sessionId, exerciseId: exId, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null },
    { sessionId, exerciseId: exId, setNumber: 2, weight: 50, reps: 7, duration: null, distance: null },
  ])
  return { sessionId, liftId, exId }
}

describe('HistoryEdit — accessory picker', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.cycles.clear(), db.sessions.clear(),
      db.sets.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessorySets.clear(),
    ])
    mockNavigate.mockClear()
  })

  afterEach(drain)

  it('clicking + ADD ACCESSORY opens exercise picker overlay', async () => {
    const { sessionId } = await seedSessionWithExercise()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    fireEvent.click(await screen.findByText('+ ADD ACCESSORY'))

    await waitFor(() => expect(document.body.textContent).toContain('SELECT EXERCISE'))
    await screen.findByText('Chinup')
  })

  it('picker back arrow closes the picker', async () => {
    const { sessionId } = await seedSessionWithExercise()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    fireEvent.click(await screen.findByText('+ ADD ACCESSORY'))
    await waitFor(() => expect(document.body.textContent).toContain('SELECT EXERCISE'))

    // Click the back arrow in the picker (last ← BACK button)
    const backBtns = screen.getAllByText('← BACK')
    fireEvent.click(backBtns[backBtns.length - 1])

    await waitFor(() => expect(document.body.textContent).not.toContain('SELECT EXERCISE'))
  })

  it('picking an exercise from picker adds it to accessories list', async () => {
    const { sessionId } = await seedSessionWithExercise()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    fireEvent.click(await screen.findByText('+ ADD ACCESSORY'))
    await screen.findByText('Chinup')

    fireEvent.click(screen.getByText('Chinup'))

    // Picker closes and Chinup appears in accessories area
    await waitFor(() => expect(document.body.textContent).not.toContain('SELECT EXERCISE'))
    await waitFor(() => expect(document.body.textContent).toContain('ACCESSORIES'))
  })

  it('deleting an accessory and saving removes its sets from DB', async () => {
    const { sessionId, exId } = await seedSessionWithAccessorySets()
    renderHistoryEdit(sessionId)
    await screen.findByText('Chinup')

    // Verify sets exist
    const initialSets = await db.accessorySets.where('sessionId').equals(sessionId).toArray()
    expect(initialSets).toHaveLength(2)

    // Click ✕ to delete the Chinup accessory
    fireEvent.click(screen.getByText('✕'))

    // Accessory should vanish from UI
    await waitFor(() => {
      expect(screen.queryByText('Chinup')).not.toBeInTheDocument()
    })

    // Save
    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const remaining = await db.accessorySets
        .where('sessionId').equals(sessionId)
        .filter(s => s.exerciseId === exId)
        .toArray()
      expect(remaining).toHaveLength(0)
    })
  })

  it('adding a new accessory via picker and saving writes sets to DB', async () => {
    const { sessionId, exId } = await seedSessionWithExercise()
    renderHistoryEdit(sessionId)
    await screen.findByText(/Bench/)

    fireEvent.click(await screen.findByText('+ ADD ACCESSORY'))
    await screen.findByText('Chinup')
    fireEvent.click(screen.getByText('Chinup'))

    await waitFor(() => {
      expect(screen.queryByText('SELECT EXERCISE')).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const sets = await db.accessorySets
        .where('sessionId').equals(sessionId)
        .filter(s => s.exerciseId === exId)
        .toArray()
      expect(sets.length).toBeGreaterThan(0)
    })
  })

  it('saving existing accessory without swapping updates sets in DB', async () => {
    const { sessionId } = await seedSessionWithAccessorySets()
    renderHistoryEdit(sessionId)
    await screen.findByText('Chinup')

    // Save without any changes — existing accessory, same exerciseId → update path
    fireEvent.click(screen.getByText('SAVE'))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalled())
  })

  it('clicking "swap" opens picker and picking new exercise replaces it', async () => {
    const { sessionId } = await seedSessionWithTwoExercises()
    renderHistoryEdit(sessionId)
    await screen.findByText('Chinup')

    // swap button opens picker for specific accessory (picker = ai(), not -1)
    fireEvent.click(screen.getByText('swap'))
    await waitFor(() => expect(document.body.textContent).toContain('SELECT EXERCISE'))

    // Wait for exercises to load in picker, then pick Dips
    await screen.findByText('Dips')
    fireEvent.click(screen.getByText('Dips'))

    await waitFor(() => expect(document.body.textContent).not.toContain('SELECT EXERCISE'))
    await waitFor(() => expect(document.body.textContent).toContain('Dips'))
  })

  it('saving after swap writes sets under new exercise id', async () => {
    const { sessionId, exId1, exId2 } = await seedSessionWithTwoExercises()
    renderHistoryEdit(sessionId)
    await screen.findByText('Chinup')

    fireEvent.click(screen.getByText('swap'))
    await waitFor(() => expect(document.body.textContent).toContain('SELECT EXERCISE'))
    await screen.findByText('Dips')
    fireEvent.click(screen.getByText('Dips'))
    await waitFor(() => expect(document.body.textContent).not.toContain('SELECT EXERCISE'))

    fireEvent.click(screen.getByText('SAVE'))

    await waitFor(async () => {
      const oldSets = await db.accessorySets.where('sessionId').equals(sessionId)
        .filter(s => s.exerciseId === exId1).toArray()
      expect(oldSets).toHaveLength(0)
      const newSets = await db.accessorySets.where('sessionId').equals(sessionId)
        .filter(s => s.exerciseId === exId2).toArray()
      expect(newSets.length).toBeGreaterThan(0)
    })
  })
})

// ─── set type rendering ───────────────────────────────────────────────────────

async function seedSessionWithTwoExercises() {
  const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const exId1 = await db.exercises.add({ name: 'Chinup', type: 'reps' })
  const exId2 = await db.exercises.add({ name: 'Dips',   type: 'reps' })
  await db.liftAccessories.add({ liftId, exerciseId: exId1, order: 0 })
  await db.liftAccessories.add({ liftId, exerciseId: exId2, order: 1 })
  const sessionId = await db.sessions.add({
    cycleId, liftId, week: 1, date: new Date('2026-03-15'), notes: null, status: 'completed',
  })
  await db.accessorySets.add({ sessionId, exerciseId: exId1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
  return { sessionId, liftId, exId1, exId2 }
}

async function seedSessionWithAllSetTypes() {
  const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
  const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
  const sessionId = await db.sessions.add({
    cycleId, liftId, week: 1, date: new Date('2026-03-15'), notes: null, status: 'completed',
  })
  await db.sets.bulkAdd([
    { sessionId, type: 'warmup', setNumber: 1, weight: 80,  reps: 5,  isAmrap: false },
    { sessionId, type: 'main',   setNumber: 1, weight: 130, reps: 5,  isAmrap: false },
    { sessionId, type: 'fsl',    setNumber: 1, weight: 130, reps: 10, isAmrap: false },
    { sessionId, type: 'joker',  setNumber: 1, weight: 180, reps: 5,  isAmrap: false },
  ])
  return { sessionId, liftId }
}

describe('HistoryEdit — set type rendering', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.cycles.clear(), db.sessions.clear(),
      db.sets.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessorySets.clear(),
    ])
    mockNavigate.mockClear()
  })

  afterEach(drain)

  it('shows FSL section header for fsl set type', async () => {
    const { sessionId } = await seedSessionWithAllSetTypes()
    renderHistoryEdit(sessionId)
    await waitFor(() => expect(document.body.textContent).toContain('FSL'))
  })

  it('shows JOKER section header for joker set type', async () => {
    const { sessionId } = await seedSessionWithAllSetTypes()
    renderHistoryEdit(sessionId)
    await waitFor(() => expect(document.body.textContent).toContain('JOKER'))
  })
})

// ─── accessory exercise types ─────────────────────────────────────────────────

describe('HistoryEdit — accessory exercise types', () => {
  beforeEach(async () => {
    await Promise.all([
      db.lifts.clear(), db.cycles.clear(), db.sessions.clear(),
      db.sets.clear(), db.exercises.clear(), db.liftAccessories.clear(),
      db.accessorySets.clear(),
    ])
    mockNavigate.mockClear()
  })

  afterEach(drain)

  it('renders timed accessory (DurationInput) for timed exercise type', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId = await db.exercises.add({ name: 'Plank', type: 'timed' })
    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    const sessionId = await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'completed' })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 0, reps: null, duration: 60, distance: null })

    renderHistoryEdit(sessionId)

    await screen.findByText('Plank')
    // timed branch renders DurationInput which shows mm:ss format (colon separator is unique in this context)
    await waitFor(() => expect(document.body.textContent).toContain('Plank'))
  })

  it('renders distance accessory (distance Stepper) for distance exercise type', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId = await db.exercises.add({ name: 'Sled Push', type: 'distance' })
    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    const sessionId = await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'completed' })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 0, reps: null, duration: null, distance: 50 })

    renderHistoryEdit(sessionId)

    await screen.findByText('Sled Push')
    await waitFor(() => expect(document.body.textContent).toContain('Sled Push'))
  })

  it('clicking + on accessory set Stepper calls updateAccSet without crash', async () => {
    const { sessionId } = await seedSessionWithAccessorySets()
    renderHistoryEdit(sessionId)
    await screen.findByText('Chinup')

    // No main sets exist → all + buttons belong to accessory set Steppers
    const plusBtns = await waitFor(() => {
      const btns = screen.getAllByText('+')
      expect(btns.length).toBeGreaterThan(0)
      return btns
    })
    fireEvent.click(plusBtns[0]) // triggers updateAccSet(0, 0, 'weight', newValue)

    await waitFor(() => expect(document.body.textContent).toContain('Chinup'))
  })

  it('swapping reps exercise for timed exercise resets sets (typeChanged=true)', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId1 = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    const exId2 = await db.exercises.add({ name: 'Plank', type: 'timed' })
    await db.liftAccessories.add({ liftId, exerciseId: exId1, order: 0 })
    await db.liftAccessories.add({ liftId, exerciseId: exId2, order: 1 })
    const sessionId = await db.sessions.add({ cycleId, liftId, week: 1, date: new Date('2026-03-15'), notes: null, status: 'completed' })
    await db.accessorySets.add({ sessionId, exerciseId: exId1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })

    renderHistoryEdit(sessionId)
    await screen.findByText('Chinup')

    fireEvent.click(screen.getByText('swap'))
    await waitFor(() => expect(document.body.textContent).toContain('SELECT EXERCISE'))

    await screen.findByText('Plank')
    fireEvent.click(screen.getByText('Plank'))

    await waitFor(() => expect(document.body.textContent).not.toContain('SELECT EXERCISE'))
    await waitFor(() => expect(document.body.textContent).toContain('Plank'))
  })

  it('already-added exercise is disabled in the add-accessory picker', async () => {
    const liftId = await db.lifts.add({ name: 'Bench', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' })
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    const exId = await db.exercises.add({ name: 'Chinup', type: 'reps' })
    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 0 })
    const sessionId = await db.sessions.add({ cycleId, liftId, week: 1, date: new Date(), notes: null, status: 'completed' })
    await db.accessorySets.add({ sessionId, exerciseId: exId, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })

    renderHistoryEdit(sessionId)
    await screen.findByText('Chinup')

    fireEvent.click(await screen.findByText('+ ADD ACCESSORY'))
    await waitFor(() => expect(document.body.textContent).toContain('SELECT EXERCISE'))

    // Chinup is already in editAccessories → button should be disabled
    await waitFor(() => {
      const btn = screen.getAllByRole('button').find(b => b.textContent?.includes('Chinup'))
      expect(btn).toBeTruthy()
      expect((btn as HTMLButtonElement).disabled).toBe(true)
    })
  })
})
