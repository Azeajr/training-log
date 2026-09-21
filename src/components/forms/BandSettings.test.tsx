import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { db } from '../../db'
import { BAND_NAMES, bandProfileFor, clearSeededBandProfiles, defaultBandProfile, effectiveBandLoad } from '../../lib/band-loading'
import type { Exercise } from '../../types/domain'
import BandSettings from './BandSettings'
import BandLoadControls from './BandLoadControls'
import type { BandLoad, BandProfile } from '../../types/domain'

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
      { band: 'Blue', rawLoad: profile.rawLoad, assistance: 60, addedWeight: 0 },
    )
    const { getByLabelText } = render(() => (
      <BandLoadControls profile={profile} value={value()} onChange={setValue} label="set 1" />
    ))
    const select = getByLabelText('set 1 band') as HTMLSelectElement
    expect([...select.options].map(o => o.textContent)).toContain('Blue (recorded)')

    fireEvent.change(select, { target: { value: 'Green' } })
    expect(value().band).toBe('Green')
    fireEvent.change(select, { target: { value: 'Blue' } })
    expect(value()).toMatchObject({ band: 'Blue', assistance: 60 })
  })

  it('shows the added weight as singles or pairs according to the lift', () => {
    const profile = defaultBandProfile('Chin-ups')!
    const value = { band: null, rawLoad: 191, assistance: 0, addedWeight: 50 }
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
    expect(screen.getByText('Orange measured lb')).toBeInTheDocument()

    fireEvent.click(box)
    fireEvent.click(screen.getByRole('button', { name: 'SAVE BAND SETTINGS' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await db.exercises.get(id))?.bandProfile).toMatchObject({ enabled: true, rawLoad: 145 })
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
    const view = render(() => <BandLoadControls profile={NOW} value={load()} onChange={setLoad} />)
    const select = view.getByLabelText('band') as HTMLSelectElement
    return { load, select, pick: (b: string) => fireEvent.change(select, { target: { value: b } }) }
  }

  it('prices a band change against the calibration the set was recorded under', () => {
    // Logged at 191 − 48 = 143, under the estimates.
    const { load, pick } = editing({ band: 'Green', rawLoad: 191, assistance: 48, addedWeight: 0, calibration: OLD })
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
    // has to survive a round trip through the dropdown.
    const { load, select, pick } = editing({ band: 'Green', rawLoad: 191, assistance: 48, addedWeight: 0 })
    expect([...select.options].map(o => o.textContent)).toContain('Green (recorded)')
    pick('Purple')
    expect(effectiveBandLoad(load())).toBe(161)   // nothing better than today's 30
    pick('Green')
    expect(effectiveBandLoad(load())).toBe(143)   // the set's own 48, not today's 50
  })

  it('offers each band once when the recorded one is still listed', () => {
    // Two options reading "Green" are indistinguishable, and `makeBandLoad`
    // resolves by name and would take whichever came first.
    const { select } = editing({ band: 'Green', rawLoad: 191, assistance: 48, addedWeight: 0 })
    const names = [...select.options].map(o => o.textContent!.replace(' (recorded)', ''))
    expect(names).toEqual([...new Set(names)])
    expect(names).toEqual(['None', ...BAND_NAMES])
  })

  it('stamps what it resolved, so the row prices itself from then on', () => {
    const { load, pick } = editing({ band: 'Green', rawLoad: 191, assistance: 48, addedWeight: 0 })
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
