// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@solidjs/testing-library'
import LiftHistoryModal from './LiftHistoryModal'
import { db } from '../../db'
import { __resetForTest } from '../../db/sqlite-client'

beforeEach(async () => {
  await __resetForTest()
})

afterEach(async () => {
  localStorage.clear()
})

describe('LiftHistoryModal', () => {
  it('shows loading state initially', () => {
    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={() => {}} />
    ))
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows empty state when no history exists', async () => {
    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      expect(screen.getByText('No completed sessions yet.')).toBeInTheDocument()
    })
  })

  it('has accessible dialog role and name', async () => {
    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: 'Lift history for Bench' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })
  })

  it('displays the lift name in the sheet title', async () => {
    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      expect(document.body.textContent).toContain('HISTORY')
      expect(document.body.textContent).toContain('Bench')
    })
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={onClose} />
    ))

    await waitFor(() => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('renders lift history entries with date, week, and sets', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-03-15T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'warmup', setNumber: 1, weight: 45, reps: 5, isAmrap: false },
      { id: 2, sessionId: 1, type: 'main', setNumber: 3, weight: 170, reps: 13, isAmrap: true },
    ])

    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      // Date and week label
      expect(document.body.textContent).toMatch(/Mar\s+\d{1,2},\s+2026/)
      expect(document.body.textContent).toContain('Week 1')
      // Set type labels
      expect(document.body.textContent).toContain('Warmup')
      expect(document.body.textContent).toContain('Main')
      // Weights
      expect(document.body.textContent).toContain('45lb')
      expect(document.body.textContent).toContain('170lb')
      // Reps
      expect(document.body.textContent).toContain('13')
      // AMRAP badge
      expect(document.body.textContent).toContain('AMRAP')
    })
  })

  it('shows DELOAD label for week 4', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 4, date: new Date('2026-03-15T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'main', setNumber: 1, weight: 130, reps: 5, isAmrap: false },
    ])

    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      expect(document.body.textContent).toContain('Week 4')
      expect(document.body.textContent).toContain('DELOAD')
    })
  })

  it('shows session notes when present', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-03-15T12:00:00'), notes: 'paused reps', status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'main', setNumber: 3, weight: 170, reps: 8, isAmrap: true },
    ])

    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      expect(document.body.textContent).toContain('paused reps')
    })
  })

  it('lists multiple sessions newest first', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06T12:00:00'), notes: null, status: 'completed' },
      { id: 2, cycleId: 1, liftId: 1, week: 2, date: new Date('2026-01-13T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.sets.bulkAdd([
      { id: 1, sessionId: 1, type: 'main', setNumber: 3, weight: 170, reps: 8, isAmrap: true },
      { id: 2, sessionId: 2, type: 'main', setNumber: 3, weight: 180, reps: 11, isAmrap: true },
    ])

    render(() => (
      <LiftHistoryModal liftName="Bench" liftId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      const text = document.body.textContent ?? ''
      const idx180 = text.indexOf('180lb')
      const idx170 = text.indexOf('170lb')
      expect(idx180).toBeGreaterThan(0)
      expect(idx170).toBeGreaterThan(0)
      expect(idx180).toBeLessThan(idx170)
    })
  })
})
