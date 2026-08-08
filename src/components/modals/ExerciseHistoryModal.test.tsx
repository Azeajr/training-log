// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@solidjs/testing-library'
import ExerciseHistoryModal from './ExerciseHistoryModal'
import { db } from '../../db'
import { __resetForTest } from '../../db/sqlite-client'

beforeEach(async () => {
  await __resetForTest()
})

afterEach(async () => {
  localStorage.clear()
})

describe('ExerciseHistoryModal', () => {
  it('shows loading state initially', () => {
    render(() => (
      <ExerciseHistoryModal exerciseName="Chinup" exerciseId={1} onClose={() => {}} />
    ))
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows empty state when no history exists', async () => {
    render(() => (
      <ExerciseHistoryModal exerciseName="Chinup" exerciseId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      expect(screen.getByText('No sessions logged with this exercise.')).toBeInTheDocument()
    })
  })

  it('has accessible dialog role and name', async () => {
    render(() => (
      <ExerciseHistoryModal exerciseName="Chinup" exerciseId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      const dialog = screen.getByRole('dialog', { name: 'Exercise history for Chinup' })
      expect(dialog).toHaveAttribute('aria-modal', 'true')
    })
  })

  it('displays the exercise name in the sheet title', async () => {
    render(() => (
      <ExerciseHistoryModal exerciseName="Chinup" exerciseId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      expect(document.body.textContent).toContain('HISTORY')
      expect(document.body.textContent).toContain('Chinup')
    })
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(() => (
      <ExerciseHistoryModal exerciseName="Chinup" exerciseId={1} onClose={onClose} />
    ))

    await waitFor(() => {
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('renders history entries with dates, set readouts, and notes', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-03-15T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 1, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null },
      { id: 2, sessionId: 1, exerciseId: 1, setNumber: 2, weight: 50, reps: 8, duration: null, distance: null },
    ])
    await db.accessoryNotes.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 1, notes: 'slow negatives' },
    ])

    render(() => (
      <ExerciseHistoryModal exerciseName="Chinup" exerciseId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      // Date rendered in SectionLabel
      expect(document.body.textContent).toMatch(/Mar\s+\d{1,2},\s+2026/)
      // Two 50lb entries
      expect(document.body.textContent).toContain('50lb')
      expect(document.body.textContent).toContain('slow negatives')
    })

    // Two × 8 entries
    const spans = document.body.querySelectorAll('span')
    expect(Array.from(spans).filter(s => /×\s*8/.test(s.textContent ?? '')).length).toBe(2)
  })

  it('renders timed exercise sets with formatted duration', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-03-15T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 1, setNumber: 1, weight: null, reps: null, duration: 90, distance: null },
    ])

    render(() => (
      <ExerciseHistoryModal exerciseName="Plank" exerciseId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      expect(document.body.textContent).toContain('1:30')
    })
  })

  it('renders distance exercise sets', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-03-15T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 1, setNumber: 1, weight: null, reps: null, duration: null, distance: 200 },
    ])

    render(() => (
      <ExerciseHistoryModal exerciseName="Farmer's Walk" exerciseId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      expect(document.body.textContent).toContain('200ft')
    })
  })

  it('omits weight readout for zero/null weight sets', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 1, setNumber: 1, weight: 0, reps: null, duration: 90, distance: null },
    ])

    render(() => (
      <ExerciseHistoryModal exerciseName="Plank" exerciseId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      // Duration present, weight omitted
      expect(document.body.textContent).toContain('1:30')
      expect(document.body.textContent).not.toContain('0lb')
    })
  })

  it('lists multiple sessions newest first', async () => {
    await db.sessions.bulkAdd([
      { id: 1, cycleId: 1, liftId: 1, week: 1, date: new Date('2026-01-06T12:00:00'), notes: null, status: 'completed' },
      { id: 2, cycleId: 1, liftId: 1, week: 2, date: new Date('2026-01-13T12:00:00'), notes: null, status: 'completed' },
    ])
    await db.accessorySets.bulkAdd([
      { id: 1, sessionId: 1, exerciseId: 1, setNumber: 1, weight: 50, reps: 10, duration: null, distance: null },
      { id: 2, sessionId: 2, exerciseId: 1, setNumber: 1, weight: 55, reps: 8, duration: null, distance: null },
    ])

    render(() => (
      <ExerciseHistoryModal exerciseName="Chinup" exerciseId={1} onClose={() => {}} />
    ))

    await waitFor(() => {
      const text = document.body.textContent ?? ''
      // Newer session (id 2, weight 55) appears before older (id 1, weight 50)
      const idx55 = text.indexOf('55lb')
      const idx50 = text.indexOf('50lb')
      expect(idx55).toBeGreaterThan(0)
      expect(idx50).toBeGreaterThan(0)
      expect(idx55).toBeLessThan(idx50)
    })
  })
})
