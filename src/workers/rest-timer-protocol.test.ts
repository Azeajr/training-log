import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRestTimer } from './rest-timer-protocol'

afterEach(() => { vi.useRealTimers() })

// ── F87 ─────────────────────────────────────────────────────────────────────
// This protocol had two implementations — the worker and test-setup's
// MockWorker — and only the stub was ever exercised, so they diverged unseen.
// There is one now, and this is the table both sides answer to.
describe('createRestTimer', () => {
  function timer() {
    const ticks: number[] = []
    const t = createRestTimer(({ elapsed }) => ticks.push(elapsed))
    return { t, ticks }
  }

  it('ticks once a second from restStartedAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { t, ticks } = timer()
    t.handle({ type: 'start', restStartedAt: Date.now() })
    vi.advanceTimersByTime(3_000)
    expect(ticks).toEqual([1, 2, 3])
    t.terminate()
  })

  it('stops ticking on stop', () => {
    vi.useFakeTimers()
    const { t, ticks } = timer()
    t.handle({ type: 'start', restStartedAt: Date.now() })
    vi.advanceTimersByTime(2_000)
    const before = ticks.length
    t.handle({ type: 'stop' })
    vi.advanceTimersByTime(5_000)
    expect(ticks.length).toBe(before)
  })

  // The first divergence: the stub CLEARED its interval on pause, the worker
  // keeps it running and gates the post. Observable as the timer count.
  it('keeps its interval alive while paused, and only withholds the post', () => {
    vi.useFakeTimers()
    const { t, ticks } = timer()
    t.handle({ type: 'start', restStartedAt: Date.now() })
    vi.advanceTimersByTime(1_000)
    const before = ticks.length

    t.handle({ type: 'pause' })
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(5_000)
    expect(ticks.length).toBe(before)

    t.handle({ type: 'resume' })
    vi.advanceTimersByTime(1_000)
    expect(ticks.length).toBeGreaterThan(before)
    t.terminate()
  })

  it('resumes against the original start, not the resume moment', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { t, ticks } = timer()
    t.handle({ type: 'start', restStartedAt: Date.now() })
    vi.advanceTimersByTime(2_000)
    t.handle({ type: 'pause' })
    vi.advanceTimersByTime(3_000)
    t.handle({ type: 'resume' })
    vi.advanceTimersByTime(1_000)
    // 2s ran, 3s paused, 1s after resume — elapsed is wall clock from start.
    expect(ticks[ticks.length - 1]).toBe(6)
    t.terminate()
  })

  // The second divergence, and the sharper one: from the SAME message the stub
  // fell back to Date.now() and ticked, while the worker's `!= null` guard
  // blocked every post. Opposite behaviour.
  it('posts nothing until a start has supplied restStartedAt', () => {
    vi.useFakeTimers()
    const { t, ticks } = timer()
    t.handle({ type: 'resume' })
    vi.advanceTimersByTime(5_000)
    expect(ticks).toEqual([])
    t.terminate()
  })

  it('terminate clears the interval', () => {
    vi.useFakeTimers()
    const { t } = timer()
    t.handle({ type: 'start', restStartedAt: Date.now() })
    expect(vi.getTimerCount()).toBe(1)
    t.terminate()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a second start replaces the first interval rather than stacking', () => {
    vi.useFakeTimers()
    const { t } = timer()
    t.handle({ type: 'start', restStartedAt: Date.now() })
    t.handle({ type: 'start', restStartedAt: Date.now() })
    expect(vi.getTimerCount()).toBe(1)
    t.terminate()
  })
})
