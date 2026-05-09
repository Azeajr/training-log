import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import { addAccessory, clearSession } from '../store/workoutStore'
import { db } from '../../src/db/db'
import AccessoryLog from './AccessoryLog'
import type { Exercise } from '../../src/db/db'

const MOCK_ACCESSORY = {
  exerciseId: 1,
  exerciseName: 'Curl',
  tm: 100,
  calculatedWeight: 75,
  loggedSets: [] as object[],
}

const MOCK_EXERCISE: Exercise = {
  id: 1,
  name: 'Curl',
  type: 'reps' as const,
}

beforeEach(async () => {
  clearSession()
  addAccessory(MOCK_ACCESSORY)
  await db.delete()
  await db.open()
})

describe('AccessoryLog', () => {
  it('shows exercise name', () => {
    render(() => <AccessoryLog accessory={MOCK_ACCESSORY} exercise={MOCK_EXERCISE} />)
    expect(screen.getByText(/Curl/i)).toBeInTheDocument()
  })

  it('shows 5x10 label', () => {
    render(() => <AccessoryLog accessory={MOCK_ACCESSORY} exercise={MOCK_EXERCISE} />)
    expect(screen.getByText(/5x10/i)).toBeInTheDocument()
  })

  it('shows calculated weight as clickable button', () => {
    render(() => <AccessoryLog accessory={MOCK_ACCESSORY} exercise={MOCK_EXERCISE} />)
    expect(screen.getByRole('button', { name: /75lb/ })).toBeInTheDocument()
  })

  it('shows LOG button for next set', () => {
    render(() => <AccessoryLog accessory={MOCK_ACCESSORY} exercise={MOCK_EXERCISE} />)
    expect(screen.getByRole('button', { name: /^LOG$/i })).toBeInTheDocument()
  })

  it('shows Set 1 label when no sets logged', () => {
    render(() => <AccessoryLog accessory={MOCK_ACCESSORY} exercise={MOCK_EXERCISE} />)
    expect(screen.getByText(/Set 1/)).toBeInTheDocument()
  })

  it('shows remove button', () => {
    render(() => <AccessoryLog accessory={MOCK_ACCESSORY} exercise={MOCK_EXERCISE} />)
    expect(screen.getByText('✕')).toBeInTheDocument()
  })

  it('hides LOG button when all 5 sets logged', () => {
    const fullSets = Array.from({ length: 5 }, (_, i) => ({
      exerciseId: 1,
      setNumber: i + 1,
      weight: 75,
      reps: 10,
      duration: null,
      distance: null,
    }))
    const doneAccessory = { ...MOCK_ACCESSORY, loggedSets: fullSets }
    render(() => <AccessoryLog accessory={doneAccessory} exercise={MOCK_EXERCISE} />)
    expect(screen.queryByRole('button', { name: /^LOG$/i })).toBeNull()
  })

  it('shows all logged sets', () => {
    const twoSets = [
      { exerciseId: 1, setNumber: 1, weight: 75, reps: 10, duration: null, distance: null },
      { exerciseId: 1, setNumber: 2, weight: 75, reps: 10, duration: null, distance: null },
    ]
    const partialAccessory = { ...MOCK_ACCESSORY, loggedSets: twoSets }
    render(() => <AccessoryLog accessory={partialAccessory} exercise={MOCK_EXERCISE} />)
    expect(screen.getByText(/Set 1:/)).toBeInTheDocument()
    expect(screen.getByText(/Set 2:/)).toBeInTheDocument()
    expect(screen.getByText(/Set 3:/)).toBeInTheDocument()
  })
})
