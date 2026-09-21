// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import PtSetList from './PtSetList'
import { readRecordedPtSet, validatePtExercise, type PtExerciseDraft } from '../../lib/pt'
import {
  applyPtSetPatch,
  withPtSetAdded,
  withPtSetRemoved,
  type PtRunSet,
} from '../../store/pt-store'

const stepUp = (over: Partial<PtExerciseDraft> = {}) => validatePtExercise({
  name: 'Step up',
  sets: 3,
  measure: 'reps',
  targetReps: 10,
  resistanceKind: 'weight',
  resistanceWeight: 10,
  equipmentHeight: 6,
  equipmentHeightUnit: 'in',
  ...over,
}, 1, 0)

/**
 * The component with a parent that behaves like the real ones: both route every
 * patch through the same pure helpers, so carry-forward is exercised here the
 * way a live run or the history editor would exercise it.
 */
function renderList(options: {
  exercise?: ReturnType<typeof stepUp>
  sets: PtRunSet[]
  recorded?: boolean
  onPendingChange?: (pending: boolean) => void
}) {
  const exercise = options.exercise ?? stepUp()
  const [sets, setSets] = createSignal<PtRunSet[]>(options.sets)
  render(() => (
    <PtSetList
      exercise={exercise}
      sets={sets()}
      commitLabel={options.recorded ? 'APPLY SET CHANGES' : undefined}
      read={options.recorded ? set => readRecordedPtSet(exercise, set) : undefined}
      onPendingChange={options.onPendingChange}
      onPatch={(setNumber, fields) => setSets(current => applyPtSetPatch(current, setNumber, fields))}
      onAdd={() => setSets(current => withPtSetAdded(current))}
      onRemove={setNumber => setSets(current => withPtSetRemoved(current, setNumber))}
    />
  ))
  return { sets }
}

const openSet = (n: number) => {
  const row = screen.getByRole('checkbox', { name: new RegExp(`Step up set ${n}`) }).parentElement!
  fireEvent.click(row.querySelector('button:not([role])')!)
}

const press = (label: string, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.click(screen.getByLabelText(label))
}

