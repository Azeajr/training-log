import { describe, it, expect, beforeEach, vi } from 'vitest'
import { buildTraceExport, formatTraceExport } from './trace-export'
import { trace, reloadTrace, clearTrace } from './trace'

vi.mock('./trace-sw-store', () => ({
  swTraceRead: vi.fn(async () => [
    { seq: 0, t: 150, p: 0, src: 'sw' as const, ev: 'sw.boot' },
    { seq: 1, t: 350, p: 0, src: 'sw' as const, ev: 'sw.shown', d: { tag: 'rest-timer' } },
  ]),
}))

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('notif-trace-on', '1')
  reloadTrace()
})

describe('buildTraceExport', () => {
  it('interleaves the page and service-worker halves by wall clock', async () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100)   // page event 1
      .mockReturnValueOnce(200)   // page event 2
      .mockReturnValue(999)
    trace('rest.start')
    trace('notify.arm')
    const x = await buildTraceExport()
    expect(x.events.map(e => e.ev)).toEqual(['rest.start', 'sw.boot', 'notify.arm', 'sw.shown'])
    expect(x.stats).toMatchObject({ page: 2, sw: 2, first: 100, last: 350 })
    vi.restoreAllMocks()
  })

  it('records the environment that decides which rules even apply', async () => {
    const x = await buildTraceExport()
    // iOS permits notifications only in an installed PWA, so an export that
    // does not say which mode it came from cannot be read at all.
    expect(x.env).toHaveProperty('standalone')
    expect(x.env).toHaveProperty('iosStandalone')
    expect(x.env).toHaveProperty('permission')
    expect(x.env).toHaveProperty('swControlled')
    expect(x.env).toHaveProperty('ua')
  })

  it('takes extra context from the caller', async () => {
    const x = await buildTraceExport({ thresholds: { firstBell: 90 } })
    expect(x.env.thresholds).toEqual({ firstBell: 90 })
  })

  it('reports "unavailable" instead of throwing when a probe is blocked', async () => {
    const spy = vi.spyOn(navigator, 'userAgent', 'get').mockImplementation(() => {
      throw new DOMException('blocked')
    })
    const x = await buildTraceExport()
    expect(x.env.ua).toBe('unavailable')
    spy.mockRestore()
  })

  it('exports an empty but well-formed document when nothing was recorded', async () => {
    clearTrace()
    const x = await buildTraceExport()
    expect(x.v).toBe(1)
    expect(x.stats.page).toBe(0)
  })
})

describe('formatTraceExport', () => {
  it('puts one event per line so a long trace stays readable', async () => {
    trace('a'); trace('b')
    const text = formatTraceExport(await buildTraceExport())
    const [, body] = text.split(/--- events \(\d+\) ---\n/)
    const lines = body.trim().split('\n')
    expect(lines).toHaveLength(4)          // 2 page + 2 mocked SW
    for (const l of lines) expect(() => JSON.parse(l) as unknown).not.toThrow()
  })

  it('leads with a header a human can read first', async () => {
    const text = formatTraceExport(await buildTraceExport())
    expect(text.startsWith('{')).toBe(true)
    expect(text).toContain('"env"')
    expect(text).toContain('--- events')
  })
})
