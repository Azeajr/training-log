// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import AccessoryLog from './AccessoryLog'
import type { Exercise } from '../../types/domain'
import type { ActiveAccessory } from '../../store/workout-store'

const TIMED: Exercise = { id: 1, name: 'Plank', type: 'timed', category: 'core' }

const accessory = (loggedSets: ActiveAccessory['loggedSets']): ActiveAccessory => ({
  exerciseId: 1,
  exerciseName: 'Plank',
  slot: 'extra',
  tm: 0,
  calculatedWeight: 0,
  loggedSets,
})

// ── F59 ─────────────────────────────────────────────────────────────────────
// Two duration inputs are on screen simultaneously in the ordinary case:
// editing a logged timed set renders one while the active-set form renders the
// other. Without fieldLabel a screen reader hears two identical "Increase
// minutes" buttons with nothing to tell them apart.
describe('AccessoryLog duration inputs (F59)', () => {
  it('gives each duration control a distinct accessible name', async () => {
    render(() => (
      <AccessoryLog
        accessory={accessory([
          { setNumber: 1, weight: 0, reps: null, duration: 60, distance: null },
        ])}
        exercise={TIMED}
      />
    ))

    // Open the editor on the logged set: now both duration inputs are live.
    // The row is a real button since F61, so it is reachable by role.
    const row = screen.getAllByRole('button').find(b => /1:00/.test(b.textContent ?? ''))
    expect(row).toBeDefined()
    fireEvent.click(row!)
    await Promise.resolve()

    const names = [...document.querySelectorAll('[aria-label]')]
      .map(el => el.getAttribute('aria-label')!)
      .filter(n => /minutes|seconds/.test(n))

    expect(names.length).toBeGreaterThanOrEqual(4) // two inputs x (min, sec)
    expect(new Set(names).size).toBe(names.length)
  })
})

// ── F62 ─────────────────────────────────────────────────────────────────────
// InlineConfirm only calls stopPropagation when the optional prop is set, and
// AccessoryLog did not set it — while the SetReadout it sits inside had onClick
// on its root. The first tap on "undo" therefore bubbled: the row swapped to
// the edit form, which unmounted the InlineConfirm before its "undo set?"
// confirmation ever rendered. The control was functionally dead, so
// deleteLastAccessorySet had no reachable caller in the UI.
describe('AccessoryLog undo control (F62)', () => {
  const withLogged = () => render(() => (
    <AccessoryLog
      accessory={accessory([
        { setNumber: 1, weight: 20, reps: 10, duration: null, distance: null },
      ])}
      exercise={{ id: 1, name: 'Plank', type: 'reps', category: 'core' }}
    />
  ))

  it('shows the confirmation instead of opening the editor', async () => {
    withLogged()
    const undo = screen.getByRole('button', { name: /Undo last Plank set/ })
    fireEvent.click(undo)
    await Promise.resolve()

    expect(screen.getByText('undo set?')).toBeInTheDocument()
    // The row must not have swapped to the edit form underneath it — that is
    // what unmounted the InlineConfirm before its confirmation could render.
    // The logged-set readout is still a readout, not an editor.
    expect(screen.getByRole('button', { name: /Set 1:/ })).toBeInTheDocument()
  })

  it('keeps the undo control reachable after cancelling', async () => {
    withLogged()
    fireEvent.click(screen.getByRole('button', { name: /Undo last Plank set/ }))
    await Promise.resolve()
    fireEvent.click(screen.getByRole('button', { name: /^No, keep/ }))
    await Promise.resolve()
    expect(screen.getByRole('button', { name: /Undo last Plank set/ })).toBeInTheDocument()
  })
})

// ── F56 ─────────────────────────────────────────────────────────────────────
// type() falls back to 'reps' whenever props.exercise is undefined, and the
// exercise row is looked up from exercises(), which Workout fills on the LAST
// await of its load. workout.activeAccessories, by contrast, is hydrated
// synchronously from localStorage — so after a reload mid-session the accessory
// renders before its exercise row exists. Logging inside that window writes
// `reps: n, duration: null` for a timed exercise, which accessorySetValue then
// renders as a rep count.
describe('AccessoryLog before its exercise resolves (F56)', () => {
  it('withholds the log controls until the exercise is known', () => {
    render(() => (
      <AccessoryLog accessory={accessory([])} exercise={undefined} />
    ))
    // No control may be offered while the type is a guess.
    expect(screen.queryByRole('button', { name: /^LOG$/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Increase reps/ })).toBeNull()
  })

  it('offers the reps control once a reps exercise resolves', () => {
    render(() => (
      <AccessoryLog
        accessory={accessory([])}
        exercise={{ id: 1, name: 'Plank', type: 'reps', category: 'core' }}
      />
    ))
    expect(screen.getByRole('button', { name: /^LOG$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Increase reps/ })).toBeInTheDocument()
  })

  it('offers the time control, not reps, once a timed exercise resolves', () => {
    render(() => (
      <AccessoryLog
        accessory={accessory([])}
        exercise={{ id: 1, name: 'Plank', type: 'timed', category: 'core' }}
      />
    ))
    expect(screen.queryByRole('button', { name: /Increase reps/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Increase .*minutes/ })).toBeInTheDocument()
  })
})
