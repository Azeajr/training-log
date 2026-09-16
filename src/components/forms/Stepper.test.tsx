import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import Stepper from './Stepper'

describe('Stepper — display', () => {
  it('shows integer value', () => {
    const { getByTestId } = render(() => <Stepper value={10} onChange={() => {}} />)
    expect(getByTestId('stepper-value').textContent).toBe('10')
  })

  it('shows float value to 1 decimal', () => {
    const { getByTestId } = render(() => <Stepper value={2.5} onChange={() => {}} />)
    expect(getByTestId('stepper-value').textContent).toBe('2.5')
  })

  it('uses label in container testid when provided', () => {
    const { getByTestId } = render(() => <Stepper value={1} onChange={() => {}} label="reps" />)
    expect(getByTestId('stepper-reps')).toBeInTheDocument()
  })
})

describe('Stepper — increment / decrement', () => {
  // getAllByRole('button') order: [0]=−  [1]=value  [2]=+
  it('+ calls onChange with value + step', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(() => <Stepper value={10} onChange={onChange} step={5} />)
    fireEvent.click(getAllByRole('button')[2])
    expect(onChange).toHaveBeenCalledWith(15)
  })

  it('− calls onChange with value − step', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(() => <Stepper value={10} onChange={onChange} step={5} />)
    fireEvent.click(getAllByRole('button')[0])
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('default step is 1', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(() => <Stepper value={10} onChange={onChange} />)
    fireEvent.click(getAllByRole('button')[2])
    expect(onChange).toHaveBeenCalledWith(11)
  })

  it('+ clamps at max', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(() => <Stepper value={8} onChange={onChange} step={5} max={10} />)
    fireEvent.click(getAllByRole('button')[2])
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('− clamps at min', () => {
    const onChange = vi.fn()
    const { getAllByRole } = render(() => <Stepper value={3} onChange={onChange} step={5} min={0} />)
    fireEvent.click(getAllByRole('button')[0])
    expect(onChange).toHaveBeenCalledWith(0)
  })
})

describe('Stepper — disabled state', () => {
  it('+ is disabled when value equals max', () => {
    const { getAllByRole } = render(() => <Stepper value={10} onChange={() => {}} max={10} />)
    expect(getAllByRole('button')[2]).toBeDisabled()
  })

  it('− is disabled when value equals min', () => {
    const { getAllByRole } = render(() => <Stepper value={0} onChange={() => {}} min={0} />)
    expect(getAllByRole('button')[0]).toBeDisabled()
  })

  it('both buttons enabled when between min and max', () => {
    const { getAllByRole } = render(() => <Stepper value={5} onChange={() => {}} min={0} max={10} />)
    expect(getAllByRole('button')[0]).not.toBeDisabled()
    expect(getAllByRole('button')[2]).not.toBeDisabled()
  })
})

