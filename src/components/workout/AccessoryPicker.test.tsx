// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest'
import type { JSX } from 'solid-js'
import { render, screen } from '@solidjs/testing-library'
import { db } from '../../db/index'
import { __resetForTest } from '../../db/sqlite-client'
import { clearSession } from '../../store/workout-store'
import AccessoryPicker from './AccessoryPicker'
import { ConfirmationContext, createConfirmation } from '../../hooks/use-confirmation'
import ConfirmationDialog from '../modals/ConfirmationDialog'

/**
 * The picker asks before discarding a displaced accessory's work, so it needs
 * the confirmation context every screen that renders it already provides.
 */
function renderPicker(element: () => JSX.Element) {
  return render(() => (
    <ConfirmationContext.Provider value={createConfirmation()}>
      {element()}
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

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

    renderPicker(() => <AccessoryPicker slot="pull" liftId={LIFT_ID} onClose={() => {}} />)
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

    renderPicker(() => <AccessoryPicker slot="pull" liftId={LIFT_ID} onClose={() => {}} />)
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
    renderPicker(() => (
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
    renderPicker(() => (
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

// ── A2 ──────────────────────────────────────────────────────────────────────
// Replacing a fixed slot's occupant used to discard its logged sets outright.
// The store now keeps that work as an extra — but the picker decided "already
// added" by presence alone, so a retained exercise was greyed out and the swap
// back could not be performed at all. The store tests call `addAccessory`
// directly and pass either way; only this one sees the feature is unusable.
describe('AccessoryPicker — swapping a fixed slot', () => {
  const openPush = () =>
    renderPicker(() => (
      <AccessoryPicker
        liftId={LIFT_ID} slot="push" mode="session"
        onClose={() => {}} onSelected={() => {}}
      />
    ))

  async function seedPushPair() {
    const dips = await db.exercises.add({ name: 'Dips', type: 'reps', category: 'push' })
    const cgb = await db.exercises.add({ name: 'Close-Grip Bench', type: 'reps', category: 'push' })
    for (const exerciseId of [dips, cgb]) {
      await db.accessoryTrainingMaxes.add({ exerciseId, weight: 100, incrementLb: 5, setAt: new Date() })
    }
    return { dips, cgb }
  }

  const settle = () => new Promise(r => setTimeout(r, 30))

  it('offers a retained exercise back, saying what it is carrying', async () => {
    const { workout, addAccessory, logAccessorySet } = await import('../../store/workout-store')
    const { dips, cgb } = await seedPushPair()

    addAccessory({ exerciseId: dips, exerciseName: 'Dips', tm: 100, calculatedWeight: 60, loggedSets: [], slot: 'push' })
    logAccessorySet(dips, { setNumber: 1, weight: 60, reps: 8 })
    addAccessory({ exerciseId: cgb, exerciseName: 'Close-Grip Bench', tm: 100, calculatedWeight: 60, loggedSets: [], slot: 'push' })

    const view = openPush()
    const row = await screen.findByRole('button', { name: /Dips/ })
    // Selectable, and it says what moving it back would bring with it.
    expect(row).not.toBeDisabled()
    expect(row.textContent).toContain('1 logged set')
    // The current occupant is the one that reads as taken.
    expect(await screen.findByRole('button', { name: /Close-Grip Bench/ })).toBeDisabled()

    row.click()
    await settle()

    const entries = workout.activeAccessories.filter(a => a.exerciseId === dips)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ slot: 'push' })
    expect(entries[0].loggedSets).toHaveLength(1)
    view.unmount()
  })

  it('asks before a swap that would displace logged work, and KEEP retains it', async () => {
    const { workout, addAccessory, logAccessorySet } = await import('../../store/workout-store')
    const { dips, cgb } = await seedPushPair()

    addAccessory({ exerciseId: dips, exerciseName: 'Dips', tm: 100, calculatedWeight: 60, loggedSets: [], slot: 'push' })
    logAccessorySet(dips, { setNumber: 1, weight: 60, reps: 8 })

    const view = openPush()
    ;(await screen.findByRole('button', { name: /Close-Grip Bench/ })).click()

    await screen.findByText(/replaces Dips/)
    expect(document.body.textContent).toContain('1 logged set')
    ;(await screen.findByRole('button', { name: 'KEEP' })).click()
    await settle()

    expect(workout.activeAccessories.find(a => a.exerciseId === dips))
      .toMatchObject({ slot: 'extra' })
    expect(workout.activeAccessories.find(a => a.exerciseId === cgb))
      .toMatchObject({ slot: 'push' })
    view.unmount()
  })

  it('discards the displaced work only when that is chosen outright', async () => {
    const { workout, addAccessory, logAccessorySet } = await import('../../store/workout-store')
    const { dips, cgb } = await seedPushPair()

    addAccessory({ exerciseId: dips, exerciseName: 'Dips', tm: 100, calculatedWeight: 60, loggedSets: [], slot: 'push' })
    logAccessorySet(dips, { setNumber: 1, weight: 60, reps: 8 })

    const view = openPush()
    ;(await screen.findByRole('button', { name: /Close-Grip Bench/ })).click()
    await screen.findByText(/replaces Dips/)
    ;(await screen.findByRole('button', { name: 'DISCARD' })).click()
    await settle()

    expect(workout.activeAccessories.map(a => a.exerciseId)).toEqual([cgb])
    view.unmount()
  })

  /**
   * Dismissing the dialog is neither answer. On a two-button question it would
   * have to land on one of them, and landing on "discard" would destroy logged
   * work by pressing Escape.
   */
  it('abandons the swap when the dialog is dismissed', async () => {
    const { workout, addAccessory, logAccessorySet } = await import('../../store/workout-store')
    const { dips } = await seedPushPair()

    addAccessory({ exerciseId: dips, exerciseName: 'Dips', tm: 100, calculatedWeight: 60, loggedSets: [], slot: 'push' })
    logAccessorySet(dips, { setNumber: 1, weight: 60, reps: 8 })

    const view = openPush()
    ;(await screen.findByRole('button', { name: /Close-Grip Bench/ })).click()
    await screen.findByText(/replaces Dips/)
    ;(await screen.findByRole('button', { name: 'BACK' })).click()
    await settle()

    expect(workout.activeAccessories.map(a => a.exerciseId)).toEqual([dips])
    expect(workout.activeAccessories[0]).toMatchObject({ slot: 'push' })
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(1)
    view.unmount()
  })

  it('does not ask when the displaced exercise recorded nothing', async () => {
    const { workout, addAccessory } = await import('../../store/workout-store')
    const { dips, cgb } = await seedPushPair()

    addAccessory({ exerciseId: dips, exerciseName: 'Dips', tm: 100, calculatedWeight: 60, loggedSets: [], slot: 'push' })

    const view = openPush()
    ;(await screen.findByRole('button', { name: /Close-Grip Bench/ })).click()
    await settle()

    expect(screen.queryByText(/replaces Dips/)).toBeNull()
    expect(workout.activeAccessories.map(a => a.exerciseId)).toEqual([cgb])
    view.unmount()
  })
})
