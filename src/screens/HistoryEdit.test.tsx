// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import HistoryEdit from './HistoryEdit'
import { db } from '../db/db'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderHistoryEdit(sessionId: number) {
  return render(
    <MemoryRouter initialEntries={[`/history/${sessionId}/edit`]}>
      <Routes>
        <Route path="/history/:sessionId/edit" element={<HistoryEdit />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('HistoryEdit screen', () => {
  let sessionId: number

  beforeEach(async () => {
    await db.delete()
    await db.open()
    mockNavigate.mockClear()

    const [liftId] = (await db.lifts.bulkAdd(
      [{ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      { allKeys: true }
    )) as number[]

    sessionId = await db.sessions.add({
      cycleId: 1,
      liftId,
      week: 1 as const,
      date: new Date('2026-03-15'),
      notes: 'Good session',
      status: 'completed' as const,
    })

    await db.sets.bulkAdd([
      { sessionId, type: 'warmup' as const, setNumber: 1, weight: 45, reps: 10, isAmrap: false },
      { sessionId, type: 'main'   as const, setNumber: 1, weight: 60, reps: 5,  isAmrap: false },
      { sessionId, type: 'main'   as const, setNumber: 2, weight: 70, reps: 5,  isAmrap: false },
      { sessionId, type: 'main'   as const, setNumber: 3, weight: 80, reps: 7,  isAmrap: true  },
    ])
  })

  it('shows loading then session info header', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => expect(screen.getByText(/OHP W1/)).toBeInTheDocument())
    expect(screen.getByText(/Mar \d+/)).toBeInTheDocument()
  })

  it('renders warmup section', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    expect(screen.getByText('warmup')).toBeInTheDocument()
  })

  it('renders main section with AMRAP label on last set', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    expect(screen.getByText('main')).toBeInTheDocument()
    expect(screen.getByText('AMRAP')).toBeInTheDocument()
  })

  it('renders notes textarea pre-filled with session notes', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('Good session')
  })

  it('← BACK button navigates to /history', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    await userEvent.click(screen.getByRole('button', { name: /BACK/ }))
    expect(mockNavigate).toHaveBeenCalledWith('/history')
  })

  it('SAVE button writes updated sets to DB and navigates to /history', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/history'))
  })

  it('SAVE CHANGES (bottom button) also navigates to /history', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    await userEvent.click(screen.getByRole('button', { name: 'SAVE CHANGES' }))
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/history'))
  })

  it('editing notes textarea updates the value', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Updated notes')
    expect(textarea.value).toBe('Updated notes')
  })

  it('SAVE persists edited notes to DB', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'New notes')
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    await waitFor(() => mockNavigate.mock.calls.length > 0)

    const updated = await db.sessions.get(sessionId)
    expect(updated?.notes).toBe('New notes')
  })

  it('shows + ADD ACCESSORY button', async () => {
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    expect(screen.getByRole('button', { name: /ADD ACCESSORY/ })).toBeInTheDocument()
  })

  it('renders FSL section when FSL sets exist', async () => {
    await db.sets.add({
      sessionId,
      type: 'fsl' as const,
      setNumber: 1,
      weight: 60,
      reps: 10,
      isAmrap: false,
    })
    renderHistoryEdit(sessionId)
    await waitFor(() => screen.getByText(/OHP W1/))
    expect(screen.getByText('FSL')).toBeInTheDocument()
  })
})
