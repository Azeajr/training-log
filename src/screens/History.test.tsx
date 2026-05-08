// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import History from './History'
import { db } from '../db/db'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
}))

const LIFTS = [
  { name: 'OHP'      as const, order: 1, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Deadlift' as const, order: 2, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
  { name: 'Bench'    as const, order: 3, progressionIncrement: 5,  baseWeight: 95,  liftType: 'upper' as const },
  { name: 'Squat'    as const, order: 4, progressionIncrement: 10, baseWeight: 135, liftType: 'lower' as const },
]

function renderHistory() {
  return render(<MemoryRouter><History /></MemoryRouter>)
}

describe('History screen', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    mockNavigate.mockClear()
  })

  it('renders By Lift and By Date mode tabs', async () => {
    await db.lifts.bulkAdd(LIFTS)
    renderHistory()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /By lift/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /By date/i })).toBeInTheDocument()
    })
  })

  it('renders individual lift tabs in By Lift mode', async () => {
    await db.lifts.bulkAdd(LIFTS)
    renderHistory()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /OHP/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Bench/i })).toBeInTheDocument()
    })
  })

  it('shows empty state message when no completed sessions exist', async () => {
    await db.lifts.bulkAdd(LIFTS)
    renderHistory()
    await waitFor(() =>
      expect(screen.getByText(/No completed sessions yet/)).toBeInTheDocument()
    )
  })

  it('shows completed session in the list', async () => {
    const [liftId] = (await db.lifts.bulkAdd([LIFTS[0]], { allKeys: true })) as number[]
    await db.sessions.add({
      cycleId: 1,
      liftId,
      week: 1 as const,
      date: new Date('2026-03-15'),
      notes: null,
      status: 'completed' as const,
    })

    renderHistory()
    await waitFor(() => expect(screen.getByText(/OHP W1/)).toBeInTheDocument())
  })

  it('clicking a session row expands it to show sets', async () => {
    const [liftId] = (await db.lifts.bulkAdd([LIFTS[0]], { allKeys: true })) as number[]
    const sessionId = await db.sessions.add({
      cycleId: 1,
      liftId,
      week: 1 as const,
      date: new Date('2026-03-15'),
      notes: null,
      status: 'completed' as const,
    })
    await db.sets.add({
      sessionId,
      type: 'main' as const,
      setNumber: 1,
      weight: 95,
      reps: 6,
      isAmrap: false,
    })

    renderHistory()
    await waitFor(() => screen.getByText(/OHP W1/))
    await userEvent.click(screen.getByRole('button', { name: /OHP W1/ }))

    await waitFor(() => expect(screen.getByText('95lb x 6')).toBeInTheDocument())
  })

  it('expanded session shows EDIT link', async () => {
    const [liftId] = (await db.lifts.bulkAdd([LIFTS[0]], { allKeys: true })) as number[]
    await db.sessions.add({
      cycleId: 1,
      liftId,
      week: 1 as const,
      date: new Date('2026-03-15'),
      notes: null,
      status: 'completed' as const,
    })

    renderHistory()
    await waitFor(() => screen.getByText(/OHP W1/))
    await userEvent.click(screen.getByRole('button', { name: /OHP W1/ }))

    await waitFor(() => expect(screen.getByText('EDIT →')).toBeInTheDocument())
  })

  it('EDIT button navigates to /history/:id/edit', async () => {
    const [liftId] = (await db.lifts.bulkAdd([LIFTS[0]], { allKeys: true })) as number[]
    const sessionId = await db.sessions.add({
      cycleId: 1,
      liftId,
      week: 1 as const,
      date: new Date('2026-03-15'),
      notes: null,
      status: 'completed' as const,
    })

    renderHistory()
    await waitFor(() => screen.getByText(/OHP W1/))
    await userEvent.click(screen.getByRole('button', { name: /OHP W1/ }))
    await waitFor(() => screen.getByText('EDIT →'))
    await userEvent.click(screen.getByText('EDIT →'))

    expect(mockNavigate).toHaveBeenCalledWith(`/history/${sessionId}/edit`)
  })

  it('switching to By Date mode shows all completed sessions', async () => {
    const liftIds = (await db.lifts.bulkAdd([LIFTS[0], LIFTS[2]], { allKeys: true })) as number[]
    await db.sessions.bulkAdd([
      { cycleId: 1, liftId: liftIds[0], week: 1 as const, date: new Date('2026-03-10'), notes: null, status: 'completed' as const },
      { cycleId: 1, liftId: liftIds[1], week: 1 as const, date: new Date('2026-03-12'), notes: null, status: 'completed' as const },
    ])

    renderHistory()
    await waitFor(() => screen.getByRole('button', { name: /By date/i }))
    await userEvent.click(screen.getByRole('button', { name: /By date/i }))

    await waitFor(() => {
      expect(screen.getByText(/OHP W1/)).toBeInTheDocument()
      expect(screen.getByText(/Bench W1/)).toBeInTheDocument()
    })
  })

  it('pending sessions are not shown', async () => {
    const [liftId] = (await db.lifts.bulkAdd([LIFTS[0]], { allKeys: true })) as number[]
    await db.sessions.add({
      cycleId: 1,
      liftId,
      week: 1 as const,
      date: new Date('2026-03-15'),
      notes: null,
      status: 'pending' as const,
    })

    renderHistory()
    await waitFor(() => expect(screen.getByText(/No completed sessions yet/)).toBeInTheDocument())
  })
})
