// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SetRow from './SetRow'
import type { ComponentProps } from 'react'

const BASE_SET = {
  type: 'main' as const,
  setNumber: 1,
  weight: 170,
  reps: 5,
  isAmrap: false,
}

// Active set: weight display is a toggle button ("170lb"), reps stepper is always visible.
// Weight stepper only appears after tapping the weight display.
const weightDisplayBtn = () => screen.getByRole('button', { name: /^170lb$/ })
const repsValueBtn = () => screen.getByRole('button', { name: String(BASE_SET.reps) })

// Call after opening weight editing (two "−" / "+" sets present):
const wtPlus  = () => screen.getAllByRole('button', { name: '+' })[0]
const wtMinus = () => screen.getAllByRole('button', { name: '−' })[0]

// Reps stepper: only "+" / "−" present by default (index 0 before weight editing, index 1 after).
const repsPlus = (weightOpen = false) => screen.getAllByRole('button', { name: '+' })[weightOpen ? 1 : 0]

describe('SetRow — pending (not active, not completed)', () => {
  it('renders weight and reps dimmed, no interactive controls', () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('170lb')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows JOKER badge on pending joker set', () => {
    render(<SetRow set={{ ...BASE_SET, type: 'joker' as const }} isActive={false} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('JOKER')).toBeInTheDocument()
  })

  it('syncs displayed weight when set.weight prop changes (FSL cascade)', () => {
    type Props = ComponentProps<typeof SetRow>
    const props: Props = { set: BASE_SET, isActive: false, isCompleted: false, onLog: vi.fn(), onEdit: vi.fn() }
    const { rerender } = render(<SetRow {...props} />)
    expect(screen.getByText('170lb')).toBeInTheDocument()
    rerender(<SetRow {...props} set={{ ...BASE_SET, weight: 175 }} />)
    expect(screen.getByText('175lb')).toBeInTheDocument()
  })

  it('syncs weight when set becomes active with a cascaded weight simultaneously', () => {
    type Props = ComponentProps<typeof SetRow>
    // Simulates the batch-render case: set.weight changes at the same time isActive flips true
    const props: Props = { set: BASE_SET, isActive: false, isCompleted: false, onLog: vi.fn(), onEdit: vi.fn() }
    const { rerender } = render(<SetRow {...props} />)
    rerender(<SetRow {...props} set={{ ...BASE_SET, weight: 175 }} isActive={true} />)
    expect(screen.getByRole('button', { name: /^175lb$/ })).toBeInTheDocument()
  })
})

