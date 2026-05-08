// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccessoryPicker from './AccessoryPicker'
import { db } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'

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

describe('AccessoryPicker', () => {
  let liftId: number
  let exId: number

  beforeEach(async () => {
    await db.delete()
    await db.open()
    useWorkoutStore.setState(STORE_RESET)

    ;[liftId] = (await db.lifts.bulkAdd(
      [{ name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper' }],
      { allKeys: true }
    )) as number[]

    ;[exId] = (await db.exercises.bulkAdd(
      [{ name: 'Chinups', type: 'reps' }],
      { allKeys: true }
    )) as number[]

    await db.liftAccessories.add({ liftId, exerciseId: exId, order: 1 })
  })

  it('renders exercise list header', async () => {
    render(<AccessoryPicker liftId={liftId} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/SELECT ASSISTANCE EXERCISE/)).toBeInTheDocument())
  })

  it('renders exercises assigned to the lift', async () => {
    render(<AccessoryPicker liftId={liftId} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Chinups')).toBeInTheDocument())
  })

  it('shows NOT SET when exercise has no training max', async () => {
    render(<AccessoryPicker liftId={liftId} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Chinups'))
    expect(screen.getByText('NOT SET')).toBeInTheDocument()
  })

  it('shows calculated 5x10 weight when TM exists', async () => {
    // TM=100 → 100 * 0.75 = 75 → roundToNearest5 = 75
    await db.accessoryTrainingMaxes.add({
      exerciseId: exId, weight: 100, incrementLb: 5, setAt: new Date(),
    })
    render(<AccessoryPicker liftId={liftId} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/5x10 @ 75lb/)).toBeInTheDocument())
  })

  it('clicking exercise without TM shows TM setup form', async () => {
    render(<AccessoryPicker liftId={liftId} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText('Chinups'))
    await userEvent.click(screen.getByRole('button', { name: /Chinups/ }))
    await waitFor(() => expect(screen.getByText(/SET TRAINING MAX/)).toBeInTheDocument())
  })

  it('clicking exercise with TM calls addAccessory and onClose', async () => {
    await db.accessoryTrainingMaxes.add({
      exerciseId: exId, weight: 100, incrementLb: 5, setAt: new Date(),
    })
    const addAccessory = vi.fn()
    const onClose = vi.fn()
    useWorkoutStore.setState({ activeAccessories: [], addAccessory })

    render(<AccessoryPicker liftId={liftId} onClose={onClose} />)
    await waitFor(() => screen.getByText(/5x10 @ 75lb/))
    await userEvent.click(screen.getByRole('button', { name: /Chinups/ }))

    expect(addAccessory).toHaveBeenCalledWith(expect.objectContaining({
      exerciseId: exId,
      exerciseName: 'Chinups',
      tm: 100,
      calculatedWeight: 75,
    }))
    expect(onClose).toHaveBeenCalled()
  })

  it('TM setup form saves to DB and closes picker', async () => {
    const addAccessory = vi.fn()
    const onClose = vi.fn()
    useWorkoutStore.setState({ activeAccessories: [], addAccessory })

    render(<AccessoryPicker liftId={liftId} onClose={onClose} />)
    await waitFor(() => screen.getByText('Chinups'))
    await userEvent.click(screen.getByRole('button', { name: /Chinups/ }))
    await waitFor(() => screen.getByText(/SET TRAINING MAX/))

    // Set TM to 50 (10 clicks of +5 stepper from 0)
    const plusBtns = screen.getAllByRole('button', { name: '+' })
    for (let i = 0; i < 10; i++) await userEvent.click(plusBtns[0])

    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))

    expect(addAccessory).toHaveBeenCalledWith(expect.objectContaining({ exerciseId: exId }))
    expect(onClose).toHaveBeenCalled()

    const saved = await db.accessoryTrainingMaxes.where('exerciseId').equals(exId).toArray()
    expect(saved).toHaveLength(1)
    expect(saved[0].weight).toBe(50)
  })

  it('already-added exercises show checkmark and are disabled', async () => {
    await db.accessoryTrainingMaxes.add({
      exerciseId: exId, weight: 100, incrementLb: 5, setAt: new Date(),
    })
    useWorkoutStore.setState({
      activeAccessories: [{
        exerciseId: exId,
        exerciseName: 'Chinups',
        tm: 100,
        calculatedWeight: 75,
        loggedSets: [],
      }],
    })

    render(<AccessoryPicker liftId={liftId} onClose={vi.fn()} />)
    await waitFor(() => screen.getByText(/Chinups ✓/))
    const btn = screen.getByRole('button', { name: /Chinups ✓/ })
    expect(btn).toBeDisabled()
  })

  it('onClose is called when X button is clicked', async () => {
    const onClose = vi.fn()
    render(<AccessoryPicker liftId={liftId} onClose={onClose} />)
    await waitFor(() => screen.getByText('Chinups'))
    await userEvent.click(screen.getByRole('button', { name: '✕' }))
    expect(onClose).toHaveBeenCalled()
  })
})
