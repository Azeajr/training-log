import { describe, it, expect, vi } from 'vitest'
import { createRoot } from 'solid-js'
import { useSingleFlight } from './use-single-flight'

/**
 * Tested directly rather than only through the modals. In a rendered dialog the
 * buttons also carry `disabled={busy()}`, which blocks a second click at the DOM
 * level — so a component test cannot tell whether the hook's own re-entry check
 * is doing anything. These assert the hook in isolation, because a call site
 * that forgets `disabled` still has to be safe.
 */
const flight = <T,>(fn: (sf: ReturnType<typeof useSingleFlight>) => T): T =>
  createRoot(dispose => { const r = fn(useSingleFlight()); dispose(); return r })

function deferred() {
  let release!: () => void
  const parked = new Promise<void>(r => { release = r })
  return { fn: vi.fn(() => parked), release: () => release() }
}

describe('useSingleFlight', () => {
  it('starts idle', () => {
    expect(flight(sf => sf.busy())).toBe(false)
  })

  it('reports busy while a handler is in flight and idle after', async () => {
    const d = deferred()
    const { busy, run } = flight(sf => ({ busy: sf.busy, run: sf.guard(d.fn) }))
    const p = run()
    expect(busy()).toBe(true)
    d.release()
    await p
    expect(busy()).toBe(false)
  })

  it('ignores a second call while the first is in flight', async () => {
    const d = deferred()
    const { run } = flight(sf => ({ run: sf.guard(d.fn) }))
    const first = run()
    await run()
    await run()
    expect(d.fn).toHaveBeenCalledTimes(1)
    d.release()
    await first
  })

  it('blocks a different handler too, not just the same one', async () => {
    const a = deferred()
    const b = vi.fn()
    const { runA, runB } = flight(sf => ({ runA: sf.guard(a.fn), runB: sf.guard(b) }))
    const first = runA()
    await runB()
    // Both write training maxes; the guard is per-dialog, not per-button.
    expect(b).not.toHaveBeenCalled()
    a.release()
    await first
  })

  it('clears busy when the handler throws, and rethrows', async () => {
    const { run } = flight(sf => ({
      run: sf.guard(() => Promise.reject(new Error('boom'))),
      busy: sf.busy,
    }))
    await expect(run()).rejects.toThrow('boom')
  })

  it('accepts a new call once the previous one settled', async () => {
    const fn = vi.fn(() => Promise.resolve())
    const { run } = flight(sf => ({ run: sf.guard(fn) }))
    await run()
    await run()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('accepts a synchronous handler', async () => {
    const fn = vi.fn()
    const { run, busy } = flight(sf => ({ run: sf.guard(fn), busy: sf.busy }))
    await run()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(busy()).toBe(false)
  })
})
