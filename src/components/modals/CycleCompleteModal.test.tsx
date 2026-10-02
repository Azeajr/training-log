import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import CycleCompleteModal from './CycleCompleteModal'
import type { CycleCompleteData } from '../../lib/cycle'
import { db } from '../../db/index'
import { getCurrentTm } from '../../lib/training-max'

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
  beforeEach(async () => {
    await Promise.all([db.lifts.clear(), db.trainingMaxes.clear(), db.cycles.clear()])
    await db.lifts.add({ id: 1, name: 'Bench', order: 0, progressionIncrement: 5, baseWeight: 45, liftType: 'upper' })
    await db.trainingMaxes.add({ liftId: 1, weight: 205, setAt: new Date('2026-01-01') })
  })

  // ── F47 ───────────────────────────────────────────────────────────────────
  it('does not land focus on the training-max write button', () => {
    render(() => (
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeloadComplete={noop} onDoubleIncrement={noop} />
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
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeloadComplete={noop} onDoubleIncrement={d.fn} />
    ))
    const btn = screen.getByRole('button', { name: '+10 LBS' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    expect(d.fn).toHaveBeenCalledTimes(1)
    d.release()
  })

  it('previews and confirms the selected percentage before completing', async () => {
    const onDeload = vi.fn()
    render(() => (
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeloadComplete={onDeload} onDoubleIncrement={noop} />
    ))
    fireEvent.click(screen.getByRole('button', { name: 'DELOAD ALL' }))
    expect(onDeload).not.toHaveBeenCalled()
    expect(await getCurrentTm(db, 1)).toBe(205)
    fireEvent.click(screen.getByRole('button', { name: 'Increase deload percent' }))
    await screen.findByText('Bench: 205 → 175 lb')
    fireEvent.click(screen.getByRole('button', { name: 'CONFIRM DELOAD −15%' }))
    await waitFor(() => expect(onDeload).toHaveBeenCalledTimes(1))
    expect(await getCurrentTm(db, 1)).toBe(175)
  })

  it('fires the deload callback once for three taps', async () => {
    const d = deferred()
    render(() => (
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeloadComplete={d.fn} onDoubleIncrement={noop} />
    ))
    fireEvent.click(screen.getByRole('button', { name: 'DELOAD ALL' }))
    await screen.findByText('Bench: 205 → 185 lb')
    const btn = screen.getByRole('button', { name: 'CONFIRM DELOAD −10%' })
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    await waitFor(() => expect(btn).toBeDisabled())
    await waitFor(() => expect(d.fn).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'DELOAD ALL LIFTS' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CANCEL' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Increase deload percent' })).toBeDisabled()
    expect(await db.trainingMaxes.count()).toBe(2)
    d.release()
  })

  it('cancel and Escape return to cycle completion without cutting, and reopening starts at 10%', async () => {
    const onDismiss = vi.fn()
    const onDeload = vi.fn()
    render(() => <CycleCompleteModal data={DATA} onDismiss={onDismiss} onDeloadComplete={onDeload} onDoubleIncrement={noop} />)
    fireEvent.click(screen.getByRole('button', { name: 'DELOAD ALL' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase deload percent' }))
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))
    expect(screen.getByRole('dialog', { name: 'CYCLE COMPLETE' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'DELOAD ALL' }))
    await screen.findByText('Bench: 205 → 185 lb')
    expect(screen.getByRole('button', { name: 'CONFIRM DELOAD −10%' })).toBeEnabled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'CYCLE COMPLETE' })).toBeInTheDocument()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(onDeload).not.toHaveBeenCalled()
    expect(await getCurrentTm(db, 1)).toBe(205)
  })

  it('disables every control while one handler is in flight', async () => {
    const d = deferred()
    render(() => (
      <CycleCompleteModal data={DATA} onDismiss={noop} onDeloadComplete={noop} onDoubleIncrement={d.fn} />
    ))
    fireEvent.click(screen.getByRole('button', { name: '+10 LBS' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+10 LBS' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'CONTINUE' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'DELOAD ALL' })).toBeDisabled()
    })
    d.release()
  })

  // ── F33 ───────────────────────────────────────────────────────────────────
  it('ignores Escape while a handler is in flight', async () => {
    const d = deferred()
    const onDismiss = vi.fn()
    render(() => (
      <CycleCompleteModal
        data={DATA} onDismiss={onDismiss} onDeloadComplete={noop} onDoubleIncrement={d.fn}
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
        data={DATA} onDismiss={onDismiss} onDeloadComplete={noop} onDoubleIncrement={d.fn}
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
