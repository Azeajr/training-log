import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toast, showToast } from './toastStore'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('toastStore', () => {
  it('showToast sets toast message', () => {
    showToast('hello')
    expect(toast()).toBe('hello')
  })

  it('toast clears after duration', () => {
    showToast('hello', 1000)
    vi.advanceTimersByTime(1000)
    expect(toast()).toBeNull()
  })

  it('toast is still visible before duration elapses', () => {
    showToast('hello', 1000)
    vi.advanceTimersByTime(999)
    expect(toast()).toBe('hello')
  })

  it('second showToast replaces message and resets timer', () => {
    showToast('first', 1000)
    vi.advanceTimersByTime(500)
    showToast('second', 1000)
    vi.advanceTimersByTime(500)
    expect(toast()).toBe('second')
    vi.advanceTimersByTime(500)
    expect(toast()).toBeNull()
  })

  it('first timer is cancelled when second showToast fires', () => {
    showToast('first', 500)
    vi.advanceTimersByTime(400)
    showToast('second', 2000)
    vi.advanceTimersByTime(600)
    // first timer would have fired at 500ms but was cancelled
    expect(toast()).toBe('second')
  })
})
