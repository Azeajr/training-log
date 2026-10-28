import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  trace, readTrace, clearTrace, reloadTrace, traceStats,
  isTraceEnabled, setTraceEnabled,
} from './trace'

const EVENTS_KEY = 'notif-trace'
const ENABLED_KEY = 'notif-trace-on'

function enable() {
  localStorage.setItem(ENABLED_KEY, '1')
  reloadTrace()
}

beforeEach(() => {
  localStorage.clear()
  reloadTrace()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('trace — the off switch', () => {
  it('records nothing while disabled', () => {
    trace('rest.tick', { elapsed: 3 })
    expect(readTrace()).toHaveLength(0)
    expect(localStorage.getItem(EVENTS_KEY)).toBeNull()
  })

  it('is off unless the flag says otherwise', () => {
    expect(isTraceEnabled()).toBe(false)
    localStorage.setItem(ENABLED_KEY, 'yes please')
    reloadTrace()
    expect(isTraceEnabled()).toBe(false)
  })

  it('brackets the log with markers on both edges', () => {
    setTraceEnabled(true)
    trace('rest.tick')
    setTraceEnabled(false)
    // The closing marker must be recorded even though tracing ends up off:
    // "it just stops here" is otherwise ambiguous between the user switching
    // it off and the app dying.
    expect(readTrace().map(e => e.ev)).toEqual(['trace.on', 'rest.tick', 'trace.off'])
    trace('rest.tick')
    expect(readTrace()).toHaveLength(3)
  })
})

describe('trace — records', () => {
  beforeEach(enable)

  it('stamps wall clock, monotonic time, source and payload', () => {
    trace('audio.tone', { freq: 880, state: 'running' }, 'page')
    const [e] = readTrace()
    expect(e.ev).toBe('audio.tone')
    expect(e.src).toBe('page')
    expect(e.d).toEqual({ freq: 880, state: 'running' })
    expect(typeof e.t).toBe('number')
    expect(typeof e.p).toBe('number')
    expect(e.seq).toBe(0)
  })

  it('carries the source through for relayed worker and SW events', () => {
    trace('worker.tick', { elapsed: 1 }, 'worker')
    trace('sw.activate', undefined, 'sw')
    expect(readTrace().map(e => e.src)).toEqual(['worker', 'sw'])
  })

  it('survives a reload and does not reuse sequence numbers', () => {
    trace('a'); trace('b')
    reloadTrace()
    trace('c')
    const seqs = readTrace().map(e => e.seq)
    expect(seqs).toEqual([0, 1, 2])
    expect(new Set(seqs).size).toBe(3)
  })

  it('drops the oldest records past the cap', () => {
    for (let i = 0; i < 1300; i++) trace('rest.tick', { i })
    const all = readTrace()
    expect(all).toHaveLength(1200)
    expect(all[0].d).toEqual({ i: 100 })
    expect(all[all.length - 1].d).toEqual({ i: 1299 })
  })

  it('bounds actual bytes for large layout records before persisting', () => {
    for (let i = 0; i < 30; i++) trace('layout.capture', { i, geometry: '界'.repeat(4000) })
    const raw = localStorage.getItem(EVENTS_KEY)!
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(192 * 1024)
    expect(readTrace().at(-1)?.d?.i).toBe(29)
    expect(readTrace().length).toBeLessThan(30)
  })

  it('keeps the newest captures when routine samples fill the budget', () => {
    enable()
    trace('layout.capture', { n: 'old', blob: 'x'.repeat(60000) })
    trace('layout.capture', { n: 'new', blob: 'x'.repeat(60000) })
    for (let i = 0; i < 200; i++) trace('layout.sample', { i, blob: 'y'.repeat(2000) })
    const all = readTrace()
    expect(all.filter(e => e.ev === 'layout.capture').map(e => e.d?.n)).toEqual(['old', 'new'])
    expect(new TextEncoder().encode(localStorage.getItem(EVENTS_KEY)!).length).toBeLessThanOrEqual(192 * 1024)
    expect(all.at(-1)?.d?.i).toBe(199)
  })

  it('evicts only what is needed, not a fixed quarter of the history', () => {
    enable()
    for (let i = 0; i < 100; i++) trace('t', { i })
    trace('big', { blob: 'z'.repeat(90 * 1024) })
    trace('big', { blob: 'z'.repeat(90 * 1024) })
    const all = readTrace()
    expect(all.filter(e => e.ev === 't').length).toBeGreaterThan(0)
  })

  it('replaces a record larger than the budget instead of emptying the buffer', () => {
    enable()
    trace('before')
    trace('layout.capture', { blob: 'q'.repeat(300 * 1024) })
    const all = readTrace()
    expect(all.map(e => e.ev)).toEqual(['before', 'layout.capture'])
    expect(all[1].d).toMatchObject({ oversized: true })
  })

  it('spares the newest captures when a quota failure drops the oldest half', () => {
    enable()
    trace('layout.capture', { n: 1 })
    for (let i = 0; i < 10; i++) trace('t', { i })
    const real = Storage.prototype.setItem
    let failed = false
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (!failed && k === 'notif-trace') { failed = true; throw new Error('quota') }
      return real.call(this, k, v)
    })
    trace('t', { i: 11 })
    expect(readTrace().some(e => e.ev === 'layout.capture')).toBe(true)
  })

  it('gives no protection to captures from before the latest trace.on', () => {
    enable()
    trace('layout.capture', { old: true })
    setTraceEnabled(false)
    setTraceEnabled(true)
    for (let i = 0; i < 1250; i++) trace('t', { i })
    expect(readTrace().some(e => e.ev === 'layout.capture')).toBe(false)
  })

  it('does not let an unserialisable payload throw out of an instrumentation call', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => trace('audio.tone', cyclic)).not.toThrow()
    expect(readTrace()[0].d).toEqual({ unserialisable: true })
  })

  it('reports the span and count', () => {
    trace('a'); trace('b')
    const s = traceStats()
    expect(s.count).toBe(2)
    expect(s.first).not.toBeNull()
    expect(s.last).not.toBeNull()
    expect(s.degraded).toBe(false)
  })

  it('clears both halves', () => {
    trace('a')
    clearTrace()
    expect(readTrace()).toHaveLength(0)
    expect(localStorage.getItem(EVENTS_KEY)).toBeNull()
  })
})

