// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import RestTimer from './RestTimer'
import { useWorkoutStore } from '../store/workoutStore'

// Silence AudioContext — RestTimer catches errors gracefully
;(globalThis as any).AudioContext = vi.fn(() => ({
  createOscillator: vi.fn(() => ({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { value: 0 },
    type: 'sine',
  })),
  createGain: vi.fn(() => ({
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  })),
  destination: {},
  currentTime: 0,
  state: 'running',
  resume: vi.fn(),
}))

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

describe('RestTimer', () => {
  beforeEach(() => {
    useWorkoutStore.setState(STORE_RESET)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('renders nothing when not resting', () => {
    const { container } = render(<RestTimer />)
    expect(container.firstChild).toBeNull()
  })

  it('renders REST label and timer display when resting', () => {
    vi.setSystemTime(10_000)
    useWorkoutStore.setState({ isResting: true, restStartedAt: 10_000, restType: 'normal' })
    render(<RestTimer />)
    expect(screen.getByText('REST')).toBeInTheDocument()
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('shows SKIP REST button when resting', () => {
    vi.setSystemTime(10_000)
    useWorkoutStore.setState({ isResting: true, restStartedAt: 10_000, restType: 'normal' })
    render(<RestTimer />)
    expect(screen.getByRole('button', { name: /SKIP REST/ })).toBeInTheDocument()
  })

  it('SKIP REST button calls stopRest', () => {
    const stopRest = vi.fn()
    vi.setSystemTime(10_000)
    useWorkoutStore.setState({ isResting: true, restStartedAt: 10_000, restType: 'normal', stopRest })
    render(<RestTimer />)
    fireEvent.click(screen.getByRole('button', { name: /SKIP REST/ }))
    expect(stopRest).toHaveBeenCalled()
  })

  it('shows elapsed time after one second', () => {
    vi.setSystemTime(10_000)
    useWorkoutStore.setState({ isResting: true, restStartedAt: 10_000, restType: 'normal' })
    render(<RestTimer />)
    act(() => { vi.advanceTimersByTime(1_000) })
    expect(screen.getByText('0:01')).toBeInTheDocument()
  })

  it('shows TIME FOR YOUR NEXT SET message after normal threshold (90s)', () => {
    vi.setSystemTime(10_000)
    useWorkoutStore.setState({ isResting: true, restStartedAt: 10_000, restType: 'normal' })
    render(<RestTimer />)
    act(() => { vi.advanceTimersByTime(91_000) })
    expect(screen.getByText('TIME FOR YOUR NEXT SET')).toBeInTheDocument()
  })

  it('shows REST UP message after fail rest exceeds 5 minutes', () => {
    vi.setSystemTime(10_000)
    useWorkoutStore.setState({ isResting: true, restStartedAt: 10_000, restType: 'fail' })
    render(<RestTimer />)
    act(() => { vi.advanceTimersByTime(301_000) })
    expect(screen.getByText('REST UP — SET FAILED')).toBeInTheDocument()
  })
})
