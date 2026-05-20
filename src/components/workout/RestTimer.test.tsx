import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@solidjs/testing-library'
import RestTimer from './RestTimer'
import { startRest, stopRest, clearSession } from '../../store/workout-store'

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

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
