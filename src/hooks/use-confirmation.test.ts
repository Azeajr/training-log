// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createRoot } from 'solid-js'
import { createConfirmation, type ConfirmResult } from './use-confirmation'

const api = () => createRoot(() => createConfirmation())

/** Resolves to the outcome, or to 'UNSETTLED' if the promise never settles. */
const settle = async (p: Promise<unknown>): Promise<unknown> => {
  const marker = Symbol('unsettled')
  const raced = await Promise.race([
    p,
    new Promise(r => setTimeout(() => r(marker), 20)),
  ])
  return raced === marker ? 'UNSETTLED' : raced
}

// ── F48 ─────────────────────────────────────────────────────────────────────
// `confirmWithChoice` stored the new request's `resolve` over the old one with
// no queue and no settlement of what it displaced. A second confirm() while one
// was pending left the first promise permanently unsettled — and every caller
// awaits it, so whatever came after that `await` simply never ran. Settings
// alone has eight call sites; Today and Workout gate abandon, redo, skip and
// exit on one.
describe('a displaced confirmation (F48)', () => {
  it('settles the request it replaces instead of stranding it', async () => {
    const c = api()
    const first = c.confirmWithChoice('first?', {})
    const second = c.confirmWithChoice('second?', {})

    c.respond('confirm')

    expect(await settle(first)).toBe('cancel')
    expect(await settle(second)).toBe('confirm')
  })

  it('leaves the binary helper reading false, which is what callers branch on', async () => {
    const c = api()
    const first = c.confirm('first?')
    void c.confirm('second?')
    c.respond('confirm')
    // 'cancel' maps to false: a displaced confirmation has not been agreed to.
    expect(await settle(first)).toBe(false)
  })

  it('strands nothing across a chain of replacements', async () => {
    const c = api()
    const promises = ['a', 'b', 'c', 'd'].map(m => c.confirmWithChoice(`${m}?`, {}))
    c.respond('secondary')

    const results = await Promise.all(promises.map(settle))
    expect(results).toEqual(['cancel', 'cancel', 'cancel', 'secondary'])
  })

  it('shows the newest request, so the dialog matches the promise still open', () => {
    const c = api()
    void c.confirmWithChoice('first?', {})
    void c.confirmWithChoice('second?', {})
    expect(c.pending()?.message).toBe('second?')
  })
})

describe('respond', () => {
  it('clears the pending request', () => {
    const c = api()
    void c.confirmWithChoice('sure?', {})
    expect(c.pending()).not.toBeNull()
    c.respond('cancel')
    expect(c.pending()).toBeNull()
  })

  it('is a no-op with nothing pending', () => {
    const c = api()
    expect(() => c.respond('confirm')).not.toThrow()
    expect(c.pending()).toBeNull()
  })

  it.each(['confirm', 'secondary', 'cancel'] as const)('passes %s through', async result => {
    const c = api()
    const p = c.confirmWithChoice('sure?', { secondaryLabel: 'THIRD' })
    c.respond(result)
    expect(await settle(p)).toBe(result)
  })
})

describe('confirm — the binary helper', () => {
  it('maps confirm to true and everything else to false', async () => {
    for (const [result, expected] of [['confirm', true], ['cancel', false], ['secondary', false]] as const) {
      const c = api()
      const p = c.confirm('sure?')
      c.respond(result as ConfirmResult)
      expect(await settle(p)).toBe(expected)
    }
  })

  it('carries its options through to the pending request', () => {
    const c = api()
    void c.confirm('sure?', { destructive: true, confirmLabel: 'YES' })
    expect(c.pending()?.opts).toMatchObject({ destructive: true, confirmLabel: 'YES' })
  })

  it('defaults options to an empty object when omitted', () => {
    const c = api()
    void c.confirm('sure?')
    expect(c.pending()?.opts).toEqual({})
  })
})
