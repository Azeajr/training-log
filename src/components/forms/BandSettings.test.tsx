import { afterEach, describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { db } from '../../db'
import { BAND_NAMES, DEFAULT_BANDS, bandProfileFor, clearSeededBandProfiles, defaultBandProfile, effectiveBandLoad } from '../../lib/band-loading'
import { updateSettings } from '../../store/settings-store'
import type { Exercise } from '../../types/domain'
import BandSettings from './BandSettings'
import BandLoadControls from './BandLoadControls'
import type { BandLoad, BandProfile } from '../../types/domain'

// The band chips of one BandLoadControls, found by its group label.
const chips = (group: string) => within(screen.getByRole('group', { name: group })).getAllByRole('button')
const chipNames = (group: string) => chips(group).map(c => c.textContent)
const chip = (group: string, name: string) => within(screen.getByRole('group', { name: group })).getByRole('button', { name })
const pressed = (group: string) => chips(group).filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.textContent)
/** Swap to exactly this band: clear the stack, then put it on. */
const pickOnly = (group: string, name: string) => { fireEvent.click(chip(group, 'NONE')); fireEvent.click(chip(group, name)) }

it('saves raw-load changes with fixed assistance and keeps each exercise independent', async () => {
  const bandProfile = defaultBandProfile('Pull-ups')!
  const id = await db.exercises.add({ name: 'Pull-ups', type: 'reps', bandProfile })
  const other = await db.exercises.add({ name: 'Chin-ups', type: 'reps', bandProfile })
  const [entity, setEntity] = createSignal<Exercise>({ id, name: 'Pull-ups', type: 'reps', bandProfile })
  render(() => <BandSettings entity={entity()} kind="exercise" onSaved={profile => setEntity(e => ({ ...e, bandProfile: profile }))} />)
  fireEvent.click(screen.getByRole('button', { name: 'Band settings for Pull-ups' }))
  fireEvent.click(screen.getByRole('button', { name: 'Increase raw load' }))
  fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect((await db.exercises.get(id))?.bandProfile).toMatchObject({ rawLoad: 192, bands: bandProfile.bands })
  expect((await db.exercises.get(other))?.bandProfile?.rawLoad).toBe(191)
  fireEvent.click(screen.getByRole('button', { name: 'Band settings for Pull-ups' }))
  fireEvent.click(screen.getByRole('button', { name: 'Increase Green measured load' }))
  fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect((await db.exercises.get(id))?.bandProfile?.bands.find(b => b.name === 'Green')?.assistance).toBe(49)
})

describe('BandLoadControls band selection', () => {
  it('re-selecting a band from an older calibration keeps it', () => {
    // The set was logged under a calibration that had a "Blue" band; the
    // profile has since been re-measured and no longer lists it. Picking the
    // "(recorded)" option back has to restore the band AND its assistance —
    // dropping to None silently changes the set's load by 60lb.
    const profile = defaultBandProfile('Chin-ups')!
    const [value, setValue] = createSignal<BandLoad>(
      { bands: ['Blue'], rawLoad: profile.rawLoad, assistance: 60, addedWeight: 0 },
    )
    render(() => (
      <BandLoadControls profile={profile} value={value()} onChange={setValue} label="set 1" />
    ))
    expect(chipNames('set 1 bands')).toContain('Blue (recorded)')

    pickOnly('set 1 bands', 'Green')
    expect(value().bands).toEqual(['Green'])
    pickOnly('set 1 bands', 'Blue (recorded)')
    expect(value()).toMatchObject({ bands: ['Blue'], assistance: 60 })
  })

  it('shows the added weight as singles or pairs according to the lift', () => {
    const profile = defaultBandProfile('Chin-ups')!
    const value = { bands: [], rawLoad: 191, assistance: 0, addedWeight: 50 }
    const belt = render(() => (
      <BandLoadControls profile={profile} value={value} onChange={() => {}}
        loading={{ mode: 'total', base: 0 }} />
    ))
    expect(belt.container.textContent).toContain('plates:')
    expect(belt.container.textContent).not.toContain('each side')
    belt.unmount()

    const bar = render(() => (
      <BandLoadControls profile={profile} value={value} onChange={() => {}}
        loading={{ mode: 'paired', base: 45 }} />
    ))
    // Base is ignored for added weight — the implement is already in rawLoad —
    // but the MODE is not: 50lb added to a bar is 25 a side, not 50 in a stack.
    expect(bar.container.textContent).toContain('each side')
    bar.unmount()
  })
})

