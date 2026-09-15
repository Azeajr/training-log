import { describe, it, expect, vi } from 'vitest'
import { prepareApp } from './startup'

const ok = () => Promise.resolve()

describe('prepareApp', () => {
  it('reports ready and carries the persistence flag through', async () => {
    const r = await prepareApp({
      dbReady: Promise.resolve({ persistent: true }),
      seed: ok,
      loadSettings: ok,
    })
    expect(r).toEqual({ status: 'ready', persistent: true })
  })

  it('runs seed before settings', async () => {
    const order: string[] = []
    await prepareApp({
      dbReady: Promise.resolve({ persistent: true }),
      seed: async () => { order.push('seed') },
      loadSettings: async () => { order.push('settings') },
    })
    expect(order).toEqual(['seed', 'settings'])
  })

  // ── F02 ───────────────────────────────────────────────────────────────────
  it('surfaces a non-persistent database instead of starting silently (F02)', async () => {
    // The worker falls back to in-memory when OPFS is unavailable. Startup used
    // to ignore this and come up looking perfectly healthy.
    const r = await prepareApp({
      dbReady: Promise.resolve({ persistent: false }),
      seed: ok,
      loadSettings: ok,
    })
    expect(r).toEqual({ status: 'ready', persistent: false })
  })

  // ── F04 ───────────────────────────────────────────────────────────────────
  it('reports a failure when the database never becomes ready (F04)', async () => {
    const r = await prepareApp({
      dbReady: Promise.reject(new Error('SQLite worker failed: boom')),
      seed: ok,
      loadSettings: ok,
    })
    expect(r.status).toBe('failed')
    expect(r.status === 'failed' && r.error.message).toMatch(/worker failed/)
  })

  it('reports a failure when seeding rejects (F04)', async () => {
    const r = await prepareApp({
      dbReady: Promise.resolve({ persistent: true }),
      seed: () => Promise.reject(new Error('seed exploded')),
      loadSettings: ok,
    })
    expect(r.status).toBe('failed')
    expect(r.status === 'failed' && r.error.message).toBe('seed exploded')
  })

  it('reports a failure when loading settings rejects (F04)', async () => {
    const r = await prepareApp({
      dbReady: Promise.resolve({ persistent: true }),
      seed: ok,
      loadSettings: () => Promise.reject(new Error('settings exploded')),
    })
    expect(r.status).toBe('failed')
    expect(r.status === 'failed' && r.error.message).toBe('settings exploded')
  })

  it('does not run later steps once one has failed (F04)', async () => {
    const loadSettings = vi.fn(ok)
    await prepareApp({
      dbReady: Promise.resolve({ persistent: true }),
      seed: () => Promise.reject(new Error('seed exploded')),
      loadSettings,
    })
    expect(loadSettings).not.toHaveBeenCalled()
  })

  it('never rejects, so no startup failure can escape as an unhandled rejection (F04)', async () => {
    await expect(
      prepareApp({
        dbReady: Promise.reject(new Error('boom')),
        seed: ok,
        loadSettings: ok,
      }),
    ).resolves.toMatchObject({ status: 'failed' })
  })

  it('wraps a non-Error rejection so callers always get a message (F04)', async () => {
    const r = await prepareApp({
      dbReady: Promise.reject('just a string'),
      seed: ok,
      loadSettings: ok,
    })
    expect(r.status === 'failed' && r.error).toBeInstanceOf(Error)
    expect(r.status === 'failed' && r.error.message).toBe('just a string')
  })
})
