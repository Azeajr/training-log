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
  it('renders weight and reps dimmed, no interactive controls', () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('170lb')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('SetRow — active', () => {
  it('renders Stepper defaulting to target reps and LOG button', () => {
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByRole('button', { name: String(BASE_SET.reps) })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LOG' })).toBeInTheDocument()
  })

  it('logs the target reps when LOG is clicked without adjustment', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(BASE_SET.reps)
  })

  it('logs incremented reps after pressing +', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '+' }))
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(BASE_SET.reps + 1)
  })

  it('logs a custom value typed via the keyboard fallback', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: String(BASE_SET.reps) }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '12{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(12)
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

  it('clicking the row enters edit mode showing the Stepper and SAVE button', async () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={vi.fn()} />)
    fireEvent.click(screen.getByText('x 8'))
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '8' })).toBeInTheDocument()
  })

  it('edit mode calls onEdit with the stepper value when SAVE is clicked', async () => {
    const onEdit = vi.fn()
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('x 8'))
    await userEvent.click(screen.getByRole('button', { name: '+' }))
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(onEdit).toHaveBeenCalledWith(9)
  })

  it('edit mode can accept a typed value via keyboard fallback', async () => {
    const onEdit = vi.fn()
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('x 8'))
    await userEvent.click(screen.getByRole('button', { name: '8' }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '6{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(onEdit).toHaveBeenCalledWith(6)
  })

  it('cancel button exits edit mode without calling onEdit', async () => {
    const onEdit = vi.fn()
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('x 8'))
    await userEvent.click(screen.getByRole('button', { name: 'cancel' }))
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.getByText('x 8')).toBeInTheDocument()
  })
})