describe('band settings state', () => {
  // `defaultBandProfile` is `enabled: true` because that is the shape a user who
  // opts in ends up with. Handing it straight to the draft re-created the
  // name-matching that `bandProfileFor` was fixed to stop doing, one layer up:
  // open the dialog on anything spelled like a chin-up, save any unrelated
  // field, and the weight stepper was replaced by band controls unasked.
  it('starts unticked for a name-matched entity that has never opted in', async () => {
    const id = await db.exercises.add({ name: 'Nordic curls', type: 'reps' })
    render(() => <BandSettings entity={{ id, name: 'Nordic curls', type: 'reps' }} kind="exercise" />)
    fireEvent.click(screen.getByRole('button', { name: 'Band settings for Nordic curls' }))
    const box = screen.getByRole('checkbox', { name: /Use raw load and bands/ }) as HTMLInputElement
    expect(box.checked).toBe(false)
    // The measured calibration still prefills the numbers — it just doesn't
    // answer the question the checkbox asks.
    expect(screen.getByRole('button', { name: 'Edit Orange measured load, currently 70' })).toBeTruthy()

    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await db.exercises.get(id))?.bandProfile).toMatchObject({ enabled: true, rawLoad: 145 })
  })

  /**
   * C6. Every field here opens at 0 for a movement with no template and wants a
   * number in the 70–191 range — 191 taps, or a long press. Tapping the value
   * has always opened a numeric keypad; it rendered as a plain readout nobody
   * thought to press. `emphasized` is what says it is editable.
   */
  it('marks every calibration field as directly editable', async () => {
    // Its own name: this file shares one database and exercise names are unique.
    const id = await db.exercises.add({ name: 'Nordic curl', type: 'reps' })
    render(() => <BandSettings entity={{ id, name: 'Nordic curl', type: 'reps' }} kind="exercise" />)
    fireEvent.click(screen.getByRole('button', { name: 'Band settings for Nordic curl' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Limit suggested added weight/ }))

    const fields = ['raw load', 'Orange measured load', 'Green measured load',
      'Purple measured load', 'Red measured load', 'maximum added weight']
    for (const field of fields) {
      const value = screen.getByRole('button', { name: new RegExp(`^Edit ${field},`) })
      expect(value.className, field).toContain('border-accent')
    }
  })

  /** Steps and bounds are untouched: these are measurements, not increments. */
  it('still moves one pound at a time, and still clamps to the raw load', async () => {
    const id = await db.exercises.add({ name: 'Pullup', type: 'reps' })
    render(() => <BandSettings entity={{ id, name: 'Pullup', type: 'reps' }} kind="exercise" />)
    fireEvent.click(screen.getByRole('button', { name: 'Band settings for Pullup' }))

    // 191 is the pulling calibration's raw load. One tap is still one pound.
    fireEvent.click(screen.getByRole('button', { name: 'Increase raw load' }))
    expect(screen.getByRole('button', { name: /^Edit raw load,/ }).textContent).toBe('192')

    // The measured load still cannot exceed the raw load it is measured
    // against. Raising the raw load holds each band's assistance fixed, so Red
    // followed it from 181 to 182 — ten pounds below the new ceiling, near
    // enough to walk there rather than hammer the button a hundred times, which
    // is slow enough under coverage to time the test out.
    const red = () => screen.getByRole('button', { name: /^Edit Red measured load,/ })
    expect(red().textContent).toBe('182')
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole('button', { name: 'Increase Red measured load' }))
    expect(Number(red().textContent)).toBe(192)
  })

  // The measured stepper clamps what it DISPLAYS to the raw load. Leaving the
  // stored assistance unclamped meant the two disagreed silently: at raw load
  // 100 against 105 of assistance it read 0 while the profile still held 105,
  // so one press of + wrote 100 − 1 = 99 and moved the real value by six.
  it('clamps assistance to the raw load so the stepper and the store agree', async () => {
    const bandProfile = defaultBandProfile('Nordic')!   // rawLoad 145, Orange assistance 75
    const id = await db.exercises.add({ name: 'Nordic', type: 'reps', bandProfile })
    const [entity, setEntity] = createSignal<Exercise>({ id, name: 'Nordic', type: 'reps', bandProfile })
    render(() => <BandSettings entity={entity()} kind="exercise" onSaved={p => setEntity(e => ({ ...e, bandProfile: p }))} />)
    const open = () => fireEvent.click(screen.getByRole('button', { name: 'Band settings for Nordic' }))
    const orange = async () => (await db.exercises.get(id))!.bandProfile!.bands.find(b => b.name === 'Orange')!.assistance
    const save = async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }

    open()
    const dec = screen.getByRole('button', { name: 'Decrease raw load' })
    for (let i = 0; i < 75; i++) fireEvent.click(dec)   // 145 -> 70, under Orange's 75
    await save()
    expect(await orange()).toBe(70)

    // The stepper now reads 0, and one press of + has to move the stored value by one.
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Increase Orange measured load' }))
    await save()
    expect(await orange()).toBe(69)
  })

  it('says so instead of doing nothing when the settings cannot be saved', async () => {
    // An entity with no id has no row to write to. Silently returning left the
    // button looking broken.
    render(() => <BandSettings entity={{ name: 'Ring rows', type: 'reps' }} kind="exercise" />)
    fireEvent.click(screen.getByRole('button', { name: 'Band settings for Ring rows' }))
    fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('editing a set recorded under a superseded calibration', () => {
  // The calibration #162 corrected: estimates 104/48/31/10, measured 105/50/30/10.
  const cal = (n: readonly number[]) => BAND_NAMES.map((name, i) => ({ name, assistance: n[i] }))
  const OLD = cal([104, 48, 31, 10])
  const NOW: BandProfile = { enabled: true, rawLoad: 191, maxAddedWeight: null, bands: cal([105, 50, 30, 10]) }

  const editing = (value: BandLoad) => {
    const [load, setLoad] = createSignal(value)
    render(() => <BandLoadControls profile={NOW} value={load()} onChange={setLoad} />)
    const pick = (b: string) => pickOnly('bands', chipNames('bands').find(n => n?.replace(' (recorded)', '') === b)!)
    return { load, pick }
  }

  it('prices a band change against the calibration the set was recorded under', () => {
    // Logged at 191 − 48 = 143, under the estimates.
    const { load, pick } = editing({ bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0, calibration: OLD })
    expect(effectiveBandLoad(load())).toBe(143)
    // Purple was 31 then and is 30 now. 191 − 31 = 160 is what that set would
    // have been; 191 − 30 = 161 mixes a recorded raw load with a measurement
    // taken afterwards and is a load from neither calibration.
    pick('Purple')
    expect(effectiveBandLoad(load())).toBe(160)
    pick('Green')
    expect(effectiveBandLoad(load())).toBe(143)
  })

  it('keeps the recorded pairing reachable on a row with no calibration', () => {
    // Written before the snapshot existed, so the live profile is all there is
    // to price the OTHER bands with — but the set's own 48 is on the row and
    // has to survive a round trip through the chips.
    const { load, pick } = editing({ bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 })
    expect(chipNames('bands')).toContain('Green (recorded)')
    pick('Purple')
    expect(effectiveBandLoad(load())).toBe(161)   // nothing better than today's 30
    pick('Green')
    expect(effectiveBandLoad(load())).toBe(143)   // the set's own 48, not today's 50
  })

  it('offers each band once when the recorded one is still listed', () => {
    // Two chips reading "Green" are indistinguishable, and `makeBandLoad`
    // resolves by name and would take whichever came first.
    editing({ bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 })
    const names = chipNames('bands').map(n => n!.replace(' (recorded)', ''))
    expect(names).toEqual([...new Set(names)])
    expect(names).toEqual(['NONE', ...BAND_NAMES])
  })

  it('stamps what it resolved, so the row prices itself from then on', () => {
    const { load, pick } = editing({ bands: ['Green'], rawLoad: 191, assistance: 48, addedWeight: 0 })
    pick('Purple')
    expect(load().calibration).toEqual(cal([105, 48, 30, 10]))
  })
})

// The seed undo runs from `seed()` on every start, and it decided provenance
// by comparing against the templates the seeding build could have written.
// Someone who ticks the box and accepts the offered measurements unchanged
// produces those bytes exactly, so their opt-in was read as the seeder's own
// work and undone on the next start: bands on for one session, off after a
// reload, with no indication why.
it('an opt-in survives the boot-time seed undo', async () => {
  const id = await db.exercises.add({ name: 'Chinups', type: 'reps' })
  render(() => <BandSettings entity={{ id, name: 'Chinups', type: 'reps' }} kind="exercise" />)
  fireEvent.click(screen.getByRole('button', { name: 'Band settings for Chinups' }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Use raw load and bands/ }))
  fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

  // Byte-identical to the template it was offered, apart from saying who saved it.
  expect((await db.exercises.get(id))?.bandProfile).toEqual({ ...defaultBandProfile('Chinups')!, accepted: true })
  await clearSeededBandProfiles(db)
  expect(bandProfileFor(await db.exercises.get(id))).not.toBeNull()
})

it('still clears a profile the seeding build wrote', async () => {
  // No flag, template bytes: nobody chose this.
  const id = await db.exercises.add({ name: 'Pullups', type: 'reps', bandProfile: defaultBandProfile('Pullups')! })
  await clearSeededBandProfiles(db)
  expect((await db.exercises.get(id))?.bandProfile).toBeNull()
})

// ── D3 ──────────────────────────────────────────────────────────────────────
// `BAND_NAMES` is four colours with no rename, add or remove in the form, so
// anyone on another brand calibrates four mislabelled rows. The model already
// allowed any name — `BandCalibration.name` is a free string and
// `BandLoadControls` resolves a recorded set by it — only this form did not.
describe('bands come from the equipment', () => {
  // Settings › Equipment owns which bands exist and what they are called; this
  // dialog measures them. Renames and removals live there (BandInventory).
  const openFor = async (name: string, bandProfile?: BandProfile) => {
    const id = await db.exercises.add({ name, type: 'reps', bandProfile })
    render(() => <BandSettings entity={{ id, name, type: 'reps', bandProfile }} kind="exercise" />)
    fireEvent.click(screen.getByRole('button', { name: `Band settings for ${name}` }))
    return id
  }
  const saveSettings = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }
  afterEach(async () => { await updateSettings({ bands: DEFAULT_BANDS }) })

  it('lists the equipment\'s bands in its order, with nothing to rename, add or remove here', async () => {
    await updateSettings({ bands: [{ name: 'Red', count: 1 }, { name: 'Orange', count: 2 }] })
    const id = await openFor('Inventory order', defaultBandProfile('Pull-ups')!)

    const fields = screen.getAllByRole('button', { name: /measured load, currently/ }).map(b => b.getAttribute('aria-label'))
    expect(fields).toEqual(['Edit Red measured load, currently 181', 'Edit Orange measured load, currently 86'])
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByText('+ ADD BAND')).toBeNull()
    expect(screen.queryByText('remove')).toBeNull()

    await saveSettings()
    // Saved in the equipment's order, and only the bands it has.
    expect((await db.exercises.get(id))!.bandProfile!.bands).toEqual([{ name: 'Red', assistance: 10 }, { name: 'Orange', assistance: 105 }])
  })

  it('shows a band new to the equipment as not measured, and saves it unassisting', async () => {
    await updateSettings({ bands: [...DEFAULT_BANDS, { name: 'Blue', count: 1 }] })
    const id = await openFor('New band', { ...defaultBandProfile('Pull-ups')!, accepted: true })

    expect(screen.getByRole('button', { name: 'Edit Blue measured load, currently 191' })).toBeTruthy()
    expect(screen.getAllByText('not measured')).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('Decrease Blue measured load'))
    expect(screen.queryByText('not measured')).toBeNull()

    await saveSettings()
    expect((await db.exercises.get(id))!.bandProfile!.bands.at(-1)).toEqual({ name: 'Blue', assistance: 1 })
  })
})

// A rename changes what is on offer from now on. It says nothing about a set
// that already happened, and the recorded pairing has to stay selectable.
describe('a set recorded under a band that has since been renamed', () => {
  const recorded: BandLoad = {
    bands: ['Green'], rawLoad: 191, assistance: 50, addedWeight: 0,
    calibration: [{ name: 'Orange', assistance: 105 }, { name: 'Green', assistance: 50 }],
  }
  const renamed: BandProfile = {
    enabled: true, rawLoad: 191, maxAddedWeight: null,
    bands: [{ name: 'Orange', assistance: 105 }, { name: 'Olive', assistance: 50 }],
  }

  it('keeps the recorded name, its assistance and its effective load', () => {
    const [value, setValue] = createSignal<BandLoad>(recorded)
    render(() => <BandLoadControls profile={renamed} value={value()} onChange={setValue} />)

    expect(effectiveBandLoad(value())).toBe(141)
    // Marked, because the live profile no longer has a band by that name —
    // the snapshot agrees about the assistance, so nothing else would say so.
    expect(chipNames('bands')).toContain('Green (recorded)')
    expect(pressed('bands')).toEqual(['Green (recorded)'])
  })
})
