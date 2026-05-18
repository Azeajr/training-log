import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import SetRow from './SetRow'

const baseSet = { type: 'main' as const, setNumber: 1, weight: 100, reps: 5 }
const completedProps = {
  set: baseSet,
  isActive: false,
  isCompleted: true,
  loggedReps: 5,
  loggedWeight: 100,
  onLog: () => {},
  onEdit: () => {},
}

describe('SetRow undo flow', () => {
  it('undo button absent when onDelete not provided', () => {
    const { queryByText } = render(() => <SetRow {...completedProps} />)
    expect(queryByText('undo')).not.toBeInTheDocument()
  })

  it('undo button present when onDelete provided', () => {
    const { getByText } = render(() => (
      <SetRow {...completedProps} onDelete={() => {}} />
    ))
    expect(getByText('undo')).toBeInTheDocument()
  })

  it('clicking undo shows confirm state', () => {
    const { getByText } = render(() => (
      <SetRow {...completedProps} onDelete={() => {}} />
    ))
    fireEvent.click(getByText('undo'))
    expect(getByText('undo set?')).toBeInTheDocument()
    expect(getByText('yes')).toBeInTheDocument()
    expect(getByText('no')).toBeInTheDocument()
  })

  it('yes calls onDelete', () => {
    const onDelete = vi.fn()
    const { getByText } = render(() => (
      <SetRow {...completedProps} onDelete={onDelete} />
    ))
    fireEvent.click(getByText('undo'))
    fireEvent.click(getByText('yes'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('no does not call onDelete and returns to trigger', () => {
    const onDelete = vi.fn()
    const { getByText } = render(() => (
      <SetRow {...completedProps} onDelete={onDelete} />
    ))
    fireEvent.click(getByText('undo'))
    fireEvent.click(getByText('no'))
    expect(onDelete).not.toHaveBeenCalled()
    expect(getByText('undo')).toBeInTheDocument()
  })
})
