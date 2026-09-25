// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@solidjs/testing-library'
import BandInventory from './BandInventory'
import ConfirmationDialog from '../modals/ConfirmationDialog'
import { ConfirmationContext, createConfirmation } from '../../hooks/use-confirmation'
import { db } from '../../db'
import { __resetForTest } from '../../db/sqlite-client'
import { DEFAULT_BANDS, defaultBandProfile } from '../../lib/band-loading'
import { loadSettings, settings } from '../../store/settings-store'
import type { BandInventoryItem } from '../../types/domain'

const stored = async () => (await db.settings.toCollection().first())?.bands

async function setUp(bands: BandInventoryItem[] = DEFAULT_BANDS) {
  cleanup()
  await __resetForTest()
  await db.settings.add({ restTimer1: 90, restTimer2: 180, restTimerFail: 300, bands })
  await loadSettings()
  const onChanged = vi.fn()
  render(() => (
    <ConfirmationContext.Provider value={createConfirmation()}>
      <BandInventory onChanged={onChanged} />
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
  return onChanged
}

const rename = (band: string) => fireEvent.click(screen.getByRole('button', { name: `Rename ${band}` }))

describe('Settings › Equipment › Bands', () => {
  beforeEach(() => cleanup())

  it('counts each band, writing straight through like the plates', async () => {
    await setUp()
    fireEvent.click(screen.getByLabelText('Increase Green count'))
    await waitFor(async () => expect((await stored())?.find(b => b.name === 'Green')?.count).toBe(2))
    expect(settings.bands.find(b => b.name === 'Green')?.count).toBe(2)
    // Down to 0 keeps the band; it is only put aside.
    fireEvent.click(screen.getByLabelText('Decrease Red count'))
    await waitFor(async () => expect((await stored())?.find(b => b.name === 'Red')?.count).toBe(0))
  })

  it('renames a band in the equipment and in every movement that measures it', async () => {
    const onChanged = await setUp()
    const liftId = await db.lifts.add({ name: 'Chin-ups', order: 1, progressionIncrement: 5, baseWeight: 0, liftType: 'upper',
      bandProfile: { ...defaultBandProfile('Chin-ups')!, accepted: true } })

    rename('Green')
    fireEvent.input(screen.getByLabelText('new name for Green'), { target: { value: 'Olive' } })
    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect((await stored())?.map(b => b.name)).toEqual(['Orange', 'Olive', 'Purple', 'Red'])
    expect(settings.bands.map(b => b.name)).toEqual(['Orange', 'Olive', 'Purple', 'Red'])
    expect((await db.lifts.get(liftId))?.bandProfile?.bands[1]).toEqual({ name: 'Olive', assistance: 50 })
  })

  it('refuses a name another band has, while it is typed', async () => {
    await setUp()
    rename('Green')
    fireEvent.input(screen.getByLabelText('new name for Green'), { target: { value: ' orange' } })
    expect(screen.getByRole('alert').textContent).toMatch(/cannot share a name/)
    expect(screen.getByRole('button', { name: 'SAVE' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('adds a band, one of it, and refuses a blank or taken name', async () => {
    await setUp()
    fireEvent.click(screen.getByRole('button', { name: '+ ADD BAND' }))
    // Nothing typed yet is not an error yet, but it is not a band either.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'ADD' })).toBeDisabled()
    fireEvent.input(screen.getByLabelText('new band name'), { target: { value: 'RED' } })
    expect(screen.getByRole('alert').textContent).toMatch(/cannot share a name/)

    fireEvent.input(screen.getByLabelText('new band name'), { target: { value: '  Blue ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ADD' }))
    await waitFor(async () => expect((await stored())?.at(-1)).toEqual({ name: 'Blue', count: 1 }))
    expect(screen.getByText('Blue', { selector: 'span' })).toBeTruthy()
  })

  it('removes a band and its measurements only once confirmed', async () => {
    await setUp()
    const exId = await db.exercises.add({ name: 'Nordic curls', type: 'reps',
      bandProfile: { ...defaultBandProfile('Nordic curls')!, accepted: true } })
    const removeRed = () => fireEvent.click(screen.getByRole('button', { name: 'Remove Red' }))

    removeRed()
    fireEvent.click(await screen.findByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await stored())?.map(b => b.name)).toContain('Red')

    removeRed()
    expect((await screen.findByRole('dialog')).textContent).toMatch(/count to 0/)
    fireEvent.click(screen.getByRole('button', { name: 'REMOVE' }))
    await waitFor(async () => expect((await stored())?.map(b => b.name)).toEqual(['Orange', 'Green', 'Purple']))
    expect((await db.exercises.get(exId))?.bandProfile?.bands.map(b => b.name)).toEqual(['Orange', 'Green', 'Purple'])
  })
})
