// @vitest-environment jsdom
/**
 * Integration tests for the Workout screen joker-button flow.
 *
 * These tests live at the component level (RTL) and cover the integration
 * gap that Playwright e2e tests previously had sole ownership of:
 *   allSets (local React state) ──► warmupCount / mainCount / jokerCount
 *   loggedSets (Zustand store)  ──► shouldShowJokerButton
 *
 * Having this level of coverage means a regression in how Workout.tsx
 * wires up shouldShowJokerButton is caught immediately by vitest, not
 * discovered only during a slow Playwright run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Workout from './Workout'
import { useWorkoutStore } from '../store/workoutStore'
import { calcMainSets, calcWarmup, calcFslSets } from '../lib/calc'

// ─── DB mock ──────────────────────────────────────────────────────────────────

const TM = 95   // same TM as e2e setup wizard
const LIFT_ID = 1
const CYCLE_ID = 1

vi.mock('../db/db', () => ({
  db: {
    lifts: {
      get: vi.fn().mockResolvedValue({
        id: 1, name: 'OHP', order: 1, progressionIncrement: 5, baseWeight: 45, liftType: 'upper',
      }),
    },
    trainingMaxes: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          sortBy: vi.fn().mockResolvedValue([{ id: 1, liftId: 1, weight: 95, setAt: new Date() }]),
        }),
      }),
    },
    exercises: { toArray: vi.fn().mockResolvedValue([]) },
    sets: {
      add: vi.fn().mockResolvedValue(99),
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue(0) }),
      }),
    },
    sessions: { update: vi.fn().mockResolvedValue(1) },
    accessorySets: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({ delete: vi.fn().mockResolvedValue(0) }),
      }),
    },
  },
}))

vi.mock('../lib/session', () => ({
  getAmrapTargets: vi.fn().mockResolvedValue([]),
  advanceCycleIfComplete: vi.fn().mockResolvedValue({ advanced: false, newTms: [] }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetStore() {
  useWorkoutStore.setState({
    activeSession: {
      id: 10,
      cycleId: CYCLE_ID,
      liftId: LIFT_ID,
      week: 1,
      date: new Date(),
      notes: null,
      status: 'pending',
    },
    loggedSets: [],
    currentSetIndex: 0,
    isResting: false,
    restStartedAt: null,
    restType: 'normal',
    activeAccessories: [],
    notes: '',
  })
}

function renderWorkout() {
  return render(
    <MemoryRouter>
      <Workout />
    </MemoryRouter>
  )
}

// Compute the expected layout for TM=95, week=1, upper body
const mainSets = calcMainSets(TM, 1)
const warmupSets = calcWarmup(TM, mainSets[0].weight, 'upper', mainSets[0].reps)
const WARMUP_COUNT = warmupSets.length   // 1 for TM=95
const MAIN_COUNT = mainSets.length       // 3

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Workout — joker button integration', () => {
  beforeEach(() => {
    resetStore()
  })

  it('renders main sets after data loads', async () => {
    renderWorkout()
    await waitFor(() => expect(screen.getByText('MAIN')).toBeInTheDocument())
  })

  it('joker button absent before AMRAP is logged', async () => {
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))
    expect(screen.queryByText(/JOKER SET/)).toBeNull()
  })

  it('joker button appears after all warmup + main sets logged with successful AMRAP', async () => {
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    // Simulate logging warmup + first two main sets via the store
    // (same as handleLog would do — append to loggedSets and advance index)
    act(() => {
      const store = useWorkoutStore.getState()
      for (let i = 0; i < WARMUP_COUNT; i++) {
        store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: warmupSets[i].weight, reps: warmupSets[i].reps, isAmrap: false })
        store.advanceSet()
      }
      for (let i = 0; i < MAIN_COUNT - 1; i++) {
        store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: mainSets[i].weight, reps: mainSets[i].reps, isAmrap: false })
        store.advanceSet()
      }
      // Log AMRAP with 8 reps (well above week 1 minimum of 5)
      const amrap = mainSets[MAIN_COUNT - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: MAIN_COUNT, weight: amrap.weight, reps: 8, isAmrap: true })
      store.advanceSet()
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ JOKER SET/ })).toBeInTheDocument()
    )
  })

  it('joker button absent when AMRAP logged below minimum (week 1: need ≥5, logged 4)', async () => {
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    act(() => {
      const store = useWorkoutStore.getState()
      for (let i = 0; i < WARMUP_COUNT; i++) {
        store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: warmupSets[i].weight, reps: warmupSets[i].reps, isAmrap: false })
        store.advanceSet()
      }
      for (let i = 0; i < MAIN_COUNT - 1; i++) {
        store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: mainSets[i].weight, reps: mainSets[i].reps, isAmrap: false })
        store.advanceSet()
      }
      const amrap = mainSets[MAIN_COUNT - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: MAIN_COUNT, weight: amrap.weight, reps: 4, isAmrap: true })
      store.advanceSet()
    })

    // After logging, COMPLETE SESSION button should be in the DOM; joker button must not be.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /\+ JOKER SET/ })).toBeNull()
    )
  })

  it('joker button absent at exactly minimum reps minus one (boundary)', async () => {
    // Week 1 minimum is 5; logging 4 should suppress joker
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => { store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      mainSets.slice(0, -1).forEach((s, i) => { store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      const amrap = mainSets[MAIN_COUNT - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: MAIN_COUNT, weight: amrap.weight, reps: 4, isAmrap: true })
      store.advanceSet()
    })

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /\+ JOKER SET/ })).toBeNull()
    )
  })

  it('joker button present at exactly the minimum reps (boundary)', async () => {
    // Week 1 minimum is 5; logging exactly 5 should show joker
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => { store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      mainSets.slice(0, -1).forEach((s, i) => { store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      const amrap = mainSets[MAIN_COUNT - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: MAIN_COUNT, weight: amrap.weight, reps: 5, isAmrap: true })
      store.advanceSet()
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ JOKER SET/ })).toBeInTheDocument()
    )
  })

  it('clicking joker button adds JOKER SETS section', async () => {
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => { store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      mainSets.slice(0, -1).forEach((s, i) => { store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      const amrap = mainSets[MAIN_COUNT - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: MAIN_COUNT, weight: amrap.weight, reps: 8, isAmrap: true })
      store.advanceSet()
    })

    const jokerBtn = await screen.findByRole('button', { name: /\+ JOKER SET/ })
    await userEvent.click(jokerBtn)

    expect(screen.getByText('JOKER SETS')).toBeInTheDocument()
  })

  it('joker button hidden while joker is pending (added but not yet logged)', async () => {
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => { store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      mainSets.slice(0, -1).forEach((s, i) => { store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      const amrap = mainSets[MAIN_COUNT - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: MAIN_COUNT, weight: amrap.weight, reps: 8, isAmrap: true })
      store.advanceSet()
    })

    const jokerBtn = await screen.findByRole('button', { name: /\+ JOKER SET/ })
    await userEvent.click(jokerBtn)

    // Joker section visible but the add-joker button should be gone (pending)
    expect(screen.getByText('JOKER SETS')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /\+ JOKER SET/ })).toBeNull()
  })

  it('week 2: joker button appears with minimum 3 reps on AMRAP', async () => {
    useWorkoutStore.setState(s => ({
      ...s,
      activeSession: { ...s.activeSession!, week: 2 },
    }))

    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    const main2 = calcMainSets(TM, 2)
    const warmup2 = calcWarmup(TM, main2[0].weight, 'upper', main2[0].reps)

    act(() => {
      const store = useWorkoutStore.getState()
      warmup2.forEach((s, i) => { store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      main2.slice(0, -1).forEach((s, i) => { store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      const amrap = main2[main2.length - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: main2.length, weight: amrap.weight, reps: 3, isAmrap: true })
      store.advanceSet()
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ JOKER SET/ })).toBeInTheDocument()
    )
  })

  it('section order: WARM UP → MAIN → FSL with no jokers', async () => {
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    const warmupEl = screen.getByText('WARM UP')
    const mainEl   = screen.getByText('MAIN')
    const fslEl    = screen.getByText(/FSL/i)

    const before = (a: HTMLElement, b: HTMLElement) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

    expect(before(warmupEl, mainEl)).toBe(true)
    expect(before(mainEl, fslEl)).toBe(true)
  })

  it('section order: JOKER SETS lands between MAIN and FSL', async () => {
    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => { store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      mainSets.slice(0, -1).forEach((s, i) => { store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      const amrap = mainSets[MAIN_COUNT - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: MAIN_COUNT, weight: amrap.weight, reps: 8, isAmrap: true })
      store.advanceSet()
    })

    const jokerBtn = await screen.findByRole('button', { name: /\+ JOKER SET/ })
    await userEvent.click(jokerBtn)

    const mainEl   = screen.getByText('MAIN')
    const jokerEl  = screen.getByText('JOKER SETS')
    const fslEl    = screen.getByText(/FSL/i)

    const before = (a: HTMLElement, b: HTMLElement) =>
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

    expect(before(mainEl, jokerEl)).toBe(true)
    expect(before(jokerEl, fslEl)).toBe(true)
  })

  it('week 3: joker button appears with minimum 1 rep on AMRAP', async () => {
    useWorkoutStore.setState(s => ({
      ...s,
      activeSession: { ...s.activeSession!, week: 3 },
    }))

    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    const main3 = calcMainSets(TM, 3)
    const warmup3 = calcWarmup(TM, main3[0].weight, 'upper', main3[0].reps)

    act(() => {
      const store = useWorkoutStore.getState()
      warmup3.forEach((s, i) => { store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      main3.slice(0, -1).forEach((s, i) => { store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false }); store.advanceSet() })
      const amrap = main3[main3.length - 1]
      store.logSet({ sessionId: 10, type: 'main', setNumber: main3.length, weight: amrap.weight, reps: 1, isAmrap: true })
      store.advanceSet()
    })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /\+ JOKER SET/ })).toBeInTheDocument()
    )
  })
})

describe('Workout — Main Set 1 → FSL weight cascade', () => {
  beforeEach(() => {
    resetStore()
  })

  it('adjusting Main Set 1 weight on log cascades to all pending FSL sets', async () => {
    // Pre-log warmup sets so Main Set 1 is active on mount
    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => {
        store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false })
        store.advanceSet()
      })
    })

    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    const main1Weight = mainSets[0].weight  // 60 for TM=95
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${main1Weight}`) }))

    const plusBtns = screen.getAllByRole('button', { name: '+' })
    await userEvent.click(plusBtns[0])  // weight: 60 → 62.5

    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))

    await waitFor(() =>
      expect(screen.getAllByText('62.5lb').length).toBeGreaterThanOrEqual(5)
    )
  })
})

describe('Workout — AMRAP weight → target reps recalculation', () => {
  beforeEach(() => {
    resetStore()
  })

  it('changing AMRAP weight instantly recalculates target reps', async () => {
    // Pre-log warmup + first two main sets so the AMRAP set is active on mount
    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => {
        store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false })
        store.advanceSet()
      })
      mainSets.slice(0, -1).forEach((s, i) => {
        store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false })
        store.advanceSet()
      })
    })

    renderWorkout()
    await waitFor(() => screen.getByText(/10 reps/))  // initial AMRAP target

    const amrapWeight = mainSets[MAIN_COUNT - 1].weight  // 80 for TM=95
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`^${amrapWeight}`) }))

    const plusBtns = screen.getAllByRole('button', { name: '+' })
    await userEvent.click(plusBtns[0])  // weight: 80 → 82.5

    await waitFor(() => expect(screen.getByText(/9 reps/)).toBeInTheDocument())
    expect(screen.queryByText(/10 reps/)).toBeNull()
  })
})

describe('Workout — set deletion (undo last logged set)', () => {
  beforeEach(() => {
    resetStore()
  })

  it('undo button appears only on the most recently logged set', async () => {
    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => {
        store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false })
        store.advanceSet()
      })
      // Log first main set
      store.logSet({ sessionId: 10, type: 'main', setNumber: 1, weight: mainSets[0].weight, reps: mainSets[0].reps, isAmrap: false })
      store.advanceSet()
    })

    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    // Exactly one "undo" button visible (on the last logged set)
    expect(screen.getAllByRole('button', { name: 'undo' })).toHaveLength(1)
  })

  it('confirming undo removes the set and re-activates its slot', async () => {
    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => {
        store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false })
        store.advanceSet()
      })
    })

    renderWorkout()
    await waitFor(() => screen.getByText('MAIN'))

    await userEvent.click(screen.getByRole('button', { name: 'undo' }))
    await userEvent.click(screen.getByRole('button', { name: 'yes' }))

    // After deletion, the warmup slot should be active again (LOG button visible)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'LOG' })).toBeInTheDocument()
    )
    // No more "undo" button (nothing logged)
    expect(screen.queryByRole('button', { name: 'undo' })).toBeNull()
  })
})

describe('Workout — FSL weight persistence across remount', () => {
  beforeEach(() => {
    resetStore()
  })

  it('pending FSL sets restore the override weight logged before navigating away', async () => {
    const fslBase = calcFslSets(TM)[0].weight   // 60 for TM=95
    const adjusted = fslBase + 5                // 65

    act(() => {
      const store = useWorkoutStore.getState()
      warmupSets.forEach((s, i) => {
        store.logSet({ sessionId: 10, type: 'warmup', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false })
        store.advanceSet()
      })
      mainSets.forEach((s, i) => {
        store.logSet({ sessionId: 10, type: 'main', setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false })
        store.advanceSet()
      })
      // First FSL set logged at adjusted weight (simulates user override before leaving the screen)
      store.logSet({ sessionId: 10, type: 'fsl', setNumber: 1, weight: adjusted, reps: 10, isAmrap: false })
      store.advanceSet()
    })

    renderWorkout()
    await waitFor(() => screen.getByText(/FSL/i))

    // fslBase (60lb) should appear only once — from the completed main set 1, not from any pending FSL row
    expect(screen.getAllByText(`${fslBase}lb`)).toHaveLength(1)
    // The adjusted weight should appear for all 5 FSL rows (1 completed + 4 pending)
    expect(screen.getAllByText(`${adjusted}lb`).length).toBeGreaterThanOrEqual(4)
  })
})
