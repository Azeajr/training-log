// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createAsyncRead } from './async-read'

const deferred = () => {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** createSignal needs an owner; dispose immediately, the signals outlive it. */
const read = () => createRoot(() => createAsyncRead())

describe('createAsyncRead — superseding', () => {
  it('tells an overtaken read that it is no longer current', async () => {
    const r = read()
    const first = deferred()
    let firstWasCurrent: boolean | null = null

    const a = r.run(async (isCurrent) => { await first.promise; firstWasCurrent = isCurrent() })
    const b = r.run(async () => {})
    await b

    first.resolve()
    await a
    expect(firstWasCurrent).toBe(false)
  })

  it('leaves the newer read current', async () => {
    const r = read()
    let secondWasCurrent: boolean | null = null
    await r.run(async () => {})
    await r.run(async (isCurrent) => { secondWasCurrent = isCurrent() })
    expect(secondWasCurrent).toBe(true)
  })

  it('does not clear loading when a superseded read finishes late', async () => {
    // The newer read owns `loading`; clearing it here would flash its result in
    // before it exists.
    const r = read()
    const first = deferred()
    const second = deferred()

    const a = r.run(async () => { await first.promise })
    const b = r.run(async () => { await second.promise })
    first.resolve()
    await a

    expect(r.loading()).toBe(true)
    second.resolve()
    await b
    expect(r.loading()).toBe(false)
  })

  it('ignores a superseded read that rejects', async () => {
    const r = read()
    const first = deferred()
    const a = r.run(async () => { await first.promise })
    await r.run(async () => {})

    first.reject(new Error('stale failure'))
    await a
    expect(r.error()).toBeNull()
  })
})

describe('createAsyncRead — failure', () => {
  it('surfaces the message and stops loading', async () => {
    const r = read()
    await r.run(async () => { throw new Error('disk full') })
    expect(r.error()).toBe('disk full')
    expect(r.loading()).toBe(false)
  })

  it('never leaves loading true after a rejection — the /stats case', async () => {
    const r = read()
    await r.run(async () => { throw new Error('boom') })
    expect(r.loading()).toBe(false)
  })

  it('describes a non-Error rejection rather than reporting nothing', async () => {
    const r = read()
    await r.run(async () => { throw 'a string' })
    expect(r.error()).toBeTruthy()
  })

  it('clears a previous error when a new read starts', async () => {
    const r = read()
    await r.run(async () => { throw new Error('boom') })
    expect(r.error()).toBe('boom')
    await r.run(async () => {})
    expect(r.error()).toBeNull()
  })
})

describe('createAsyncRead — retry', () => {
  it('re-runs the most recent task', async () => {
    const r = read()
    let attempts = 0
    await r.run(async () => {
      attempts++
      if (attempts === 1) throw new Error('transient')
    })
    expect(r.error()).toBe('transient')

    await r.retry()
    expect(attempts).toBe(2)
    expect(r.error()).toBeNull()
    expect(r.loading()).toBe(false)
  })

  it('retries the latest task, not the one that failed earlier', async () => {
    const r = read()
    const ran: string[] = []
    await r.run(async () => { ran.push('first'); throw new Error('x') })
    await r.run(async () => { ran.push('second') })
    await r.retry()
    expect(ran).toEqual(['first', 'second', 'second'])
  })

  it('is a no-op before anything has run', async () => {
    const r = read()
    await expect(r.retry()).resolves.toBeUndefined()
    expect(r.error()).toBeNull()
  })
})

describe('createAsyncRead — loading', () => {
  it('starts false, goes true for the duration, and returns false', async () => {
    const r = read()
    expect(r.loading()).toBe(false)
    const gate = deferred()
    const running = r.run(async () => { await gate.promise })
    expect(r.loading()).toBe(true)
    gate.resolve()
    await running
    expect(r.loading()).toBe(false)
  })
})
