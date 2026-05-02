// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Stepper from './Stepper'

describe('Stepper — display', () => {
  it('renders the initial value', () => {
    render(<Stepper value={10} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument()
  })

  it('formats decimal values to one decimal place', () => {
    render(<Stepper value={137.5} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '137.5' })).toBeInTheDocument()
  })

  it('renders integer values without a decimal point', () => {
    render(<Stepper value={135} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: '135' })).toBeInTheDocument()
  })
})

describe('Stepper — increment / decrement', () => {
  it('calls onChange with value + step on + click', async () => {
    const onChange = vi.fn()
    render(<Stepper value={10} onChange={onChange} step={1} />)
    await userEvent.click(screen.getByRole('button', { name: '+' }))
    expect(onChange).toHaveBeenCalledWith(11)
  })

  it('calls onChange with value − step on − click', async () => {
    const onChange = vi.fn()
    render(<Stepper value={10} onChange={onChange} step={1} />)
    await userEvent.click(screen.getByRole('button', { name: '−' }))
    expect(onChange).toHaveBeenCalledWith(9)
  })

  it('handles fractional step without floating-point drift', async () => {
    const onChange = vi.fn()
    render(<Stepper value={135} onChange={onChange} step={2.5} />)
    await userEvent.click(screen.getByRole('button', { name: '+' }))
    expect(onChange).toHaveBeenCalledWith(137.5)
  })

  it('− button is disabled at min', () => {
    render(<Stepper value={0} onChange={vi.fn()} min={0} />)
    expect(screen.getByRole('button', { name: '−' })).toBeDisabled()
  })

  it('+ button is disabled at max', () => {
    render(<Stepper value={59} onChange={vi.fn()} max={59} />)
    expect(screen.getByRole('button', { name: '+' })).toBeDisabled()
  })

  it('does not call onChange below min', async () => {
    const onChange = vi.fn()
    render(<Stepper value={0} onChange={onChange} min={0} />)
    await userEvent.click(screen.getByRole('button', { name: '−' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Stepper — keyboard fallback', () => {
  it('clicking the value opens a number input', async () => {
    render(<Stepper value={10} onChange={vi.fn()} />)
    expect(screen.queryByRole('spinbutton')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '10' }))
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('pressing Enter commits the typed value', async () => {
    const onChange = vi.fn()
    render(<Stepper value={10} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '10' }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '25{Enter}')
    expect(onChange).toHaveBeenCalledWith(25)
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('blurring commits the typed value', async () => {
    const onChange = vi.fn()
    render(<Stepper value={10} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '10' }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '20')
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith(20)
  })

  it('clamps typed value to min', async () => {
    const onChange = vi.fn()
    render(<Stepper value={10} onChange={onChange} min={5} />)
    await userEvent.click(screen.getByRole('button', { name: '10' }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '1{Enter}')
    expect(onChange).toHaveBeenCalledWith(5)
  })

  it('clamps typed value to max', async () => {
    const onChange = vi.fn()
    render(<Stepper value={10} onChange={onChange} max={59} />)
    await userEvent.click(screen.getByRole('button', { name: '10' }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '99{Enter}')
    expect(onChange).toHaveBeenCalledWith(59)
  })
})
