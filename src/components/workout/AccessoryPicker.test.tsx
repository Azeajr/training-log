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

// ── F55 ─────────────────────────────────────────────────────────────────────
// Neither commit path had an in-flight guard, and both are async handlers wired
// straight to onClick. SAVE wrote one accessoryTrainingMaxes row per tap, and
// the row-select guard read an `alreadyAdded` flag baked into rows() at load
// time, so it could not see an add made by the previous tap.
describe('AccessoryPicker single flight', () => {
  const open = (slot: 'push' | 'pull' | 'extra' = 'pull') =>
    render(() => (
      <AccessoryPicker
        liftId={LIFT_ID} slot={slot} mode="session"
        onClose={() => {}} onSelected={() => {}}
      />
    ))

  it('adds an exercise once for repeated taps on its row (F55)', async () => {
    const { chinups } = await seedPullExercises()
    await db.accessoryTrainingMaxes.add({
      exerciseId: chinups, weight: 100, incrementLb: 5, setAt: new Date(),
    })
    // 'extra' rather than a fixed slot: addAccessory filters a fixed slot, so a
    // duplicate collapses there and hides the bug. 'extra' appends.
    open('extra')
    const row = await screen.findByRole('button', { name: /Chinups/ })
    row.click(); row.click(); row.click()
    await new Promise(r => setTimeout(r, 30))

    const { workout } = await import('../../store/workout-store')
    const added = workout.activeAccessories.filter(a => a.exerciseId === chinups)
    expect(added).toHaveLength(1)
  })

  it('writes one training max for repeated taps on SAVE (F55)', async () => {
    const { chinups } = await seedPullExercises()
    open()
    // No TM yet, so picking opens the SET TRAINING MAX sub-sheet.
    ;(await screen.findByRole('button', { name: /Chinups/ })).click()
    const save = await screen.findByRole('button', { name: /^SAVE$/i })
    save.click(); save.click(); save.click()
    await new Promise(r => setTimeout(r, 30))

    const rows = await db.accessoryTrainingMaxes.where('exerciseId').equals(chinups).toArray()
    expect(rows).toHaveLength(1)
  })
})

// ── F54 ─────────────────────────────────────────────────────────────────────
// The SET TRAINING MAX sub-sheet's buffer is component-level state that was
// never reset when `settingTm` changed, and the sheet's documented way out —
// Escape, which returns to the list rather than closing the picker — left it
// dirty. SAVE then wrote the carried-over number as the new exercise's TM, and
// an accessory TM drives every prescribed weight for that exercise from then
// on, so a wrong one is not self-correcting.
describe('AccessoryPicker TM sub-sheet buffer', () => {
  it('does not carry a dialled TM over to a different exercise (F54)', async () => {
    const { chinups, barbell } = await seedPullExercises()
    render(() => (
      <AccessoryPicker
        liftId={LIFT_ID} slot="pull" mode="session"
        onClose={() => {}} onSelected={() => {}}
      />
    ))

    // Pick one with no TM — opens the sub-sheet — and dial its weight up.
    ;(await screen.findByRole('button', { name: /Chinups/ })).click()
    const bump = await screen.findByRole('button', { name: 'Increase training max' })
    bump.click(); bump.click()
    await new Promise(r => setTimeout(r, 10))

    // Back out to the list and pick a DIFFERENT exercise.
    const back = await screen.findByRole('button', { name: '← BACK' })
    back.click()
    ;(await screen.findByRole('button', { name: /Barbell Row/ })).click()
    await new Promise(r => setTimeout(r, 10))

    // A fresh pick starts at 0, which is what makes a carried-over non-zero
    // value look like a real suggestion.
    const save = await screen.findByRole('button', { name: /^SAVE$/i })
    save.click()
    await new Promise(r => setTimeout(r, 30))

    const rows = await db.accessoryTrainingMaxes.where('exerciseId').equals(barbell).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].weight).toBe(0)
    expect(await db.accessoryTrainingMaxes.where('exerciseId').equals(chinups).toArray()).toHaveLength(0)
  })
})
