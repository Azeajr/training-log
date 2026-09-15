import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import TmRecommendationModal from './TmRecommendationModal'

// getAllByRole('button') order: [0]=−  [1]=+  [2]=UPDATE TM  [3]=KEEP CURRENT

const baseProps = {
  liftName: 'Bench Press',
  currentTm: 200,
  suggestedTm: 230,
  onAccept: () => {},
  onDismiss: () => {},
}

describe('TmRecommendationModal — renders', () => {
  it('shows lift name', () => {
    const { getByText } = render(() => <TmRecommendationModal {...baseProps} />)
    expect(getByText('Bench Press')).toBeInTheDocument()
  })

  it('shows current TM', () => {
    const { getByText } = render(() => <TmRecommendationModal {...baseProps} />)
    expect(getByText('200 lbs')).toBeInTheDocument()
  })

  it('shows suggested TM', () => {
    const { container } = render(() => <TmRecommendationModal {...baseProps} />)
    expect(container.textContent).toContain('230 lbs')
  })

  it('initial adjusted value equals suggestedTm', () => {
    const { getAllByText } = render(() => <TmRecommendationModal {...baseProps} />)
    // "230 lbs" appears once as static "Suggested" label and once as the stepper value
    expect(getAllByText('230 lbs')).toHaveLength(2)
  })
})

describe('TmRecommendationModal — stepper adjustments', () => {
  it('+ increments value by 5', () => {
    const { getByText, getAllByRole } = render(() => <TmRecommendationModal {...baseProps} />)
    fireEvent.click(getAllByRole('button')[1]) // +
    expect(getByText('235 lbs')).toBeInTheDocument()
  })

  it('− decrements value by 5', () => {
    const { getByText, getAllByRole } = render(() => <TmRecommendationModal {...baseProps} />)
    fireEvent.click(getAllByRole('button')[0]) // −
    expect(getByText('225 lbs')).toBeInTheDocument()
  })

  it('− clamps at 45 lbs', () => {
    const { getAllByRole, container } = render(() => (
      <TmRecommendationModal {...baseProps} suggestedTm={45} currentTm={50} />
    ))
    fireEvent.click(getAllByRole('button')[0]) // −
    // value stays at 45 — Math.max(45, 45-5)=45
    expect(container.textContent).toContain('45 lbs')
    expect(container.textContent).not.toContain('40 lbs')
  })

  it('multiple + clicks accumulate', () => {
    const { getByText, getAllByRole } = render(() => <TmRecommendationModal {...baseProps} />)
    fireEvent.click(getAllByRole('button')[1])
    fireEvent.click(getAllByRole('button')[1])
    expect(getByText('240 lbs')).toBeInTheDocument()
  })
})

describe('TmRecommendationModal — actions', () => {
  it('UPDATE TM calls onAccept with adjusted value', () => {
    const onAccept = vi.fn()
    const { getAllByRole, getByText } = render(() => (
      <TmRecommendationModal {...baseProps} onAccept={onAccept} />
    ))
    fireEvent.click(getAllByRole('button')[1]) // + → 235
    fireEvent.click(getByText('UPDATE TM'))
    expect(onAccept).toHaveBeenCalledWith(235)
  })

  it('UPDATE TM calls onAccept with suggestedTm when unchanged', () => {
    const onAccept = vi.fn()
    const { getByText } = render(() => (
      <TmRecommendationModal {...baseProps} onAccept={onAccept} />
    ))
    fireEvent.click(getByText('UPDATE TM'))
    expect(onAccept).toHaveBeenCalledWith(230)
  })

  it('KEEP CURRENT calls onDismiss', () => {
    const onDismiss = vi.fn()
    const { getByText } = render(() => (
      <TmRecommendationModal {...baseProps} onDismiss={onDismiss} />
    ))
    fireEvent.click(getByText('KEEP CURRENT'))
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('KEEP CURRENT does not call onAccept', () => {
    const onAccept = vi.fn()
    const { getByText } = render(() => (
      <TmRecommendationModal {...baseProps} onAccept={onAccept} />
    ))
    fireEvent.click(getByText('KEEP CURRENT'))
    expect(onAccept).not.toHaveBeenCalled()
  })
})

// ── F33 ─────────────────────────────────────────────────────────────────────
// Probe P3: tap UPDATE TM, then press Escape while onAccept is still awaiting.
// Modal owns Escape, stops its propagation and called onClose unconditionally,
// so both callbacks fired and the dismiss path entered proceedAfterSession
// alongside the accept's own still-pending call — one tap and one keypress away
// from the duplicate-cycle state.
describe('TmRecommendationModal — single flight', () => {
  function deferred() {
    let release!: () => void
    const parked = new Promise<void>(r => { release = r })
    return { fn: vi.fn(() => parked), release: () => release() }
  }

  it('does not dismiss on Escape while accept is in flight', async () => {
    const accept = deferred()
    const onDismiss = vi.fn()
    const { getAllByRole, getByRole } = render(() => (
      <TmRecommendationModal {...baseProps} onAccept={accept.fn} onDismiss={onDismiss} />
    ))
    fireEvent.click(getAllByRole('button')[2]) // UPDATE TM
    await Promise.resolve()

    fireEvent.keyDown(getByRole('dialog'), { key: 'Escape' })
    expect(onDismiss).not.toHaveBeenCalled()
    expect(accept.fn).toHaveBeenCalledTimes(1)
    accept.release()
  })

  it('accepts only once for repeated taps', async () => {
    const accept = deferred()
    const { getAllByRole } = render(() => (
      <TmRecommendationModal {...baseProps} onAccept={accept.fn} />
    ))
    const btn = getAllByRole('button')[2]
    fireEvent.click(btn)
    fireEvent.click(btn)
    fireEvent.click(btn)
    await Promise.resolve()
    expect(accept.fn).toHaveBeenCalledTimes(1)
    accept.release()
  })
})
