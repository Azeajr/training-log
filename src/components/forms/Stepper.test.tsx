import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
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
