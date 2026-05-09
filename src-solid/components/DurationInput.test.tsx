import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import DurationInput from './DurationInput'

describe('DurationInput', () => {
  it('shows 0 for both mm and ss when value is null', () => {
    render(() => <DurationInput value={null} onChange={() => {}} />)
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })

  it('splits 90 seconds into 1 minute and 30 seconds', () => {
    render(() => <DurationInput value={90} onChange={() => {}} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('renders colon separator between mm and ss', () => {
    render(() => <DurationInput value={null} onChange={() => {}} />)
    expect(screen.getByText(':')).toBeInTheDocument()
  })

  it('calls onChange with correct seconds when minutes incremented', () => {
    const calls: number[] = []
    render(() => <DurationInput value={90} onChange={v => calls.push(v)} />)
    const plusButtons = screen.getAllByText('+')
    fireEvent.click(plusButtons[0])
    expect(calls[0]).toBe(2 * 60 + 30) // 150
  })

  it('calls onChange with correct seconds when seconds incremented', () => {
    const calls: number[] = []
    render(() => <DurationInput value={90} onChange={v => calls.push(v)} />)
    const plusButtons = screen.getAllByText('+')
    fireEvent.click(plusButtons[1])
    expect(calls[0]).toBe(1 * 60 + 31) // 91
  })

  it('calls onChange with correct seconds when minutes decremented', () => {
    const calls: number[] = []
    render(() => <DurationInput value={90} onChange={v => calls.push(v)} />)
    const minusButtons = screen.getAllByText('−')
    fireEvent.click(minusButtons[0])
    expect(calls[0]).toBe(0 * 60 + 30) // 30
  })

  it('splits 3661 seconds correctly (61 min 1 sec)', () => {
    render(() => <DurationInput value={3661} onChange={() => {}} />)
    expect(screen.getByText('61')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })
})
