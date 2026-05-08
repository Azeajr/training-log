// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Settings from './Settings'
import { db } from '../db/db'
import { useSettingsStore, DEFAULT_PLATES } from '../store/settingsStore'

vi.mock('../lib/exportImport', () => ({
  exportJson: vi.fn(),
  exportCsv: vi.fn(),
  importJson: vi.fn().mockResolvedValue(undefined),
}))

const DEFAULT_STORE = {
  restTimer1: 90,
  restTimer2: 180,
  restTimerFail: 300,
  theme: 'dark',
  barWeight: 45,
  plates: DEFAULT_PLATES,
  loaded: true,
}

describe('Settings screen', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    useSettingsStore.setState(DEFAULT_STORE)
  })

  it('renders TRAINING MAXES section header', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByText(/TRAINING MAXES/)).toBeInTheDocument())
  })

  it('shows each lift with its current TM', async () => {
    const [liftId] = (await db.lifts.bulkAdd(
      [{ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      { allKeys: true }
    )) as number[]
    await db.trainingMaxes.add({ liftId, weight: 150, setAt: new Date() })

    render(<Settings />)
    await waitFor(() => expect(screen.getByText('150 lb')).toBeInTheDocument())
  })

  it('shows dash when lift has no TM', async () => {
    await db.lifts.bulkAdd([
      { name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' },
    ])

    render(<Settings />)
    await waitFor(() => expect(screen.getByText('— lb')).toBeInTheDocument())
  })

  it('clicking edit reveals stepper and SAVE button', async () => {
    const [liftId] = (await db.lifts.bulkAdd(
      [{ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      { allKeys: true }
    )) as number[]
    await db.trainingMaxes.add({ liftId, weight: 150, setAt: new Date() })

    render(<Settings />)
    await waitFor(() => screen.getByText('150 lb'))
    await userEvent.click(screen.getByRole('button', { name: 'edit' }))

    expect(screen.getByRole('button', { name: 'SAVE' })).toBeInTheDocument()
  })

  it('saving TM writes a new record to DB', async () => {
    const [liftId] = (await db.lifts.bulkAdd(
      [{ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      { allKeys: true }
    )) as number[]
    await db.trainingMaxes.add({ liftId, weight: 150, setAt: new Date() })

    render(<Settings />)
    await waitFor(() => screen.getByText('150 lb'))
    await userEvent.click(screen.getByRole('button', { name: 'edit' }))

    // Increment the stepper a few times (default value is 150)
    const plusBtns = screen.getAllByRole('button', { name: '+' })
    await userEvent.click(plusBtns[0])  // 150 → 155

    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(async () => {
      const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
      expect(tms.at(-1)?.weight).toBe(155)
    })
  })

  it('renders REST TIMERS section', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByText(/REST TIMERS/)).toBeInTheDocument())
    expect(screen.getByText('1:30')).toBeInTheDocument()  // restTimer1=90s
    expect(screen.getByText('3:00')).toBeInTheDocument()  // restTimer2=180s
    expect(screen.getByText('5:00')).toBeInTheDocument()  // restTimerFail=300s
  })

  it('rest timer + button increments the value by 30s', async () => {
    await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300 })
    render(<Settings />)
    await waitFor(() => screen.getByText('1:30'))

    // First timer row: First label, - button, display, + button
    const plusBtns = screen.getAllByRole('button', { name: '+' })
    await userEvent.click(plusBtns[0])

    await waitFor(() => expect(screen.getByText('2:00')).toBeInTheDocument())
  })

  it('rest timer - button decrements by 30s (min 30s)', async () => {
    await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300 })
    render(<Settings />)
    await waitFor(() => screen.getByText('1:30'))

    const minusBtns = screen.getAllByRole('button', { name: '-' })
    await userEvent.click(minusBtns[0])

    await waitFor(() => expect(screen.getByText('1:00')).toBeInTheDocument())
  })

  it('renders EXERCISES section', async () => {
    await db.exercises.bulkAdd([{ name: 'Chinups', type: 'reps' }])
    render(<Settings />)
    await waitFor(() => {
      expect(screen.getAllByText(/EXERCISES/).length).toBeGreaterThan(0)
      expect(screen.getByText('Chinups')).toBeInTheDocument()
    })
  })

  it('+ ADD EXERCISE reveals name input', async () => {
    render(<Settings />)
    await waitFor(() => screen.getAllByText(/EXERCISES/))
    await userEvent.click(screen.getByRole('button', { name: '+ ADD EXERCISE' }))
    expect(screen.getByPlaceholderText('Exercise name')).toBeInTheDocument()
  })

  it('adding an exercise saves to DB and shows in list', async () => {
    render(<Settings />)
    await waitFor(() => screen.getAllByText(/EXERCISES/))
    await userEvent.click(screen.getByRole('button', { name: '+ ADD EXERCISE' }))

    await userEvent.type(screen.getByPlaceholderText('Exercise name'), 'Dips')
    await userEvent.click(screen.getByRole('button', { name: 'ADD' }))

    await waitFor(() => expect(screen.getByText('Dips')).toBeInTheDocument())
    const exercises = await db.exercises.toArray()
    expect(exercises.find(e => e.name === 'Dips')).toBeDefined()
  })

  it('clicking ✕ shows delete confirmation', async () => {
    await db.exercises.bulkAdd([{ name: 'Chinups', type: 'reps' }])
    render(<Settings />)
    await waitFor(() => screen.getByText('Chinups'))

    await userEvent.click(screen.getByRole('button', { name: '✕' }))

    expect(screen.getByRole('button', { name: 'DELETE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'cancel' })).toBeInTheDocument()
  })

  it('confirming delete removes exercise from DB and list', async () => {
    const [exId] = (await db.exercises.bulkAdd(
      [{ name: 'Chinups', type: 'reps' }],
      { allKeys: true }
    )) as number[]
    render(<Settings />)
    await waitFor(() => screen.getByText('Chinups'))

    await userEvent.click(screen.getByRole('button', { name: '✕' }))
    await userEvent.click(screen.getByRole('button', { name: 'DELETE' }))

    await waitFor(() => expect(screen.queryByText('Chinups')).toBeNull())
    expect(await db.exercises.get(exId)).toBeUndefined()
  })

  it('does not delete exercise that has logged accessory sets', async () => {
    const [exId] = (await db.exercises.bulkAdd(
      [{ name: 'Chinups', type: 'reps' }],
      { allKeys: true }
    )) as number[]
    // Add an accessory set using this exercise
    await db.accessorySets.add({
      sessionId: 1, exerciseId: exId, setNumber: 1,
      weight: 50, reps: 10, duration: null, distance: null,
    })

    render(<Settings />)
    await waitFor(() => screen.getByText('Chinups'))

    await userEvent.click(screen.getByRole('button', { name: '✕' }))
    await userEvent.click(screen.getByRole('button', { name: 'DELETE' }))

    // Exercise should still be in DB
    await waitFor(async () => {
      const ex = await db.exercises.get(exId)
      expect(ex).toBeDefined()
    })
  })

  it('renders PLATES section with bar weight stepper', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByText(/PLATES/)).toBeInTheDocument())
    expect(screen.getByText('Bar')).toBeInTheDocument()
  })

  it('renders DATA section with export buttons', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByText(/DATA/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'EXPORT JSON' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EXPORT CSV' })).toBeInTheDocument()
  })
})