describe('trace — hostile storage', () => {
  it('starts clean on corrupt JSON', () => {
    localStorage.setItem(ENABLED_KEY, '1')
    localStorage.setItem(EVENTS_KEY, '{not json')
    expect(() => reloadTrace()).not.toThrow()
    expect(readTrace()).toHaveLength(0)
  })

  it('starts clean on a version it does not know', () => {
    localStorage.setItem(ENABLED_KEY, '1')
    localStorage.setItem(EVENTS_KEY, JSON.stringify({ v: 99, e: [{ seq: 1 }] }))
    reloadTrace()
    expect(readTrace()).toHaveLength(0)
  })

  it('drops records that are not events, keeping the ones that are', () => {
    localStorage.setItem(ENABLED_KEY, '1')
    localStorage.setItem(EVENTS_KEY, JSON.stringify({
      v: 1,
      e: [
        { seq: 0, t: 1, p: 1, src: 'page', ev: 'good' },
        { seq: 1, t: 2, p: 2, src: 'martian', ev: 'bad source' },
        null,
        'nope',
        { seq: 3, t: 4, p: 4, src: 'sw', ev: 'also good' },
      ],
    }))
    reloadTrace()
    expect(readTrace().map(e => e.ev)).toEqual(['good', 'also good'])
  })

  it('survives a localStorage that throws on read', () => {
    // The flag IS set, so without the catch this would come back enabled —
    // which is what makes `false` here evidence rather than the default.
    localStorage.setItem(ENABLED_KEY, '1')
    reloadTrace()
    expect(isTraceEnabled()).toBe(true)
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('denied')
    })
    expect(() => reloadTrace()).not.toThrow()
    expect(isTraceEnabled()).toBe(false)
    spy.mockRestore()
  })

  it('halves the buffer and retries once when a write is refused', () => {
    enable()
    for (let i = 0; i < 10; i++) trace('rest.tick', { i })
    const realSetItem = window.localStorage.setItem.bind(window.localStorage)
    let refuse = true
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((k: string, v: string) => {
      if (refuse) { refuse = false; throw new DOMException('QuotaExceededError') }
      realSetItem(k, v)
    })
    trace('rest.tick', { i: 10 })
    // The recent half is kept; the oldest records are what fall off.
    const all = readTrace()
    expect(all.length).toBeLessThan(11)
    expect(all[all.length - 1].d).toEqual({ i: 10 })
    expect(traceStats().degraded).toBe(false)
  })

  it('keeps recording in memory once durability is lost, and says so', () => {
    enable()
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    trace('rest.tick', { i: 0 })
    expect(traceStats().degraded).toBe(true)
    trace('rest.tick', { i: 1 })
    // Still collecting: an export from the live page is the point, and giving
    // up entirely would lose the very window the user is trying to capture.
    expect(readTrace().map(e => e.d)).toEqual([{ i: 0 }, { i: 1 }])
  })
})