describe('PtSetList set editor', () => {
  /**
   * `cancel` used to close the editor over changes that had already been
   * committed on every stepper press — and, for equipment, carried forward into
   * every later unfinished set on the way.
   */
  it('CANCEL leaves the set and every set after it exactly as they were', () => {
    const { sets } = renderList({ sets: [{ done: false }, { done: false }, { done: false }] })

    openSet(1)
    press('Increase set 1 reps', 2)
    press('Increase set 1 weight', 2)
    press('Decrease set 1 equipment height', 6)
    fireEvent.click(screen.getByText('CANCEL'))

    expect(sets()).toEqual([{ done: false }, { done: false }, { done: false }])
  })

  it('CANCEL leaves a recorded set alone in the history editor too', () => {
    const { sets } = renderList({
      recorded: true,
      sets: [
        { done: true, reps: 10, weight: 10, equipmentHeight: 6, equipmentHeightUnit: 'in' },
        { done: true, reps: 8, weight: 10, equipmentHeight: 6, equipmentHeightUnit: 'in' },
      ],
    })
    const before = structuredClone(sets())

    openSet(1)
    press('Decrease set 1 reps', 3)
    press('Increase set 1 weight')
    fireEvent.click(screen.getByText('CANCEL'))

    expect(sets()).toEqual(before)
  })

  /** Correcting a number and saying the set is finished are different claims. */
  it('SAVE SET CHANGES commits without touching completion', () => {
    const { sets } = renderList({ sets: [{ done: true, reps: 10 }, { done: false }] })

    openSet(1)
    press('Decrease set 1 reps')
    expect(screen.queryByText('LOG SET')).toBeNull()
    fireEvent.click(screen.getByText('SAVE SET CHANGES'))
    expect(sets()[0]).toMatchObject({ done: true, reps: 9 })

    openSet(2)
    press('Decrease set 2 reps')
    fireEvent.click(screen.getByText('SAVE SET CHANGES'))
    expect(sets()[1]).toMatchObject({ done: false, reps: 9 })
  })

  it('LOG SET commits and ticks, carrying equipment only as far as the next done set', () => {
    const { sets } = renderList({
      sets: [{ done: false }, { done: false }, { done: true, weight: 10 }, { done: false }],
    })

    openSet(1)
    press('Increase set 1 weight', 2)
    fireEvent.click(screen.getByText('LOG SET'))

    expect(sets()[0]).toMatchObject({ done: true, weight: 15 })
    // Equipment carries to the set still to come...
    expect(sets()[1]).toMatchObject({ done: false, weight: 15 })
    // ...and stops at one already recorded, which is a fact rather than a
    // default. The set beyond it is not reached.
    expect(sets()[2]).toMatchObject({ done: true, weight: 10 })
    expect(sets()[3]).toEqual({ done: false })
  })

  /**
   * The patch is sparse, so equipment nobody touched stays where it is. A full
   * snapshot would push set 1's weight over a different one already entered for
   * set 2 — and would do it on a save that changed nothing at all.
   */
  it('commits only what changed, so an untouched weight does not travel', () => {
    const { sets } = renderList({
      sets: [{ done: false, weight: 10 }, { done: false, weight: 20 }],
    })

    openSet(1)
    press('Increase set 1 reps')
    fireEvent.click(screen.getByText('SAVE SET CHANGES'))
    expect(sets()[1]).toMatchObject({ weight: 20 })

    // Opened and committed without touching anything.
    openSet(1)
    fireEvent.click(screen.getByText('SAVE SET CHANGES'))
    expect(sets()[1]).toMatchObject({ weight: 20 })

    // Edited and put back to what it opened on: unchanged, so absent.
    openSet(1)
    press('Increase set 1 weight')
    press('Decrease set 1 weight')
    fireEvent.click(screen.getByText('SAVE SET CHANGES'))
    expect(sets()[1]).toMatchObject({ weight: 20 })
    expect(sets()[0]).toMatchObject({ weight: 10 })
  })

  /**
   * Removing a set renumbers the ones after it. A pending edit has to follow its
   * own set, never stay on an index that now holds a different one.
   */
  it('a pending edit cannot be redirected onto another set by a removal', () => {
    const { sets } = renderList({
      sets: [{ done: false, reps: 10 }, { done: false, reps: 10 }, { done: false, reps: 10 }],
    })

    openSet(3)
    press('Decrease set 3 reps', 3)

    // Set 1 goes; the edit in progress belongs to what is now set 2.
    fireEvent.click(screen.getByLabelText('Remove Step up set 1'))
    fireEvent.click(screen.getByLabelText('Yes, remove step up set 1'))
    fireEvent.click(screen.getByText('SAVE SET CHANGES'))

    expect(sets()).toEqual([{ done: false, reps: 10 }, { done: false, reps: 7 }])
  })

  /**
   * The set being edited has no remove control of its own — its row is the
   * editor — so the reachable case is a removal further down the list, which
   * must not move the edit either.
   */
  it('leaves a pending edit where it is when a later set is removed', () => {
    const { sets } = renderList({
      sets: [{ done: false, reps: 10 }, { done: false, reps: 10 }, { done: false, reps: 10 }],
    })

    openSet(1)
    press('Decrease set 1 reps', 3)
    fireEvent.click(screen.getByLabelText('Remove Step up set 3'))
    fireEvent.click(screen.getByLabelText('Yes, remove step up set 3'))
    fireEvent.click(screen.getByText('SAVE SET CHANGES'))

    expect(sets()).toEqual([{ done: false, reps: 7 }, { done: false, reps: 10 }])
  })

  /** Two editors cannot be open at once, and neither can silently win. */
  it('refuses to open another set over unapplied changes', async () => {
    renderList({ sets: [{ done: false, reps: 10 }, { done: false, reps: 10 }] })

    openSet(1)
    press('Decrease set 1 reps')
    openSet(2)

    await waitFor(() => expect(screen.getByLabelText('Decrease set 1 reps')).toBeTruthy())
    expect(screen.queryByLabelText('Decrease set 2 reps')).toBeNull()

    // Settled by hand, and the other set opens.
    fireEvent.click(screen.getByText('CANCEL'))
    openSet(2)
    expect(screen.getByLabelText('Decrease set 2 reps')).toBeTruthy()
  })

  it('tells the parent when an unapplied edit appears and when it is gone', () => {
    const onPendingChange = vi.fn()
    renderList({ sets: [{ done: false, reps: 10 }], onPendingChange })

    expect(onPendingChange).toHaveBeenLastCalledWith(false)
    openSet(1)
    // Open is not dirty: the set can still be closed without losing anything.
    expect(onPendingChange).toHaveBeenLastCalledWith(false)

    press('Decrease set 1 reps')
    expect(onPendingChange).toHaveBeenLastCalledWith(true)

    fireEvent.click(screen.getByText('SAVE SET CHANGES'))
    expect(onPendingChange).toHaveBeenLastCalledWith(false)
  })
})
