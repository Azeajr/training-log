// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { showToast, toast } from './toast-store'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.runAllTimers()
  vi.useRealTimers()
})

describe('showToast', () => {
  it('sets toast message immediately', () => {
    showToast('hello')
    expect(toast()).toBe('hello')
  })

  it('clears toast after default 2500 ms', () => {
    showToast('auto-dismiss')
    vi.advanceTimersByTime(2499)
    expect(toast()).toBe('auto-dismiss')
    vi.advanceTimersByTime(1)
    expect(toast()).toBeNull()
  })

  it('replaces previous toast and resets timer', () => {
    showToast('first')
    vi.advanceTimersByTime(1000)
    showToast('second')
    expect(toast()).toBe('second')
    // previous 'first' timer cancelled — 'second' still visible at 2499ms from its start
    vi.advanceTimersByTime(2499)
    expect(toast()).toBe('second')
    vi.advanceTimersByTime(1)
    expect(toast()).toBeNull()
  })

  it('respects custom duration', () => {
    showToast('quick', 1000)
    vi.advanceTimersByTime(999)
    expect(toast()).toBe('quick')
    vi.advanceTimersByTime(1)
    expect(toast()).toBeNull()
  })
})
