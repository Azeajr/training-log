// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SetRow from './SetRow'

const BASE_SET = {
  type: 'main' as const,
  setNumber: 1,
  weight: 170,
  reps: 5,
  isAmrap: false,
}

describe('SetRow — pending (not active, not completed)', () => {
  it('renders weight and reps dimmed, no input', () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('170lb')).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
})

describe('SetRow — active', () => {
  it('renders reps input and LOG button', () => {
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LOG' })).toBeInTheDocument()
  })

  it('calls onLog with the entered reps when LOG is clicked', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)

    await userEvent.type(screen.getByRole('spinbutton'), '7')
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))

    expect(onLog).toHaveBeenCalledWith(7)
  })

  it('calls onLog when Enter is pressed in the reps field', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)

    await userEvent.type(screen.getByRole('spinbutton'), '9{Enter}')

    expect(onLog).toHaveBeenCalledWith(9)
  })

  it('logs the default reps when LOG is clicked with empty input', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))

    expect(onLog).toHaveBeenCalledWith(BASE_SET.reps)
  })

  it('shows AMRAP badge when isAmrap is true', () => {
    render(<SetRow set={{ ...BASE_SET, isAmrap: true }} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('AMRAP')).toBeInTheDocument()
  })
})

describe('SetRow — completed', () => {
  it('shows logged reps and done badge', () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('x 8')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('clicking the row enters edit mode', async () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={vi.fn()} />)
    fireEvent.click(screen.getByText('x 8'))
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeInTheDocument()
  })

  it('edit mode calls onEdit with updated reps', async () => {
    const onEdit = vi.fn()
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={onEdit} />)

    fireEvent.click(screen.getByText('x 8'))

    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '6')
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))

    expect(onEdit).toHaveBeenCalledWith(6)
  })
})
