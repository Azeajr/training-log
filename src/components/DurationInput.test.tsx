// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DurationInput from './DurationInput'

describe('DurationInput', () => {
  it('renders minute and second steppers', () => {
    render(<DurationInput value={null} onChange={vi.fn()} />)
    expect(screen.getAllByRole('button', { name: '+' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '−' })).toHaveLength(2)
  })

  it('shows colon separator between steppers', () => {
    render(<DurationInput value={null} onChange={vi.fn()} />)
    expect(screen.getByText(':')).toBeInTheDocument()
  })

  it('initializes to 0:0 when value is null', () => {
    render(<DurationInput value={null} onChange={vi.fn()} />)
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
  })

  it('initializes mm and ss from value in seconds', () => {
    // 90s = 1m 30s
    render(<DurationInput value={90} onChange={vi.fn()} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
  })

  it('calls onChange with total seconds when mm is incremented', async () => {
    const onChange = vi.fn()
    render(<DurationInput value={60} onChange={onChange} />)  // 1m 0s
    const [mmPlus] = screen.getAllByRole('button', { name: '+' })
    await userEvent.click(mmPlus)  // mm: 1→2
    expect(onChange).toHaveBeenCalledWith(120)  // 2m 0s
  })

  it('calls onChange with total seconds when ss is incremented', async () => {
    const onChange = vi.fn()
    render(<DurationInput value={60} onChange={onChange} />)  // 1m 0s
    const [, ssPlus] = screen.getAllByRole('button', { name: '+' })
    await userEvent.click(ssPlus)  // ss: 0→1
    expect(onChange).toHaveBeenCalledWith(61)  // 1m 1s
  })

  it('ss stepper is capped at 59', async () => {
    const onChange = vi.fn()
    render(<DurationInput value={59} onChange={onChange} />)  // 0m 59s
    const [, ssPlus] = screen.getAllByRole('button', { name: '+' })
    await userEvent.click(ssPlus)  // ss: 59 → capped at 59
    // onChange should not be called beyond max (stepper enforces max=59)
    // or called with 59 again — either way ss stays at 59
    const lastCall = onChange.mock.calls.at(-1)
    if (lastCall) expect(lastCall[0]).toBeLessThanOrEqual(59)
  })
})
