// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Today from './Today'
import { db } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const LIFTS = [
  { name: 'OHP'      as const, order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
  { name: 'Bench'    as const, order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Squat'    as const, order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

const STORE_RESET = {
  activeSession: null,
  loggedSets: [],
  currentSetIndex: 0,
  isResting: false,
  restStartedAt: null as number | null,
  restType: 'normal' as const,
  activeAccessories: [],
  notes: '',
}

async function seedBase() {
  const liftIds = (await db.lifts.bulkAdd(LIFTS, { allKeys: true })) as number[]
  const now = new Date('2026-01-01')
  await db.trainingMaxes.bulkAdd([
    { liftId: liftIds[0], weight: 95,  setAt: now },
    { liftId: liftIds[1], weight: 185, setAt: now },
    { liftId: liftIds[2], weight: 155, setAt: now },
    { liftId: liftIds[3], weight: 225, setAt: now },
  ])
  return liftIds
}

function renderToday() {
  return render(<MemoryRouter><Today /></MemoryRouter>)
}

describe('Today screen', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    mockNavigate.mockClear()
    useWorkoutStore.setState(STORE_RESET)
  })

  it('renders all four lift buttons after loading', async () => {
    await seedBase()
    renderToday()
    await waitFor(() => expect(screen.getByRole('button', { name: /OHP/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Bench/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Squat/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deadlift/ })).toBeInTheDocument()
  })

  it('shows week header', async () => {
    await seedBase()
    renderToday()
    await waitFor(() => expect(screen.getByText(/WEEK 1/)).toBeInTheDocument())
  })

  it('shows session preview sections for selected lift', async () => {
    await seedBase()
    renderToday()
    await waitFor(() => expect(screen.getByText('MAIN')).toBeInTheDocument())
    expect(screen.getByText('WARM UP')).toBeInTheDocument()
    expect(screen.getByText(/FSL/)).toBeInTheDocument()
  })

  it('shows START WORKOUT button', async () => {
    await seedBase()
    renderToday()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /START WORKOUT/ })).toBeInTheDocument()
    )
  })

  it('START WORKOUT creates a session and navigates to /workout', async () => {
    await seedBase()
    renderToday()
    const btn = await screen.findByRole('button', { name: /START WORKOUT/ })
    await userEvent.click(btn)
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/workout'))
  })

  it('selecting a different lift updates the preview', async () => {
    await seedBase()
    renderToday()
    await waitFor(() => screen.getByRole('button', { name: /Bench/ }))

    await userEvent.click(screen.getByRole('button', { name: /Bench/ }))

    // Bench header should appear
    await waitFor(() => expect(screen.getByText(/Bench . TODAY/)).toBeInTheDocument())
  })

  it('shows SESSION IN PROGRESS resume banner when store has an active session', async () => {
    const liftIds = await seedBase()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    useWorkoutStore.setState({
      activeSession: {
        id: 1,
        cycleId,
        liftId: liftIds[0],
        week: 1,
        date: new Date(),
        notes: null,
        status: 'pending',
      },
    })
    renderToday()
    await waitFor(() =>
      expect(screen.getByText(/SESSION IN PROGRESS/)).toBeInTheDocument()
    )
  })

  it('navigates directly to /workout if START is clicked for the currently active session lift', async () => {
    const liftIds = await seedBase()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    // Active session is for OHP; getNextSession will also suggest OHP first
    useWorkoutStore.setState({
      activeSession: {
        id: 1,
        cycleId,
        liftId: liftIds[0],
        week: 1,
        date: new Date(),
        notes: null,
        status: 'pending',
      },
    })
    renderToday()
    await waitFor(() => screen.getByRole('button', { name: /START WORKOUT/ }))
    await userEvent.click(screen.getByRole('button', { name: /START WORKOUT/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/workout')
  })

  it('shows abandon confirm when starting a different lift while a session is active', async () => {
    const liftIds = await seedBase()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    // Active session is for OHP (liftIds[0])
    useWorkoutStore.setState({
      activeSession: {
        id: 1,
        cycleId,
        liftId: liftIds[0],
        week: 1,
        date: new Date(),
        notes: null,
        status: 'pending',
      },
    })
    renderToday()
    await waitFor(() => screen.getByRole('button', { name: /Bench/ }))

    // Switch to Bench
    await userEvent.click(screen.getByRole('button', { name: /Bench/ }))
    // Click START WORKOUT (now targeting Bench, but OHP session is active)
    const startBtn = await screen.findByRole('button', { name: /START WORKOUT/ })
    await userEvent.click(startBtn)

    await waitFor(() => expect(screen.getByText(/ABANDON SESSION\?/)).toBeInTheDocument())
  })

  it('cancelling abandon confirm closes the dialog', async () => {
    const liftIds = await seedBase()
    const cycleId = await db.cycles.add({ number: 1, startDate: new Date(), endDate: null })
    useWorkoutStore.setState({
      activeSession: {
        id: 1,
        cycleId,
        liftId: liftIds[0],
        week: 1,
        date: new Date(),
        notes: null,
        status: 'pending',
      },
    })
    renderToday()
    await waitFor(() => screen.getByRole('button', { name: /Bench/ }))
    await userEvent.click(screen.getByRole('button', { name: /Bench/ }))
    await userEvent.click(await screen.findByRole('button', { name: /START WORKOUT/ }))
    await waitFor(() => screen.getByText(/ABANDON SESSION\?/))

    await userEvent.click(screen.getByRole('button', { name: /CANCEL/ }))

    expect(screen.queryByText(/ABANDON SESSION\?/)).toBeNull()
  })
})
