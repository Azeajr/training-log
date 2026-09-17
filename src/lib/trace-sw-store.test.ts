import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  swTrace, swTraceRead, swTraceClear, swTraceIsEnabled, swTraceSetEnabled, swTraceResetCache,
} from './trace-sw-store'

// jsdom has no IndexedDB, which makes this file a test of the degradation path
// rather than of the store: with no IDB every entry point must be a quiet no-op.
// That is the right thing to pin here — a diagnostic that throws inside the
// service worker would break notifications to record that notifications broke.
// The store's real behaviour is exercised against a REAL service worker in
// scripts/verify-notify-hardening.js, where an actual IndexedDB exists.
describe('swTrace with no IndexedDB available', () => {
  afterEach(() => { swTraceResetCache(); vi.restoreAllMocks() })

  it('is undefined in this environment, which is the premise of these cases', () => {
    expect(typeof indexedDB).toBe('undefined')
  })

  it('never throws out of a write', () => {
    expect(() => swTrace('sw.boot', { a: 1 })).not.toThrow()
  })

  it('reads back empty rather than rejecting', async () => {
    await expect(swTraceRead()).resolves.toEqual([])
  })

  it('reports disabled rather than rejecting', async () => {
    await expect(swTraceIsEnabled()).resolves.toBe(false)
  })

  it('accepts a flag write and a clear without settling into a rejection', async () => {
    await expect(swTraceSetEnabled(true)).resolves.toBeUndefined()
    await expect(swTraceClear()).resolves.toBeUndefined()
  })

  it('survives an indexedDB whose open() throws outright', async () => {
    vi.stubGlobal('indexedDB', {
      open() { throw new DOMException('SecurityError') },
    })
    expect(() => swTrace('sw.boot')).not.toThrow()
    await expect(swTraceRead()).resolves.toEqual([])
    vi.unstubAllGlobals()
  })

  it('does not hang when an upgrade is blocked', async () => {
    vi.stubGlobal('indexedDB', {
      open() {
        const req: Record<string, unknown> = { result: null }
        queueMicrotask(() => (req.onblocked as (() => void) | undefined)?.())
        return req
      },
    })
    await expect(swTraceRead()).resolves.toEqual([])
    vi.unstubAllGlobals()
  })
})
