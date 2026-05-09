import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import Stepper from './Stepper'

const noop = () => {}

describe('Stepper', () => {
  it('renders formatted integer value', () => {
    render(() => <Stepper value={10} onChange={noop} step={1} min={0} />)
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('renders decimal value with one decimal place', () => {
    render(() => <Stepper value={2.5} onChange={noop} step={2.5} min={0} />)
    expect(screen.getByText('2.5')).toBeInTheDocument()
  })

  it('calls onChange with incremented value on + click', () => {
    const calls: number[] = []
    render(() => <Stepper value={10} onChange={v => calls.push(v)} step={5} min={0} />)
    fireEvent.click(screen.getByText('+'))
    expect(calls).toEqual([15])
  })

  it('calls onChange with decremented value on − click', () => {
    const calls: number[] = []
    render(() => <Stepper value={10} onChange={v => calls.push(v)} step={5} min={0} />)
    fireEvent.click(screen.getByText('−'))
    expect(calls).toEqual([5])
  })

  it('disables − button at min', () => {
    render(() => <Stepper value={0} onChange={noop} step={1} min={0} />)
    expect(screen.getByText('−').closest('button')).toBeDisabled()
  })

  it('disables + button at max', () => {
    render(() => <Stepper value={10} onChange={noop} step={1} min={0} max={10} />)
    expect(screen.getByText('+').closest('button')).toBeDisabled()
  })

  it('does not disable − above min', () => {
    render(() => <Stepper value={5} onChange={noop} step={1} min={0} />)
    expect(screen.getByText('−').closest('button')).not.toBeDisabled()
  })

  it('respects decimal steps without floating point drift', () => {
    const calls: number[] = []
    render(() => <Stepper value={2.5} onChange={v => calls.push(v)} step={2.5} min={0} />)
    fireEvent.click(screen.getByText('+'))
    expect(calls[0]).toBe(5)
  })

  it('shows input when value button is clicked', async () => {
    render(() => <Stepper value={10} onChange={noop} step={1} min={0} />)
    fireEvent.click(screen.getByText('10'))
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('commits input value on Enter', async () => {
    const calls: number[] = []
    render(() => <Stepper value={10} onChange={v => calls.push(v)} step={1} min={0} />)
    fireEvent.click(screen.getByText('10'))
    const input = screen.getByRole('spinbutton')
    fireEvent.input(input, { target: { value: '25' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(calls[0]).toBe(25)
  })

  it('commits input value on blur', async () => {
    const calls: number[] = []
    render(() => <Stepper value={10} onChange={v => calls.push(v)} step={1} min={0} />)
    fireEvent.click(screen.getByText('10'))
    const input = screen.getByRole('spinbutton')
    fireEvent.input(input, { target: { value: '30' } })
    fireEvent.blur(input)
    expect(calls[0]).toBe(30)
  })

  it('clamps committed value to min', async () => {
    const calls: number[] = []
    render(() => <Stepper value={5} onChange={v => calls.push(v)} step={1} min={0} />)
    fireEvent.click(screen.getByText('5'))
    const input = screen.getByRole('spinbutton')
    fireEvent.input(input, { target: { value: '-10' } })
    fireEvent.blur(input)
    expect(calls[0]).toBe(0)
  })

  it('clamps committed value to max', async () => {
    const calls: number[] = []
    render(() => <Stepper value={5} onChange={v => calls.push(v)} step={1} min={0} max={10} />)
    fireEvent.click(screen.getByText('5'))
    const input = screen.getByRole('spinbutton')
    fireEvent.input(input, { target: { value: '999' } })
    fireEvent.blur(input)
    expect(calls[0]).toBe(10)
  })

  describe('long-press', () => {
    afterEach(() => vi.useRealTimers())

    it('fires onChange repeatedly while holding + button', () => {
      vi.useFakeTimers()
      const calls: number[] = []
      render(() => <Stepper value={10} onChange={v => calls.push(v)} step={5} min={0} />)
      const plusBtn = screen.getByText('+').closest('button')!
      fireEvent.pointerDown(plusBtn)
      vi.advanceTimersByTime(400) // triggers long-press start
      vi.advanceTimersByTime(160) // 2 interval ticks at 80ms each
      fireEvent.pointerUp(plusBtn)
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    it('fires onChange repeatedly while holding − button', () => {
      vi.useFakeTimers()
      const calls: number[] = []
      render(() => <Stepper value={100} onChange={v => calls.push(v)} step={5} min={0} />)
      const minusBtn = screen.getByText('−').closest('button')!
      fireEvent.pointerDown(minusBtn)
      vi.advanceTimersByTime(400)
      vi.advanceTimersByTime(160)
      fireEvent.pointerUp(minusBtn)
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    it('stops firing after pointerUp', () => {
      vi.useFakeTimers()
      const calls: number[] = []
      render(() => <Stepper value={10} onChange={v => calls.push(v)} step={5} min={0} />)
      const plusBtn = screen.getByText('+').closest('button')!
      fireEvent.pointerDown(plusBtn)
      vi.advanceTimersByTime(480)
      fireEvent.pointerUp(plusBtn)
      const countAfterUp = calls.length
      vi.advanceTimersByTime(200) // interval should be cleared
      expect(calls.length).toBe(countAfterUp)
    })

    it('stops firing after pointerLeave', () => {
      vi.useFakeTimers()
      const calls: number[] = []
      render(() => <Stepper value={10} onChange={v => calls.push(v)} step={5} min={0} />)
      const plusBtn = screen.getByText('+').closest('button')!
      fireEvent.pointerDown(plusBtn)
      vi.advanceTimersByTime(480)
      fireEvent.pointerLeave(plusBtn)
      const countAfterLeave = calls.length
      vi.advanceTimersByTime(200)
      expect(calls.length).toBe(countAfterLeave)
    })

    it('suppresses the click onChange that fires natively after a long-press', () => {
      vi.useFakeTimers()
      const calls: number[] = []
      render(() => <Stepper value={10} onChange={v => calls.push(v)} step={5} min={0} />)
      const plusBtn = screen.getByText('+').closest('button')!
      fireEvent.pointerDown(plusBtn)
      vi.advanceTimersByTime(480) // long-press active + 1 tick
      fireEvent.pointerUp(plusBtn)
      const countAfterUp = calls.length
      fireEvent.click(plusBtn) // native click fires after pointerUp — should be suppressed
      expect(calls.length).toBe(countAfterUp)
    })

    it('does not activate long-press before threshold', () => {
      vi.useFakeTimers()
      const calls: number[] = []
      render(() => <Stepper value={10} onChange={v => calls.push(v)} step={5} min={0} />)
      const plusBtn = screen.getByText('+').closest('button')!
      fireEvent.pointerDown(plusBtn)
      vi.advanceTimersByTime(300) // below 400ms threshold
      fireEvent.pointerUp(plusBtn)
      expect(calls.length).toBe(0) // only click would fire, not long-press
    })
  })
})