describe('SetRow — active', () => {
  it('shows weight display button, reps stepper, and LOG — no weight stepper by default', () => {
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(weightDisplayBtn()).toBeInTheDocument()
    expect(repsValueBtn()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'LOG' })).toBeInTheDocument()
    // weight stepper value button ("170" without "lb") must NOT be present
    expect(screen.queryByRole('button', { name: '170' })).toBeNull()
  })

  it('tapping weight display reveals the weight stepper', async () => {
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '170' })).toBeNull()
    await userEvent.click(weightDisplayBtn())
    expect(screen.getByRole('button', { name: '170' })).toBeInTheDocument()
  })

  it('tapping weight display again hides the weight stepper', async () => {
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    await userEvent.click(weightDisplayBtn())
    await userEvent.click(weightDisplayBtn())
    expect(screen.queryByRole('button', { name: '170' })).toBeNull()
  })

  it('logs the planned reps and weight when LOG is clicked without adjustment', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(BASE_SET.reps, BASE_SET.weight)
  })

  it('logs incremented reps (weight unchanged) after pressing reps +', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(repsPlus())
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(BASE_SET.reps + 1, BASE_SET.weight)
  })

  it('logs adjusted weight after pressing weight + (requires opening weight edit first)', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(weightDisplayBtn())
    await userEvent.click(wtPlus())
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(BASE_SET.reps, BASE_SET.weight + 2.5)
  })

  it('logs adjusted weight after pressing weight −', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(weightDisplayBtn())
    await userEvent.click(wtMinus())
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(BASE_SET.reps, BASE_SET.weight - 2.5)
  })

  it('large weight display updates immediately when weight Stepper is adjusted', async () => {
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    await userEvent.click(weightDisplayBtn())
    await userEvent.click(wtPlus())
    expect(screen.getByRole('button', { name: /^172\.5lb$/ })).toBeInTheDocument()
  })

  it('LOG resets weight stepper to hidden', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(weightDisplayBtn())
    expect(screen.getByRole('button', { name: '170' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(screen.queryByRole('button', { name: '170' })).toBeNull()
  })

  it('logs a custom reps value typed via keyboard fallback', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(repsValueBtn())
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '12{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(12, BASE_SET.weight)
  })

  it('can adjust both weight and reps independently before logging', async () => {
    const onLog = vi.fn()
    render(<SetRow set={BASE_SET} isActive={true} isCompleted={false} onLog={onLog} onEdit={vi.fn()} />)
    await userEvent.click(weightDisplayBtn())
    await userEvent.click(wtPlus())             // weight: 172.5
    await userEvent.click(repsPlus(true))       // reps: 6  (weight open → index 1)
    await userEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(BASE_SET.reps + 1, BASE_SET.weight + 2.5)
  })

  it('shows AMRAP badge when isAmrap is true', () => {
    render(<SetRow set={{ ...BASE_SET, isAmrap: true }} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('AMRAP')).toBeInTheDocument()
  })

  it('shows JOKER badge when type is joker', () => {
    render(<SetRow set={{ ...BASE_SET, type: 'joker' as const }} isActive={true} isCompleted={false} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('JOKER')).toBeInTheDocument()
  })
})

describe('SetRow — completed', () => {
  it('shows logged reps and done badge', () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('x 8')).toBeInTheDocument()
    expect(screen.getByText('done')).toBeInTheDocument()
  })

  it('shows loggedWeight in display row when weight was adjusted', () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} loggedWeight={175} onLog={vi.fn()} onEdit={vi.fn()} />)
    expect(screen.getByText('175lb')).toBeInTheDocument()
  })

  it('clicking the row enters edit mode showing weight + reps Steppers and SAVE button', async () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={vi.fn()} />)
    fireEvent.click(screen.getByText('x 8'))
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '8' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: String(BASE_SET.weight) })).toBeInTheDocument()
  })

  it('edit mode initialises weight stepper from loggedWeight when provided', async () => {
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} loggedWeight={175} onLog={vi.fn()} onEdit={vi.fn()} />)
    fireEvent.click(screen.getByText('x 8'))
    expect(screen.getByRole('button', { name: '175' })).toBeInTheDocument()
  })

  it('edit mode calls onEdit with updated reps and original weight on SAVE', async () => {
    const onEdit = vi.fn()
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('x 8'))
    // reps stepper is second; click its +
    await userEvent.click(screen.getAllByRole('button', { name: '+' })[1])
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(onEdit).toHaveBeenCalledWith(9, BASE_SET.weight)
  })

  it('edit mode calls onEdit with updated weight and original reps on SAVE', async () => {
    const onEdit = vi.fn()
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('x 8'))
    // weight stepper is first
    await userEvent.click(screen.getAllByRole('button', { name: '+' })[0])
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(onEdit).toHaveBeenCalledWith(8, BASE_SET.weight + 2.5)
  })

  it('edit mode can accept a typed reps value via keyboard fallback', async () => {
    const onEdit = vi.fn()
    render(<SetRow set={BASE_SET} isActive={false} isCompleted={true} loggedReps={8} onLog={vi.fn()} onEdit={onEdit} />)
    fireEvent.click(screen.getByText('x 8'))
    await userEvent.click(screen.getByRole('button', { name: '8' }))
    const input = screen.getByRole('spinbutton')
    await userEvent.clear(input)
    await userEvent.type(input, '6{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(onEdit).toHaveBeenCalledWith(6, BASE_SET.weight)
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