describe('Stepper — direct-edit mode', () => {
  it('clicking value button shows input', () => {
    const { getByTestId, queryByTestId } = render(() => <Stepper value={10} onChange={() => {}} />)
    expect(queryByTestId('stepper-input')).not.toBeInTheDocument()
    fireEvent.click(getByTestId('stepper-value'))
    expect(getByTestId('stepper-input')).toBeInTheDocument()
  })

  it('Enter commits valid number', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(() => <Stepper value={10} onChange={onChange} />)
    fireEvent.click(getByTestId('stepper-value'))
    const input = getByTestId('stepper-input')
    fireEvent.input(input, { target: { value: '42' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(42)
  })

  it('Blur commits valid number', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(() => <Stepper value={10} onChange={onChange} />)
    fireEvent.click(getByTestId('stepper-value'))
    const input = getByTestId('stepper-input')
    fireEvent.input(input, { target: { value: '99' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(99)
  })

  it('NaN input does not call onChange', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(() => <Stepper value={10} onChange={onChange} />)
    fireEvent.click(getByTestId('stepper-value'))
    const input = getByTestId('stepper-input')
    fireEvent.input(input, { target: { value: 'abc' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commit clamps to max', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(() => <Stepper value={10} onChange={onChange} max={50} />)
    fireEvent.click(getByTestId('stepper-value'))
    const input = getByTestId('stepper-input')
    fireEvent.input(input, { target: { value: '999' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(50)
  })

  it('commit clamps to min', () => {
    const onChange = vi.fn()
    const { getByTestId } = render(() => <Stepper value={10} onChange={onChange} min={5} />)
    fireEvent.click(getByTestId('stepper-value'))
    const input = getByTestId('stepper-input')
    fireEvent.input(input, { target: { value: '-10' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(5)
  })
})

// ── F58 ─────────────────────────────────────────────────────────────────────
// The long-press repeat was cleared only by onPointerUp/onPointerLeave on the
// very button being held — and that button disables itself the moment the value
// reaches the bound. A disabled button dispatches no pointer events, so
// clearPress never ran and the interval kept firing onChange every 80ms until
// the component unmounted. There is no user action that stops it.
//
// Every bounded stepper is reachable: DurationInput's seconds (max 59, about 5s
// of holding), sets (20), reps (50), %TM (120), implementBase (200).
describe('Stepper — long press at a bound (F58)', () => {
  /**
   * A controlled Stepper backed by a SIGNAL, the way every real call site wires
   * it. A plain closure variable is not reactive, so props.value would never
   * advance and the component could never see itself reach the bound.
   */
  function held(initial: number, opts: { max?: number; min?: number }) {
    const [value, setValue] = createSignal(initial)
    const onChange = vi.fn((v: number) => setValue(v))
    const utils = render(() => (
      <Stepper
        value={value()} onChange={onChange} step={1}
        min={opts.min ?? 0} max={opts.max} fieldLabel="reps"
      />
    ))
    return { onChange, utils, value }
  }

  it('stops repeating once the value is pinned at the maximum', () => {
    vi.useFakeTimers()
    try {
      const { onChange, utils } = held(0, { max: 3 })
      const plus = utils.getByRole('button', { name: 'Increase reps' })
      fireEvent.pointerDown(plus)
      vi.advanceTimersByTime(400)   // long-press threshold
      vi.advanceTimersByTime(400)   // repeats up to and past the bound
      const atBound = onChange.mock.calls.length

      // Keep the clock running WITHOUT releasing. Once pinned at the bound the
      // repeat has nothing left to do and must stop on its own.
      vi.advanceTimersByTime(4_000)
      expect(onChange.mock.calls.length).toBe(atBound)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops repeating once the value is pinned at the minimum', () => {
    vi.useFakeTimers()
    try {
      const { onChange, utils } = held(2, { min: 0 })
      const minus = utils.getByRole('button', { name: 'Decrease reps' })
      fireEvent.pointerDown(minus)
      vi.advanceTimersByTime(400)
      vi.advanceTimersByTime(400)
      const atBound = onChange.mock.calls.length

      vi.advanceTimersByTime(4_000)
      expect(onChange.mock.calls.length).toBe(atBound)
    } finally {
      vi.useRealTimers()
    }
  })

  it('still repeats normally while the value is moving', () => {
    vi.useFakeTimers()
    try {
      const { onChange, utils } = held(0, { max: 1_000 })
      const plus = utils.getByRole('button', { name: 'Increase reps' })
      fireEvent.pointerDown(plus)
      vi.advanceTimersByTime(400)
      vi.advanceTimersByTime(800)   // 10 repeats at 80ms
      expect(onChange.mock.calls.length).toBeGreaterThan(5)
      fireEvent.pointerUp(plus)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops on release, as it always did', () => {
    vi.useFakeTimers()
    try {
      const { onChange, utils } = held(0, { max: 1_000 })
      const plus = utils.getByRole('button', { name: 'Increase reps' })
      fireEvent.pointerDown(plus)
      vi.advanceTimersByTime(400)
      vi.advanceTimersByTime(400)
      fireEvent.pointerUp(plus)
      const afterRelease = onChange.mock.calls.length
      vi.advanceTimersByTime(4_000)
      expect(onChange.mock.calls.length).toBe(afterRelease)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops when the pointer is released away from the button', () => {
    // The press is ended from the window, not the button. A pointer that
    // wanders off the control before releasing — or a button that disabled
    // itself mid-press — never dispatches pointerup itself.
    vi.useFakeTimers()
    try {
      const { onChange, utils } = held(0, { max: 1_000 })
      fireEvent.pointerDown(utils.getByRole('button', { name: 'Increase reps' }))
      vi.advanceTimersByTime(400)
      vi.advanceTimersByTime(400)
      const beforeRelease = onChange.mock.calls.length
      expect(beforeRelease).toBeGreaterThan(0)

      fireEvent.pointerUp(window)
      vi.advanceTimersByTime(4_000)
      expect(onChange.mock.calls.length).toBe(beforeRelease)
    } finally {
      vi.useRealTimers()
    }
  })
})
