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

// ── F68 ─────────────────────────────────────────────────────────────────────
// `resume` cleared the paused flag and posted nothing, and the 1 Hz interval
// kept its original phase — so the first `elapsed` after the tab became visible
// arrived up to a full second late, while the countdown on screen had already
// jumped to the true value. The timer visibly disagreed with itself for that
// second.
describe('resume posts at once (F68)', () => {
  it('posts the current elapsed immediately, not on the next tick', () => {
    vi.useFakeTimers()
    try {
      const ticks: number[] = []
      const timer = createRestTimer(t => ticks.push(t.elapsed))
      timer.handle({ type: 'start', restStartedAt: Date.now() })

      vi.advanceTimersByTime(3_000)
      timer.handle({ type: 'pause' })
      vi.advanceTimersByTime(5_000)

      const before = ticks.length
      timer.handle({ type: 'resume' })

      expect(ticks.length).toBe(before + 1)
      expect(ticks[ticks.length - 1]).toBe(8)
      timer.terminate()
    } finally {
      vi.useRealTimers()
    }
  })

  it('resets the interval phase, so the next tick is a full second later', () => {
    vi.useFakeTimers()
    try {
      const ticks: number[] = []
      const timer = createRestTimer(t => ticks.push(t.elapsed))
      timer.handle({ type: 'start', restStartedAt: Date.now() })
      vi.advanceTimersByTime(1_500)
      timer.handle({ type: 'pause' })
      vi.advanceTimersByTime(1_000)
      timer.handle({ type: 'resume' })

      const after = ticks.length
      vi.advanceTimersByTime(999)
      expect(ticks.length).toBe(after)
      vi.advanceTimersByTime(1)
      expect(ticks.length).toBe(after + 1)
      timer.terminate()
    } finally {
      vi.useRealTimers()
    }
  })

  it('posts nothing on resume when no rest is running', () => {
    vi.useFakeTimers()
    try {
      const ticks: number[] = []
      const timer = createRestTimer(t => ticks.push(t.elapsed))
      timer.handle({ type: 'resume' })
      expect(ticks).toEqual([])
      timer.terminate()
    } finally {
      vi.useRealTimers()
    }
  })

  it('posts nothing on resume after stop', () => {
    vi.useFakeTimers()
    try {
      const ticks: number[] = []
      const timer = createRestTimer(t => ticks.push(t.elapsed))
      timer.handle({ type: 'start', restStartedAt: Date.now() })
      timer.handle({ type: 'stop' })
      const before = ticks.length
      timer.handle({ type: 'resume' })
      expect(ticks.length).toBe(before)
      timer.terminate()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── diagnostics channel ─────────────────────────────────────────────────────
// A Worker has no localStorage, so it cannot record anything itself. What it
// can do is STAMP what it emits, and keep emitting while ticks are suppressed.
// Together those two make the page/worker split observable from the page:
// a burst of old `at` values means the page froze, a hole in `seq` means the
// worker did.
describe('worker-side stamps and heartbeats', () => {
  function timer(trace = false) {
    const ticks: Array<{ elapsed: number; at: number; seq: number }> = []
    const beats: Array<{ seq: number; paused: boolean; armed: boolean }> = []
    const t = createRestTimer(
      (tick) => ticks.push(tick),
      (b) => beats.push(b),
    )
    if (trace) t.handle({ type: 'trace', on: true })
    return { t, ticks, beats }
  }

  it('stamps every tick with the worker clock and a sequence number', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const { t, ticks } = timer()
    t.handle({ type: 'start', restStartedAt: Date.now() })
    vi.advanceTimersByTime(3_000)
    expect(ticks.map(x => x.seq)).toEqual([0, 1, 2])
    expect(ticks.map(x => x.at)).toEqual([
      Date.parse('2026-01-01T00:00:01Z'),
      Date.parse('2026-01-01T00:00:02Z'),
      Date.parse('2026-01-01T00:00:03Z'),
    ])
    t.terminate()
  })

  it('emits no heartbeats until tracing is switched on', () => {
    vi.useFakeTimers()
    const { t, beats } = timer()
    t.handle({ type: 'start', restStartedAt: Date.now() })
    t.handle({ type: 'pause' })
    vi.advanceTimersByTime(5_000)
    expect(beats).toEqual([])
    t.terminate()
  })

  it('beats through a pause, where ticks are silent by design', () => {
    vi.useFakeTimers()
    const { t, ticks, beats } = timer(true)
    t.handle({ type: 'start', restStartedAt: Date.now() })
    vi.advanceTimersByTime(1_000)
    const tickedBefore = ticks.length
    t.handle({ type: 'pause' })
    vi.advanceTimersByTime(4_000)
    expect(ticks.length).toBe(tickedBefore)      // still silent — C2, by design
    expect(beats.length).toBe(4)                 // and still demonstrably alive
    expect(beats.every(b => b.paused && b.armed)).toBe(true)
    t.terminate()
  })

  it('leaves no hole in the sequence across a pause', () => {
    vi.useFakeTimers()
    const { t, ticks, beats } = timer(true)
    t.handle({ type: 'start', restStartedAt: Date.now() })
    vi.advanceTimersByTime(2_000)
    t.handle({ type: 'pause' })
    vi.advanceTimersByTime(2_000)
    t.handle({ type: 'resume' })
    vi.advanceTimersByTime(2_000)
    // Contiguity is the assertion: a missing number means the worker lost time,
    // and a pause must not look like that.
    const seqs = [...ticks.map(x => x.seq), ...beats.map(b => b.seq)].sort((a, b) => a - b)
    expect(seqs).toEqual([...seqs.keys()])
    t.terminate()
  })

  it('stops beating when tracing is switched back off', () => {
    vi.useFakeTimers()
    const { t, beats } = timer(true)
    t.handle({ type: 'start', restStartedAt: Date.now() })
    t.handle({ type: 'pause' })
    vi.advanceTimersByTime(2_000)
    const before = beats.length
    expect(before).toBeGreaterThan(0)
    t.handle({ type: 'trace', on: false })
    vi.advanceTimersByTime(5_000)
    expect(beats.length).toBe(before)
    t.terminate()
  })

  it('goes quiet once the rest stops, because the interval itself is gone', () => {
    vi.useFakeTimers()
    const { t, beats } = timer(true)
    t.handle({ type: 'start', restStartedAt: Date.now() })
    t.handle({ type: 'stop' })
    t.handle({ type: 'trace', on: true })
    // `stop` clears the interval, so nothing beats — the absence of a rest is
    // recorded page-side, not here.
    vi.advanceTimersByTime(3_000)
    expect(beats).toEqual([])
    t.terminate()
  })
})
