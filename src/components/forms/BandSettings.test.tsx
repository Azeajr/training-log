import { it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { db } from '../../db'
import { defaultBandProfile } from '../../lib/band-loading'
import type { Exercise } from '../../types/domain'
import BandSettings from './BandSettings'

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
