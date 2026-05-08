import { describe, it, expect } from 'vitest'
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
})
