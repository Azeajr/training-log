// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import { render, screen } from '@solidjs/testing-library'
import { db } from '../../db/index'
import { __resetForTest } from '../../db/sqlite-client'
import { clearSession } from '../../store/workout-store'
import AccessoryPicker from './AccessoryPicker'

beforeEach(async () => {
  await __resetForTest()
  clearSession()
})

const LIFT_ID = 1

async function seedPullExercises() {
  return {
    chinups:   await db.exercises.add({ name: 'Chinups',       type: 'reps', category: 'pull' }),
    barbell:   await db.exercises.add({ name: 'Barbell Row',   type: 'reps', category: 'pull' }),
    bicep:     await db.exercises.add({ name: 'Bicep Curls',   type: 'reps', category: 'pull' }),
    pulldowns: await db.exercises.add({ name: 'Lat Pulldowns', type: 'reps', category: 'pull' }),
  }
}

async function completedSessionWithAccessory(day: number, exerciseId: number) {
  const sessionId = await db.sessions.add({
    cycleId: 1, liftId: LIFT_ID, week: 1, date: new Date(2026, 0, day), notes: null, status: 'completed',
  })
  await db.accessorySets.add({ sessionId, exerciseId, setNumber: 1, weight: 50, reps: 8, duration: null, distance: null })
}

// Names rendered in the "Used for this lift" group, in DOM order. The group is
// the run of buttons between that header and the "all" divider (which separates
// it from the alphabetical rest).
function usedGroupNames(): string[] {
  const header = screen.getByText('Used for this lift')
  const kids = Array.from(header.parentElement!.children)
  const start = kids.indexOf(header) + 1
  const dividerIdx = kids.findIndex(el => el.textContent?.trim() === 'all')
  const end = dividerIdx === -1 ? kids.length : dividerIdx
  return kids.slice(start, end)
    .filter(el => el.tagName === 'BUTTON')
    .map(el => el.querySelector('span')?.textContent?.replace('✓', '').trim() ?? '')
}

describe('AccessoryPicker — "used for this lift" recency window', () => {
  // Regression: the window is seeded from a lift's most recent sessions, but
  // only COMPLETED sessions carry accessory rows. The in-progress (pending)
  // session is the newest row, so before the completed-filter it consumed one of
  // the ASSISTANCE_SUGGESTION_SESSIONS (3) slots — collapsing the effective
  // history to 2 completed sessions and dropping the third-oldest accessory from
  // the suggestions (and shifting recency ranks off by one).
  it('counts the last 3 COMPLETED sessions, ignoring an in-progress pending session', async () => {
    const ex = await seedPullExercises()
    // Three completed sessions, oldest → newest. Bicep Curls is the third-most-
    // recent completed accessory — the one the pending session used to evict.
    await completedSessionWithAccessory(1, ex.bicep)
    await completedSessionWithAccessory(2, ex.barbell)
    await completedSessionWithAccessory(3, ex.chinups)
    // The current in-progress session: newest, pending, no accessory rows yet.
    await db.sessions.add({
      cycleId: 1, liftId: LIFT_ID, week: 1, date: new Date(2026, 0, 4), notes: null, status: 'pending',
    })

    render(() => <AccessoryPicker slot="pull" liftId={LIFT_ID} onClose={() => {}} />)
    await screen.findByText('Used for this lift')

    // All three completed-session accessories are suggested, newest-first; the
    // never-used Lat Pulldowns stays in the alphabetical rest below the divider.
    expect(usedGroupNames()).toEqual(['Chinups', 'Barbell Row', 'Bicep Curls'])
  })

  it('skipped sessions also do not consume a recency slot', async () => {
    const ex = await seedPullExercises()
    await completedSessionWithAccessory(1, ex.bicep)
    await completedSessionWithAccessory(2, ex.barbell)
    await completedSessionWithAccessory(3, ex.chinups)
    // A skipped session is newer than all completed ones and carries no sets.
    await db.sessions.add({
      cycleId: 1, liftId: LIFT_ID, week: 1, date: new Date(2026, 0, 5), notes: null, status: 'skipped',
    })

    render(() => <AccessoryPicker slot="pull" liftId={LIFT_ID} onClose={() => {}} />)
    await screen.findByText('Used for this lift')

    expect(usedGroupNames()).toContain('Bicep Curls')
  })
})
