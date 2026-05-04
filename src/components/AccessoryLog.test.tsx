// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccessoryLog from './AccessoryLog'
import { db } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'

const logAccessorySetMock = vi.fn()
const startRestMock = vi.fn()

vi.mock('../store/workoutStore', () => ({
  useWorkoutStore: vi.fn(),
}))

vi.mock('../db/db', () => ({
  db: {
    accessoryTrainingMaxes: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue([
            { id: 1, exerciseId: 1, weight: 100, incrementLb: 5, setAt: new Date() },
          ]),
        }),
      }),
      add: vi.fn().mockResolvedValue(1),
    },
  },
}))

const ACCESSORY = {
  exerciseId: 1,
  exerciseName: 'DB Row',
  tm: 100,
  calculatedWeight: 75,
  loggedSets: [],
}
const EXERCISE = { id: 1, name: 'DB Row', type: 'reps' as const }

const weightLabelBtn = () => screen.getByRole('button', { name: /^75lb$/ })

beforeEach(() => {
  logAccessorySetMock.mockClear()
  startRestMock.mockClear()
  vi.mocked(useWorkoutStore).mockReturnValue({
    logAccessorySet: logAccessorySetMock,
    startRest: startRestMock,
  } as ReturnType<typeof useWorkoutStore>)
  vi.mocked(db.accessoryTrainingMaxes.add).mockClear()
})

describe('AccessoryLog — weight tap-to-reveal', () => {
  it('shows calculatedWeight as a clickable label, no stepper by default', () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    expect(weightLabelBtn()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '75' })).toBeNull()
  })

  it('tapping weight label reveals the weight stepper', async () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    await userEvent.click(weightLabelBtn())
    expect(screen.getByRole('button', { name: '75' })).toBeInTheDocument()
  })

  it('tapping weight label again hides the weight stepper', async () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    await userEvent.click(weightLabelBtn())
    await userEvent.click(screen.getByRole('button', { name: /^75lb$/ }))
    expect(screen.queryByRole('button', { name: '75' })).toBeNull()
  })
})

describe('AccessoryLog — prospective weight in active set row', () => {
  it('shows calculatedWeight in the active set row by default', () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    expect(screen.getByText('75lb ×')).toBeInTheDocument()
  })

  it('updates the active set row weight immediately when the stepper changes', async () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    await userEvent.click(weightLabelBtn())
    await userEvent.click(screen.getAllByRole('button', { name: '+' })[0]) // 75 → 77.5
    expect(screen.getByText('77.5lb ×')).toBeInTheDocument()
  })
})

describe('AccessoryLog — logging with unchanged weight', () => {
  it('logs with calculatedWeight and does not write a TM record', async () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(logAccessorySetMock).toHaveBeenCalledWith(
      ACCESSORY.exerciseId,
      expect.objectContaining({ weight: 75 }),
    )
    expect(db.accessoryTrainingMaxes.add).not.toHaveBeenCalled()
  })
})

// When the weight stepper is open there are two "+" buttons: weight (index 0) and reps (index 1)
const wtPlus = () => screen.getAllByRole('button', { name: '+' })[0]

describe('AccessoryLog — logging with changed weight', () => {
  it('logs with the adjusted weight', async () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    await userEvent.click(weightLabelBtn())
    await userEvent.click(wtPlus()) // 75 → 77.5
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(logAccessorySetMock).toHaveBeenCalledWith(
      ACCESSORY.exerciseId,
      expect.objectContaining({ weight: 77.5 }),
    )
  })

  it('inserts a new TM back-calculated from the adjusted weight', async () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    await userEvent.click(weightLabelBtn())
    await userEvent.click(wtPlus()) // 77.5 → TM 105
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    // roundToNearest5(77.5 / 0.75) = roundToNearest5(103.33) = 105
    expect(db.accessoryTrainingMaxes.add).toHaveBeenCalledWith(
      expect.objectContaining({ exerciseId: 1, weight: 105, incrementLb: 5 }),
    )
  })

  it('inserts the TM only once across multiple set logs', async () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    await userEvent.click(weightLabelBtn())
    await userEvent.click(wtPlus())
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(db.accessoryTrainingMaxes.add).toHaveBeenCalledTimes(1)
  })
})

describe('AccessoryLog — weight persistence across remount', () => {
  it('initialises weight from last logged set, not calculatedWeight, after remount', () => {
    const accessoryWithLog = {
      ...ACCESSORY,
      loggedSets: [{ exerciseId: 1, setNumber: 1, weight: 50, reps: 10 }],
    }
    render(<AccessoryLog accessory={accessoryWithLog} exercise={EXERCISE} />)
    // Weight label must show 50 (from the logged set), not 75 (calculatedWeight)
    expect(screen.getByRole('button', { name: /^50lb$/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^75lb$/ })).toBeNull()
  })

  it('falls back to calculatedWeight when no sets have been logged yet', () => {
    render(<AccessoryLog accessory={ACCESSORY} exercise={EXERCISE} />)
    expect(screen.getByRole('button', { name: /^75lb$/ })).toBeInTheDocument()
  })
})
