import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createNotifyTimers, type NotifyTarget } from './notify-timers'

const NOW = 1_000_000_000

const target = (over: Partial<NotifyTarget> = {}): NotifyTarget => ({
  fireAt: NOW + 1000,
  title: 't',
  body: 'b',
  tag: 'tag',
  ...over,
})

let fires: NotifyTarget[]
let timers: ReturnType<typeof createNotifyTimers>

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  fires = []
  timers = createNotifyTimers({ fire: (t) => fires.push(t) })
})

afterEach(() => {
  timers.cancelAll()
  vi.useRealTimers()
})

describe('arm / fire', () => {
  it('fires at the due time', () => {
    timers.arm(target())
    vi.advanceTimersByTime(1000)
    expect(fires).toHaveLength(1)
    expect(fires[0].tag).toBe('tag')
  })

  it('does not fire before the due time', () => {
    timers.arm(target())
    vi.advanceTimersByTime(999)
    expect(fires).toHaveLength(0)
  })

  it('past-due target fires on the next tick', () => {
    timers.arm(target({ fireAt: NOW - 5 }))
    expect(fires).toHaveLength(0)              // deferred, not synchronous
    vi.advanceTimersByTime(0)
    expect(fires).toHaveLength(1)
  })

  it('past-due target cancelled before the tick never fires', () => {
    timers.arm(target({ fireAt: NOW - 5 }))
    timers.cancelTag('tag')
    vi.advanceTimersByTime(0)
    expect(fires).toHaveLength(0)
  })

  it('two same-tag targets both fire (completed-set checkpoints)', () => {
    timers.arm(target({ fireAt: NOW + 180_000 }))
    timers.arm(target({ fireAt: NOW + 300_000 }))
    vi.advanceTimersByTime(180_000)
    expect(fires).toHaveLength(1)
    vi.advanceTimersByTime(120_000)
    expect(fires).toHaveLength(2)
  })
})

describe('cancel', () => {
  it('cancelTag drops every pending timer for the tag', () => {
    timers.arm(target())
    timers.arm(target({ fireAt: NOW + 2000 }))
    timers.arm(target({ tag: 'other', fireAt: NOW + 2000 }))
    timers.cancelTag('tag')
    expect(timers.pending()).toHaveLength(1)
    expect(timers.pending()[0].target.tag).toBe('other')
  })

  it('cancelHandle drops a single timer', () => {
    const a = timers.arm(target())
    const b = timers.arm(target({ fireAt: NOW + 2000 }))
    timers.cancelHandle(a)
    expect(timers.pending()).toHaveLength(1)          // b still armed
    expect(timers.pending()[0].handle).toBe(b)
    vi.advanceTimersByTime(2000)
    expect(fires).toHaveLength(1)                     // only b fired
    expect(timers.pending()).toHaveLength(0)          // fired handle pruned
  })

  it('cancelAll clears both tags', () => {
    timers.arm(target())
    timers.arm(target({ tag: 'stalled' }))
    timers.cancelAll()
    expect(timers.pending()).toHaveLength(0)
    vi.advanceTimersByTime(10_000)
    expect(fires).toHaveLength(0)
  })

  it('cancel after fire is a no-op (fired timer already pruned)', () => {
    const handle = timers.arm(target())
    vi.advanceTimersByTime(1000)
    expect(fires).toHaveLength(1)
    expect(timers.pending()).toHaveLength(0)
    timers.cancelHandle(handle)
    expect(fires).toHaveLength(1)
  })
})

describe('pending', () => {
  it('reports live handles in arm order', () => {
    timers.arm(target({ tag: 'b' }))
    timers.arm(target({ tag: 'a', fireAt: NOW + 5 }))
    const p = timers.pending()
    expect(p.map((x) => x.target.tag)).toEqual(['b', 'a'])
  })

  it('prunes fired handles (no leak across long sessions)', () => {
    timers.arm(target())
    vi.advanceTimersByTime(1000)
    timers.arm(target({ tag: 'stalled', fireAt: NOW + 6000 }))
    expect(timers.pending()).toHaveLength(1)
    expect(timers.pending()[0].target.tag).toBe('stalled')
  })
})

// ── diagnostics ─────────────────────────────────────────────────────────────
// The sink is injected rather than imported because this module runs in both
// the page and the service worker, which have different storage available.
describe('the optional trace hook', () => {
  function tracing() {
    const seen: Array<{ ev: string; d?: Record<string, unknown> }> = []
    const fired: string[] = []
    const timers = createNotifyTimers({
      fire: (t) => fired.push(t.tag),
      trace: (ev, d) => seen.push({ ev, d }),
    })
    return { seen, fired, timers }
  }

  it('records arm, fire and the drift between due and actual', () => {
    vi.useFakeTimers({ now: 1_000 })
    const { seen, timers } = tracing()
    timers.arm({ fireAt: 3_000, title: 't', body: 'b', tag: 'rest-timer' })
    expect(seen[0].ev).toBe('notify.arm')
    expect(seen[0].d).toMatchObject({ tag: 'rest-timer', fireAt: 3_000, delay: 2_000 })

    vi.advanceTimersByTime(2_000)
    const fire = seen.find(s => s.ev === 'notify.fire')
    expect(fire?.d).toMatchObject({ tag: 'rest-timer', fireAt: 3_000, drift: 0 })
    vi.useRealTimers()
  })

  it('reports a late fire as drift rather than as an ordinary one', () => {
    vi.useFakeTimers({ now: 1_000 })
    const { seen, timers } = tracing()
    // Past-due by a minute: the arming path fires it on the next tick, and
    // without the drift figure that is indistinguishable from an on-time bell.
    timers.arm({ fireAt: 1_000 - 60_000, title: 't', body: 'b', tag: 'rest-timer' })
    vi.advanceTimersByTime(0)
    const fire = seen.find(s => s.ev === 'notify.fire')
    expect(fire?.d?.drift).toBe(60_000)
    vi.useRealTimers()
  })

  it('records a cancel, and records nothing twice for one handle', () => {
    vi.useFakeTimers({ now: 1_000 })
    const { seen, timers } = tracing()
    timers.arm({ fireAt: 5_000, title: 't', body: 'b', tag: 'rest-timer' })
    timers.cancelTag('rest-timer')
    timers.cancelTag('rest-timer')
    expect(seen.filter(s => s.ev === 'notify.cancel')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('works with no hook supplied at all', () => {
    vi.useFakeTimers({ now: 1_000 })
    const fired: string[] = []
    const timers = createNotifyTimers({ fire: (t) => fired.push(t.tag) })
    timers.arm({ fireAt: 2_000, title: 't', body: 'b', tag: 'x' })
    vi.advanceTimersByTime(1_000)
    expect(fired).toEqual(['x'])
    vi.useRealTimers()
  })
})
