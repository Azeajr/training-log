import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { bandProfileFor, defaultBandProfile, makeBandLoad } from '../../lib/band-loading'
import SetRow from './SetRow'

const baseSet = { type: 'main' as const, setNumber: 1, weight: 100, reps: 5, isAmrap: false }
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


describe('band-assisted main sets', () => {
  it('suggests a band, permits extra weight, and logs effective load for progression', () => {
    const onLog = vi.fn()
    const { getByRole } = render(() => <SetRow set={{ ...baseSet, weight: 145 }} isActive isCompleted={false} bandProfile={defaultBandProfile('Chin-ups')} onLog={onLog} onEdit={() => {}} />)
    expect(getByRole('combobox', { name: 'band' })).toHaveValue('Green')
    fireEvent.change(getByRole('combobox', { name: 'band' }), { target: { value: 'Red' } })
    fireEvent.click(getByRole('button', { name: 'Increase added weight' }))
    fireEvent.click(getByRole('button', { name: 'LOG' }))
    // 191 raw − 10 assistance + 2.5 added = 183.5 exactly, not 185 on a 5lb grid.
    expect(onLog).toHaveBeenCalledWith(5, 183.5, { band: 'Red', rawLoad: 191, assistance: 10, addedWeight: 2.5 })
  })
  it('keeps a band the user picked when the prescription cascades', () => {
    // `props.set.weight` moves under this row every time an EARLIER set is
    // edited. Re-suggesting on that threw away the band already dialled in,
    // mid-exercise and silently. Same guarantee `weightTouched` gives the
    // plain weight stepper.
    const [weight, setWeight] = createSignal(145)
    const onLog = vi.fn()
    const { getByRole } = render(() => <SetRow set={{ ...baseSet, weight: weight() }} isActive isCompleted={false}
      bandProfile={defaultBandProfile('Chin-ups')} onLog={onLog} onEdit={() => {}} />)
    fireEvent.change(getByRole('combobox', { name: 'band' }), { target: { value: 'Purple' } })

    // 143 is exactly Green/0, so an unguarded effect re-suggests Green here.
    setWeight(143)

    expect(getByRole('combobox', { name: 'band' })).toHaveValue('Purple')
    fireEvent.click(getByRole('button', { name: 'LOG' }))
    expect(onLog).toHaveBeenCalledWith(5, 160, expect.objectContaining({ band: 'Purple' }))
  })

  it('retains recorded raw load when editing after recalibration', () => {
    const original = makeBandLoad(defaultBandProfile('Chin-ups')!, 'Green')
    const onEdit = vi.fn()
    const { getByRole, getByText } = render(() => <SetRow {...completedProps} loggedWeight={145} loggedBandLoad={original}
      bandProfile={{ ...defaultBandProfile('Chin-ups')!, rawLoad: 220 }} onEdit={onEdit} />)
    fireEvent.click(getByRole('button', { name: /Green/ }))
    fireEvent.click(getByRole('button', { name: 'Increase reps' }))
    fireEvent.click(getByText('SAVE'))
    expect(onEdit).toHaveBeenCalledWith(6, 145, original)
  })
})

describe('band profiles are opt-in', () => {
  const totalBase0 = { mode: 'total' as const, base: 0 }

  it('a chin-up with no saved profile keeps its weight stepper', () => {
    // The whole symptom: equipment TOTAL / base 0 is the belt-and-chin setup,
    // and a profile switched on by name alone replaced the weight stepper with
    // band controls on a lift set up to log a plain total.
    const { queryByLabelText, queryByRole, container } = render(() => (
      <SetRow set={{ ...baseSet, weight: 145 }} isActive isCompleted={false}
        loading={totalBase0} bandProfile={bandProfileFor({ name: 'Chin-ups' })}
        onLog={() => {}} onEdit={() => {}} />
    ))
    expect(queryByLabelText('Increase weight')).toBeInTheDocument()
    expect(queryByRole('combobox', { name: 'band' })).not.toBeInTheDocument()
    expect(container.textContent).toContain('plates:')
  })

  it('logs nothing about bands until a profile is saved', () => {
    const onLog = vi.fn()
    const { getByRole } = render(() => (
      <SetRow set={{ ...baseSet, weight: 145 }} isActive isCompleted={false}
        loading={totalBase0} bandProfile={bandProfileFor({ name: 'Chin-ups' })}
        onLog={onLog} onEdit={() => {}} />
    ))
    fireEvent.click(getByRole('button', { name: 'LOG' }))
    // Not a suggested Orange band at 191 raw that nobody asked for.
    expect(onLog).toHaveBeenCalledWith(5, 145, null)
  })

  it('a saved, enabled profile does switch the controls over', () => {
    const { queryByRole } = render(() => (
      <SetRow set={{ ...baseSet, weight: 145 }} isActive isCompleted={false}
        loading={totalBase0}
        bandProfile={bandProfileFor({ name: 'Chin-ups', bandProfile: defaultBandProfile('Chin-ups') })}
        onLog={() => {}} onEdit={() => {}} />
    ))
    expect(queryByRole('combobox', { name: 'band' })).toBeInTheDocument()
  })

  it('a profile the user turned off stays off', () => {
    const off = { ...defaultBandProfile('Chin-ups')!, enabled: false }
    const { queryByLabelText } = render(() => (
      <SetRow set={{ ...baseSet, weight: 145 }} isActive isCompleted={false}
        loading={totalBase0} bandProfile={bandProfileFor({ name: 'Chin-ups', bandProfile: off })}
        onLog={() => {}} onEdit={() => {}} />
    ))
    expect(queryByLabelText('Increase weight')).toBeInTheDocument()
  })
})
