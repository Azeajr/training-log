// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import AccessoryLog from './AccessoryLog'
import { defaultBandProfile } from '../../lib/band-loading'
import type { Exercise, BandProfile } from '../../types/domain'
import { workout, addAccessory, clearSession, type ActiveAccessory } from '../../store/workout-store'
import { ACCESSORY_SETS } from '../../lib/calc'

const bandChip = (group: string, name: string) => within(screen.getByRole('group', { name: group })).getByRole('button', { name })
const pressedBands = (group: string) => within(screen.getByRole('group', { name: group })).getAllByRole('button', { pressed: true }).map(c => c.textContent)
/** Swap to exactly this band: clear the stack, then put it on. */
const pickOnly = (group: string, name: string) => { fireEvent.click(bandChip(group, 'NONE')); fireEvent.click(bandChip(group, name)) }

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


describe('assistance completion and drop rounds', () => {
  afterEach(() => { cleanup(); clearSession() })
  const setup = (count = 0) => {
    addAccessory(accessory(Array.from({ length: count }, (_, i) => ({
      setNumber: i + 1, weight: 0, reps: 10, duration: null, distance: null,
    }))))
    return render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={{ ...TIMED, type: 'reps' }} />)
  }

  it('collapses on completion, reopens for an extra set, and collapses again', () => {
    setup(ACCESSORY_SETS - 1)
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(screen.getByRole('button', { name: 'Expand Plank' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: '+ ADD SET' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Plank' }))
    fireEvent.click(screen.getByRole('button', { name: '+ ADD SET' }))
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(ACCESSORY_SETS + 1)
    expect(screen.getByRole('button', { name: 'Expand Plank' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts completed exercises collapsed and reopens when undone below the target', () => {
    setup(ACCESSORY_SETS)
    fireEvent.click(screen.getByRole('button', { name: 'Expand Plank' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo last Plank set' }))
    fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
    expect(screen.getByRole('button', { name: 'LOG' })).toBeVisible()
    expect(screen.queryByText('Complete')).toBeNull()
  })

  it('keeps ordinary weight entry nonnegative', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Decrease weight' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(workout.activeAccessories[0].loggedSets[0].weight).toBe(0)
  })

  it('keeps any number of drop rounds in one set and preserves them when editing', () => {
    setup()
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: '+ ADD DROP ROUND' }))
    fireEvent.click(screen.getByRole('button', { name: 'Increase drop 1 weight' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease drop 2 reps' }))
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
    const sets = () => workout.activeAccessories[0].loggedSets
    expect(sets()).toHaveLength(1)
    expect(sets()[0].dropRounds).toEqual([{ weight: 2.5, reps: 10, bandLoad: null }, { weight: 0, reps: 9, bandLoad: null }, { weight: 0, reps: 10, bandLoad: null }])
    fireEvent.click(screen.getByRole('button', { name: /Set 1:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove drop 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))
    expect(sets()[0].dropRounds).toHaveLength(2)
    expect(sets()[0].dropRounds?.[0].weight).toBe(2.5)
  })
})


it('records band changes per set and per drop round, carrying the last choice forward', () => {
  addAccessory({ ...accessory([]), exerciseName: 'Pull-ups', calculatedWeight: 145 })
  // Bands are opt-in now: the profile is saved on the exercise, not inferred
  // from its name, so the test hands one over the way band settings would.
  const view = render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={{ id: 1, name: 'Pull-ups', type: 'reps', bandProfile: defaultBandProfile('Pull-ups') }} />)
  expect(pressedBands('bands')).toEqual(['Green'])
  pickOnly('bands', 'Purple')
  fireEvent.click(screen.getByRole('button', { name: '+ ADD DROP ROUND' }))
  expect(pressedBands('drop 1 bands')).toEqual(['Purple'])
  pickOnly('drop 1 bands', 'Green')
  fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
  // Suggest opens on Green +2.5 for the prescribed 145, and switching band keeps
  // the plates on the belt: Purple is 191−30+2.5 = 163.5, the round switched
  // back to Green is 191−50+2.5 = 143.5.
  expect(workout.activeAccessories[0].loggedSets[0]).toMatchObject({ weight: 163.5, bandLoad: { bands: ['Purple'], assistance: 30 }, dropRounds: [{ weight: 143.5, bandLoad: { bands: ['Green'] } }] })
  expect(pressedBands('bands')).toEqual(['Purple'])
  view.unmount()
  clearSession()
})

// `weight` only ever moves through `changeBandLoad` here, so when the profile
// went away nothing took it off the last effective load — the stepper came back
// reading the banded figure against the prescription and stayed there.
it('hands the weight back to the prescription when bands are turned off', async () => {
  addAccessory({ ...accessory([]), exerciseName: 'Pull-ups', calculatedWeight: 145 })
  const [profile, setProfile] = createSignal<BandProfile | null>(defaultBandProfile('Pull-ups')!)
  render(() => (
    <AccessoryLog accessory={workout.activeAccessories[0]}
      exercise={{ id: 1, name: 'Pull-ups', type: 'reps', bandProfile: profile() }} />
  ))
  // The headline load, beside the "3x10 @" label — not one of the per-set readouts.
  const header = () => screen.getByText(/x\d+ @$/).nextElementSibling!.textContent!.replace(/[^\d.]/g, '')
  expect(screen.getByRole('group', { name: 'bands' })).toBeInTheDocument()
  expect(header()).not.toBe('145')

  setProfile(null)
  await Promise.resolve()
  expect(screen.queryByRole('group', { name: 'bands' })).not.toBeInTheDocument()
  expect(header()).toBe('145')
})

// ── C2 ──────────────────────────────────────────────────────────────────────
// The `lb ×` separator sat OUTSIDE the Show that swaps the weight stepper for
// BandLoadControls, which ends in its own unit — so a banded row read
// "… = 86lb effective   lb ×   10". The unit belongs to the plain-weight
// branch; the band branch needs the multiplication sign alone.
describe('the load separator carries exactly one unit', () => {
  afterEach(() => { cleanup(); clearSession() })

  const banded = () => ({
    id: 1, name: 'Pull-ups', type: 'reps' as const,
    bandProfile: defaultBandProfile('Pull-ups'),
  })

  /** Text between the load control and the reps control, whitespace normalised. */
  const separatorText = () =>
    (document.body.textContent ?? '').replace(/\s+/g, ' ')

  it('shows no orphan unit after a band summary, in the active row and the editor', () => {
    addAccessory({ ...accessory([]), exerciseName: 'Pull-ups', calculatedWeight: 145 })
    render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={banded()} />)

    expect(separatorText()).toContain('effective')
    expect(separatorText()).not.toMatch(/effective\s*lb/)

    // And again on the edit row of a logged set, which has its own copy.
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
    fireEvent.click(screen.getByRole('button', { name: /Set 1:/ }))
    expect(separatorText()).not.toMatch(/effective\s*lb/)
  })

  it('keeps the unit on a plain-weight row, which has nothing else to carry it', () => {
    addAccessory(accessory([]))
    render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={{ ...TIMED, type: 'reps' }} />)

    // The edit row is where this separator lives; the active row's own weight
    // control is labelled `wt` and carries no separator at all.
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
    fireEvent.click(screen.getByRole('button', { name: /Set 1:/ }))
    expect(separatorText()).toContain('lb ×')
  })

  it('applies to a drop round in both modes', () => {
    addAccessory({ ...accessory([]), exerciseName: 'Pull-ups', calculatedWeight: 145 })
    render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={banded()} />)

    fireEvent.click(screen.getByRole('button', { name: '+ ADD DROP ROUND' }))
    expect(screen.getByRole('group', { name: 'drop 1 bands' })).toBeTruthy()
    expect(separatorText()).not.toMatch(/effective\s*lb/)
  })
})

// ── C1 ──────────────────────────────────────────────────────────────────────
// Every accessory header carried a band shortcut, and a session logs several.
describe('the accessory band shortcut is gated on the profile', () => {
  afterEach(() => { cleanup(); clearSession() })

  it('renders none for an ordinary accessory', () => {
    addAccessory(accessory([]))
    render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={{ ...TIMED, type: 'reps' }} />)

    expect(screen.queryByRole('button', { name: /^Band settings for/ })).toBeNull()
  })

  it('renders one for a band-assisted accessory', () => {
    addAccessory({ ...accessory([]), exerciseName: 'Pull-ups' })
    render(() => (
      <AccessoryLog
        accessory={workout.activeAccessories[0]}
        exercise={{ id: 1, name: 'Pull-ups', type: 'reps', bandProfile: defaultBandProfile('Pull-ups') }}
      />
    ))

    expect(screen.getByRole('button', { name: 'Band settings for Pull-ups' })).toBeTruthy()
  })

  it('renders none when the profile is saved but switched off', () => {
    const off: BandProfile = { ...defaultBandProfile('Pull-ups')!, enabled: false }
    addAccessory({ ...accessory([]), exerciseName: 'Pull-ups' })
    render(() => (
      <AccessoryLog
        accessory={workout.activeAccessories[0]}
        exercise={{ id: 1, name: 'Pull-ups', type: 'reps', bandProfile: off }}
      />
    ))

    expect(screen.queryByRole('button', { name: /^Band settings for/ })).toBeNull()
  })
})

// ── C9 ──────────────────────────────────────────────────────────────────────
// `handleLog` clears the drop configuration after every set — right, because a
// set is a record rather than a template, but it meant re-entering the same
// three-round drop set after set.
describe('copying a drop sequence forward', () => {
  afterEach(() => { cleanup(); clearSession() })

  const setup = (exercise: Exercise = { ...TIMED, type: 'reps' }) => {
    addAccessory(accessory([]))
    return render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={exercise} />)
  }

  const copyButton = () => screen.queryByRole('button', { name: /Copy previous drops|COPY PREVIOUS DROPS/ })

  const logWithDrops = (rounds: number) => {
    for (let i = 0; i < rounds; i++) fireEvent.click(screen.getByRole('button', { name: '+ ADD DROP ROUND' }))
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
  }

  it('is absent until a logged set of this exercise has drop rounds', () => {
    setup()
    expect(copyButton()).toBeNull()

    // A set with no drops leaves nothing to copy.
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))
    expect(copyButton()).toBeNull()
  })

  it('copies the previous set\'s rounds as an editable draft, logging nothing', () => {
    setup()
    logWithDrops(2)
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(1)

    fireEvent.click(copyButton()!)

    // On screen as a draft — two rounds to edit, and still one logged set.
    expect(screen.getByRole('button', { name: 'Remove drop 2' })).toBeTruthy()
    expect(workout.activeAccessories[0].loggedSets).toHaveLength(1)
  })

  it('leaves the set it copied from alone when the copy is edited', () => {
    setup()
    logWithDrops(2)
    fireEvent.click(copyButton()!)

    fireEvent.click(screen.getByRole('button', { name: 'Decrease drop 1 reps' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove drop 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))

    const [first, second] = workout.activeAccessories[0].loggedSets
    expect(first.dropRounds).toHaveLength(2)
    expect(first.dropRounds![0].reps).toBe(10)
    expect(second.dropRounds).toHaveLength(1)
    expect(second.dropRounds![0].reps).toBe(9)
  })

  it('asks before replacing rounds already entered', () => {
    setup()
    logWithDrops(2)
    fireEvent.click(screen.getByRole('button', { name: '+ ADD DROP ROUND' }))
    fireEvent.click(screen.getByRole('button', { name: 'Decrease drop 1 reps' }))

    // Not taken on the first press.
    fireEvent.click(copyButton()!)
    expect(screen.getByText('replace the rounds below?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit drop 1 reps, currently 9' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /^Yes, copy previous drops/i }))
    expect(screen.getByRole('button', { name: 'Remove drop 2' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit drop 1 reps, currently 10' })).toBeTruthy()
  })

  /** A copied band setup is a record of the calibration it was built under. */
  it('gives the copy its own calibration snapshot', () => {
    addAccessory({ ...accessory([]), exerciseName: 'Pull-ups', calculatedWeight: 145 })
    render(() => (
      <AccessoryLog
        accessory={workout.activeAccessories[0]}
        exercise={{ id: 1, name: 'Pull-ups', type: 'reps', bandProfile: defaultBandProfile('Pull-ups') }}
      />
    ))
    logWithDrops(1)

    fireEvent.click(copyButton()!)
    fireEvent.click(screen.getByRole('button', { name: 'LOG' }))

    const [first, second] = workout.activeAccessories[0].loggedSets
    const a = first.dropRounds![0].bandLoad!
    const b = second.dropRounds![0].bandLoad!
    expect(b).toEqual(a)
    expect(b.calibration).not.toBe(a.calibration)
    expect(b.calibration![0]).not.toBe(a.calibration![0])
  })
})

// ── D2 ──────────────────────────────────────────────────────────────────────
// "Log after all drop rounds." was rendered for every reps-measured accessory,
// drop rounds or not — naming a thing that was usually not on screen.
describe('the drop-round instruction', () => {
  afterEach(() => { cleanup(); clearSession() })

  const instruction = () => screen.queryByText('Log after all drop rounds.')

  it('follows the rounds in and out', () => {
    addAccessory(accessory([]))
    render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={{ ...TIMED, type: 'reps' }} />)

    expect(instruction()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '+ ADD DROP ROUND' }))
    expect(instruction()).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove drop 1' }))
    expect(instruction()).toBeNull()
  })

  it('stays away from an accessory that cannot have drop rounds at all', () => {
    addAccessory(accessory([]))
    render(() => <AccessoryLog accessory={workout.activeAccessories[0]} exercise={TIMED} />)

    expect(instruction()).toBeNull()
    expect(screen.queryByRole('button', { name: '+ ADD DROP ROUND' })).toBeNull()
  })
})
