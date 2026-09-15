import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import CycleCompleteModal from './CycleCompleteModal'
import type { CycleCompleteData } from '../../lib/cycle'

const DATA: CycleCompleteData = {
  newTms: [{ liftId: 1, liftName: 'Bench', oldWeight: 200, weight: 205 }],
  doublingCandidates: [{ liftId: 1, liftName: 'Bench', progressionIncrement: 5 }],
}

const noop = () => {}

/** A callback that stays in flight until released. */
function deferred() {
  let release!: () => void
  const parked = new Promise<void>((r) => { release = r })
  const fn = vi.fn(() => parked)
  return { fn, release: () => release() }
}

describe('CycleCompleteModal', () => {
  // ── F47 ───────────────────────────────────────────────────────────────────
  it('does not land focus on the training-max write button', () => {
    render(() => (
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeload={noop} onDoubleIncrement={noop} />
    ))
    // The first focusable is "+10 LBS", which writes a TM. Focus on open must
    // not arm it under the next Enter keypress.
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '+10 LBS' }))
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  // ── F34 ───────────────────────────────────────────────────────────────────
  it('fires the doubling callback once for three taps', async () => {
    const d = deferred()
    render(() => (
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeload={noop} onDoubleIncrement={d.fn} />
    ))
    const btn = screen.getByRole('button', { name: '+10 LBS' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    expect(d.fn).toHaveBeenCalledTimes(1)
    d.release()
  })

  it('fires the deload callback once for three taps', async () => {
    const d = deferred()
    render(() => (
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeload={d.fn} onDoubleIncrement={noop} />
    ))
    const btn = screen.getByRole('button', { name: /CUT ALL TMS/ })
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    expect(d.fn).toHaveBeenCalledTimes(1)
    d.release()
  })

  it('disables every control while one handler is in flight', async () => {
    const d = deferred()
    render(() => (
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeload={noop} onDoubleIncrement={d.fn} />
    ))
    fireEvent.click(screen.getByRole('button', { name: '+10 LBS' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+10 LBS' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeDisabled()
      expect(screen.getByRole('button', { name: /CUT ALL TMS/ })).toBeDisabled()
    })
    d.release()
  })

  // ── F33 ───────────────────────────────────────────────────────────────────
  it('ignores Escape while a handler is in flight', async () => {
    const d = deferred()
    const onDismiss = vi.fn()
    render(() => (
      <CycleCompleteModal
        data={DATA} onDismiss={onDismiss} onDeload={noop} onDoubleIncrement={d.fn}
      />
    ))
    fireEvent.click(screen.getByRole('button', { name: '+10 LBS' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '+10 LBS' })).toBeDisabled())

    // One tap plus one keypress used to reach the duplicate-cycle state: the
    // accept was still awaiting and Escape ran the dismiss path alongside it.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onDismiss).not.toHaveBeenCalled()
    d.release()
  })

  it('accepts Escape again once the handler settles', async () => {
    const d = deferred()
    const onDismiss = vi.fn()
    render(() => (
      <CycleCompleteModal
        data={DATA} onDismiss={onDismiss} onDeload={noop} onDoubleIncrement={d.fn}
      />
    ))
    fireEvent.click(screen.getByRole('button', { name: '+10 LBS' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '+10 LBS' })).toBeDisabled())
    d.release()
    await waitFor(() => expect(screen.getByRole('button', { name: '+10 LBS' })).not.toBeDisabled())

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
