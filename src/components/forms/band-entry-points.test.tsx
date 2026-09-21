// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@solidjs/testing-library'
import { Router, Route } from '@solidjs/router'
import { db } from '../../db/index'
import { defaultBandProfile } from '../../lib/band-loading'
import { clearSession, startSession, addAccessory, type ActiveAccessory } from '../../store/workout-store'
import { loadSettings } from '../../store/settings-store'
import { ConfirmationContext, createConfirmation } from '../../hooks/use-confirmation'
import ConfirmationDialog from '../modals/ConfirmationDialog'
import Workout from '../../screens/Workout'
import Settings from '../../screens/Settings'
import CrossBlockLog from '../workout/CrossBlockLog'
import AccessoryLog from '../workout/AccessoryLog'
import type { BandProfile, Exercise, Lift, Session } from '../../types/domain'

vi.mock('@solidjs/router', async () => {
  const actual = await vi.importActual<typeof import('@solidjs/router')>('@solidjs/router')
  return { ...actual, useNavigate: () => vi.fn() }
})

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

/**
 * The three profile states the entry points have to agree within.
 *
 * `disabled` is a profile the user saved and then switched off; `absent` is a
 * movement that has never been configured. They differ for the gates (C1 hides
 * the three logging shortcuts in both) and, for the label, only presence counts.
 */
type ProfileState = 'enabled' | 'disabled' | 'absent'

const profileFor = (state: ProfileState, name: string): BandProfile | undefined => {
  if (state === 'absent') return undefined
  const p = defaultBandProfile(name)!
  return state === 'enabled' ? p : { ...p, enabled: false }
}

const SESSION: Session = {
  id: 1, cycleId: 1, liftId: 1, week: 1,
  date: new Date('2026-01-06'), notes: null, status: 'pending',
}

const accessory = (): ActiveAccessory => ({
  exerciseId: 10, exerciseName: 'Chin-ups', slot: 'pull',
  tm: 100, calculatedWeight: 100, loggedSets: [],
})

function withConfirmation(node: () => unknown) {
  return render(() => (
    <ConfirmationContext.Provider value={createConfirmation()}>
      {node() as never}
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

/**
 * Every band entry point this render put on the page, as its visible label.
 *
 * By label rather than by role: Settings puts its lists inside collapsible
 * sections, and a role query drops whatever is currently folded away. Whether a
 * section happens to be open is not what this is measuring.
 */
const renderedEntryPoints = () =>
  screen.queryAllByLabelText(/^Band settings for/)
    .map(el => el.textContent!.trim())

/**
 * Render all five real call sites for one profile state and collect what each
 * one shows.
 *
 * The call sites themselves, deliberately. Rendering five isolated
 * `BandSettings` instances would prove nothing about the gates, and before the
 * label was derived it would have proved nothing about the label either — five
 * components handed the same prop agree by construction, including when the app
 * disagrees.
 */
async function renderVisibleEntryPoints(state: ProfileState): Promise<string[]> {
  const liftProfile = profileFor(state, 'Chin-ups')
  const exerciseProfile = profileFor(state, 'Chin-ups')

  await db.lifts.add({ id: 1, name: 'Chin-ups', order: 1, progressionIncrement: 5, baseWeight: 95, liftType: 'upper', bandProfile: liftProfile })
  await db.exercises.add({ id: 10, name: 'Chin-ups accessory', type: 'reps', bandProfile: exerciseProfile })
  await db.cycles.add({ id: 1, number: 1, startDate: new Date(), endDate: null })
  await db.trainingMaxes.add({ liftId: 1, weight: 200, setAt: new Date() })
  await db.sessions.add(SESSION)
  await db.settings.add({ id: 1, restTimer1: 90, restTimer2: 180, restTimerFail: 300, supplementalTemplate: 'fsl+bbb' })
  await loadSettings()

  const lift = (await db.lifts.get(1))! as Lift
  const exercise = (await db.exercises.get(10))! as Exercise

  const labels: string[] = []

  // 1. The Workout screen's own-lift shortcut.
  startSession(SESSION)
  withConfirmation(() => (
    <Router><Route path="*" component={Workout} /></Router>
  ))
  await screen.findByText('WARM UP')
  await drain()
  labels.push(...renderedEntryPoints())
  cleanup()
  clearSession()

  // 2. A cross block.
  render(() => (
    <CrossBlockLog
      label="CROSS" sets={[]} cursor={0} logged={[]} movement={lift}
      onLog={() => {}} onEdit={() => {}} onDelete={() => {}}
    />
  ))
  labels.push(...renderedEntryPoints())
  cleanup()

  // 3. An accessory header.
  addAccessory(accessory())
  render(() => <AccessoryLog accessory={accessory()} exercise={exercise} />)
  labels.push(...renderedEntryPoints())
  cleanup()
  clearSession()

  // 4 and 5. Both Settings rows — the lift list and the exercise list.
  withConfirmation(() => <Settings />)
  await screen.findByText(/LIFTS/)
  await drain()
  labels.push(...renderedEntryPoints())
  cleanup()

  return labels
}

beforeEach(async () => {
  clearSession()
  await Promise.all([
    db.lifts.clear(), db.exercises.clear(), db.cycles.clear(),
    db.sessions.clear(), db.sets.clear(), db.trainingMaxes.clear(),
    db.accessorySets.clear(), db.accessoryNotes.clear(),
    db.accessoryTrainingMaxes.clear(), db.liftSupplementals.clear(),
    db.settings.clear(),
  ])
})

afterEach(async () => { cleanup(); clearSession(); await drain() })

// ── D1 ──────────────────────────────────────────────────────────────────────
// One dialog, three labels: `bands` in Settings and on an accessory,
// `EDIT RAW LOAD / BANDS` on Workout and a cross block, and a component default
// of `BAND / RAW LOAD` that nothing ever reached. The defect is the divergence,
// so these assert the invariant rather than the words.
describe('band settings entry points', () => {
  // Stated outright rather than derived from the gates, so an accidental change
  // to either has to disagree with something. A deliberate policy change edits
  // this line as well as the gate, and that friction is the point.
  const expectedEntryPointCount = { enabled: 5, disabled: 2, absent: 2 } as const

  for (const state of ['enabled', 'disabled', 'absent'] as const) {
    it(`agrees across every visible entry point with a ${state} profile`, async () => {
      const labels = await renderVisibleEntryPoints(state)

      expect(labels).toHaveLength(expectedEntryPointCount[state])
      expect(new Set(labels).size).toBe(1)
    })
  }

  /** "EDIT" was wrong on a movement with no profile: nothing to edit yet. */
  it('never offers to edit a profile that does not exist', async () => {
    const labels = await renderVisibleEntryPoints('absent')

    expect(labels).toHaveLength(2)
    for (const label of labels) expect(label).not.toMatch(/edit/i)
  })

  /**
   * The wording depends on whether a profile exists, so the two must differ —
   * not what either one says. A saved-but-disabled profile is an existing one.
   */
  it('names setting a profile up differently from editing one', async () => {
    const absent = await renderVisibleEntryPoints('absent')
    await afterEachReset()
    const disabled = await renderVisibleEntryPoints('disabled')

    expect(absent[0]).not.toBe(disabled[0])
  })

  async function afterEachReset() {
    cleanup()
    clearSession()
    await Promise.all([
      db.lifts.clear(), db.exercises.clear(), db.cycles.clear(),
      db.sessions.clear(), db.sets.clear(), db.trainingMaxes.clear(),
      db.settings.clear(),
    ])
  }
})
