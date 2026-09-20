import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { db } from '../../db'
import { defaultBandProfile } from '../../lib/band-loading'
import type { Exercise } from '../../types/domain'
import BandSettings from './BandSettings'
import BandLoadControls from './BandLoadControls'
import type { BandLoad } from '../../types/domain'

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
  expect((await db.exercises.get(id))?.bandProfile?.bands.find(b => b.name === 'Green')?.assistance).toBe(47)
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
