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
