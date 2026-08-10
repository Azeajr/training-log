import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@solidjs/testing-library'
import RestTimer from './RestTimer'
import { startRest, stopRest, startSession, clearSession } from '../../store/workout-store'
import { updateSettings } from '../../store/settings-store'
import type { Session } from '../../types/domain'

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }
const drainMicro = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

const noopWakeLock = () =>
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }) },
    writable: true,
    configurable: true,
  })

describe('RestTimer — Screen Wake Lock', () => {
  let mockSentinel: { release: ReturnType<typeof vi.fn> }
  let wakeLockRequest: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clearSession()
    mockSentinel = { release: vi.fn().mockResolvedValue(undefined) }
    wakeLockRequest = vi.fn().mockResolvedValue(mockSentinel)
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: wakeLockRequest },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true })
  })

  afterEach(async () => {
    stopRest()
    clearSession()
    await drain()
  })

  it('requests wake lock when rest starts', async () => {
    render(() => <RestTimer />)
    startRest('normal')
    await drain()
    expect(wakeLockRequest).toHaveBeenCalledWith('screen')
  })

  it('releases wake lock when rest stops', async () => {
    render(() => <RestTimer />)
    startRest('normal')
    await drain()
    stopRest()
    await drain()
    expect(mockSentinel.release).toHaveBeenCalled()
  })

  it('releases wake lock when rest is skipped', async () => {
    const { getByText } = render(() => <RestTimer />)
    startRest('normal')
    await drain()
    getByText('SKIP REST').click()
    await drain()
    expect(mockSentinel.release).toHaveBeenCalled()
  })

  it('re-requests wake lock when page becomes visible while resting', async () => {
    render(() => <RestTimer />)
    startRest('normal')
    await drain()

    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await drain()

    const callsBefore = wakeLockRequest.mock.calls.length
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await drain()

    expect(wakeLockRequest.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('does not throw when wake lock API is unavailable', async () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: undefined,
      writable: true,
      configurable: true,
    })
    render(() => <RestTimer />)
    expect(() => startRest('normal')).not.toThrow()
    await drain()
  })
})

describe('RestTimer — audio/vibration cues', () => {
  let vibrateMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clearSession()
    vibrateMock = vi.fn()
    Object.defineProperty(navigator, 'vibrate', {
      value: vibrateMock,
      writable: true,
      configurable: true,
    })
    noopWakeLock()
    vi.useFakeTimers()
  })

  afterEach(async () => {
    stopRest()
    clearSession()
    vi.useRealTimers()
    await drainMicro()
  })

  it('fires nudge cue (vibrate 80ms) at 90s for normal rest', async () => {
    render(() => <RestTimer />)
    startRest('normal')
    await vi.advanceTimersByTimeAsync(91_000)
    expect(vibrateMock).toHaveBeenCalledWith(80)
  })

  it('fires nudge cue (vibrate 80ms) at 60s for transition rest', async () => {
    render(() => <RestTimer />)
    startRest('transition')
    await vi.advanceTimersByTimeAsync(61_000)
    expect(vibrateMock).toHaveBeenCalledWith(80)
  })

  it('fires warning cue at 180s for fail rest', async () => {
    render(() => <RestTimer />)
    startRest('fail')
    await vi.advanceTimersByTimeAsync(181_000)
    expect(vibrateMock).toHaveBeenCalledWith([80, 40, 80])
  })

  it('fires critical cue at 300s for fail rest', async () => {
    render(() => <RestTimer />)
    startRest('fail')
    await vi.advanceTimersByTimeAsync(301_000)
    expect(vibrateMock).toHaveBeenCalledWith([120, 60, 120, 60, 120])
  })

  it('does not fire before threshold for normal rest', async () => {
    render(() => <RestTimer />)
    startRest('normal')
    await vi.advanceTimersByTimeAsync(89_000)
    expect(vibrateMock).not.toHaveBeenCalled()
  })
})

describe('RestTimer — SW notification scheduling', () => {
  let postMessage: ReturnType<typeof vi.fn>
  let wakeLockRequest: ReturnType<typeof vi.fn>

  const mkSession = (): Session => ({
    cycleId: 1,
    liftId: 1,
    week: 1,
    date: new Date(),
    notes: null,
    status: 'pending',
  })

  beforeEach(async () => {
    clearSession()
    await updateSettings({ restTimerNotifications: true })
    postMessage = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: { postMessage } },
      writable: true,
      configurable: true,
    })
    wakeLockRequest = vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) })
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: wakeLockRequest },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true })
  })

  afterEach(async () => {
    await updateSettings({ restTimerNotifications: false })
    stopRest()
    clearSession()
    await drain()
  })

  it('posts schedule for the rest nudge when rest starts', async () => {
    render(() => <RestTimer />)
    await drain()
    postMessage.mockClear()
    startRest('normal')
    await drain()
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'schedule',
      tag: 'rest-timer',
      title: 'Rest complete',
    }))
  })

  it('posts cancel when rest stops', async () => {
    render(() => <RestTimer />)
    await drain()
    startRest('normal')
    await drain()
    postMessage.mockClear()
    stopRest()
    await drain()
    expect(postMessage).toHaveBeenCalledWith({ type: 'cancel', tag: 'rest-timer' })
  })

  it('posts cancel when rest is skipped', async () => {
    const { getByText } = render(() => <RestTimer />)
    await drain()
    startRest('normal')
    await drain()
    postMessage.mockClear()
    getByText('SKIP REST').click()
    await drain()
    expect(postMessage).toHaveBeenCalledWith({ type: 'cancel', tag: 'rest-timer' })
  })

  it('posts nothing when rest notifications are disabled, but rest still runs', async () => {
    await updateSettings({ restTimerNotifications: false })
    render(() => <RestTimer />)
    await drain()
    postMessage.mockClear()
    startRest('normal')
    await drain()
    expect(postMessage).not.toHaveBeenCalled()
    expect(wakeLockRequest).toHaveBeenCalledWith('screen')
  })

  it('schedules the stalled-session timer when a session starts', async () => {
    render(() => <RestTimer />)
    await drain()
    postMessage.mockClear()
    startSession(mkSession())
    await drain()
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'schedule',
      tag: 'stalled-session',
      title: 'Session idle',
    }))
  })

  it('cancels the stalled-session timer when the session is cleared', async () => {
    render(() => <RestTimer />)
    await drain()
    startSession(mkSession())
    await drain()
    postMessage.mockClear()
    clearSession()
    await drain()
    expect(postMessage).toHaveBeenCalledWith({ type: 'cancel', tag: 'stalled-session' })
  })
})
