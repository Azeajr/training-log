import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import SetRow from './SetRow'

const BASE_SET = {
  type: 'main' as const,
  setNumber: 1,
  weight: 185,
  reps: 5,
  isAmrap: false,
}

describe('SetRow — pending state', () => {
  it('shows set weight and reps', () => {
    render(() => (
      <SetRow set={BASE_SET} isActive={false} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />
    ))
    expect(screen.getByText(/185lb/)).toBeInTheDocument()
    expect(screen.getByText(/x 5/)).toBeInTheDocument()
  })

  it('does not show LOG button when not active', () => {
    render(() => (
      <SetRow set={BASE_SET} isActive={false} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />
    ))
    expect(screen.queryByRole('button', { name: /LOG/i })).toBeNull()
  })
})

describe('SetRow — active state', () => {
  it('shows LOG button', () => {
    render(() => (
      <SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />
    ))
    expect(screen.getByRole('button', { name: /LOG/i })).toBeInTheDocument()
  })

  it('calls onLog with current reps and weight when LOG is clicked', () => {
    const onLog = vi.fn()
    render(() => (
      <SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />
    ))
    fireEvent.click(screen.getByRole('button', { name: /LOG/i }))
    expect(onLog).toHaveBeenCalledOnce()
    expect(onLog).toHaveBeenCalledWith(5, 185)
  })
})

describe('SetRow — completed state', () => {
  it('shows done label', () => {
    render(() => (
      <SetRow
        set={BASE_SET}
        isActive={false}
        isCompleted={true}
        loggedReps={5}
        loggedWeight={185}
        onLog={vi.fn()}
        onEdit={vi.fn()}
      />
    ))
    expect(screen.getByText(/done/i)).toBeInTheDocument()
  })

  it('shows logged reps', () => {
    render(() => (
      <SetRow
        set={BASE_SET}
        isActive={false}
        isCompleted={true}
        loggedReps={7}
        loggedWeight={185}
        onLog={vi.fn()}
        onEdit={vi.fn()}
      />
    ))
    expect(screen.getByText(/7/)).toBeInTheDocument()
  })

  it('shows edit controls when row is clicked', () => {
    render(() => (
      <SetRow
        set={BASE_SET}
        isActive={false}
        isCompleted={true}
        loggedReps={5}
        loggedWeight={185}
        onLog={vi.fn()}
        onEdit={vi.fn()}
      />
    ))
    fireEvent.click(screen.getByText(/done/i))
    expect(screen.getByRole('button', { name: /SAVE/i })).toBeInTheDocument()
  })
})

describe('SetRow — undo delete', () => {
  it('shows undo button for last completed set', () => {
    render(() => (
      <SetRow
        set={BASE_SET}
        isActive={false}
        isCompleted={true}
        loggedReps={5}
        loggedWeight={185}
        onLog={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    ))
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument()
  })

  it('shows confirm prompt after undo click', () => {
    render(() => (
      <SetRow
        set={BASE_SET}
        isActive={false}
        isCompleted={true}
        loggedReps={5}
        loggedWeight={185}
        onLog={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    ))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument()
  })

  it('calls onDelete when confirmed', () => {
    const onDelete = vi.fn()
    render(() => (
      <SetRow
        set={BASE_SET}
        isActive={false}
        isCompleted={true}
        loggedReps={5}
        loggedWeight={185}
        onLog={vi.fn()}
        onEdit={vi.fn()}
        onDelete={onDelete}
      />
    ))
    fireEvent.click(screen.getByRole('button', { name: /undo/i }))
    fireEvent.click(screen.getByRole('button', { name: /yes/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })
})
