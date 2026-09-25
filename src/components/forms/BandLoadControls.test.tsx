// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { render, screen, fireEvent, cleanup, within } from '@solidjs/testing-library'
import BandLoadControls from './BandLoadControls'
import { defaultBandProfile, effectiveBandLoad, makeBandLoad } from '../../lib/band-loading'
import { db } from '../../db/index'
import { loadSettings, updateSettings } from '../../store/settings-store'
import type { BandLoad, BandProfile } from '../../types/domain'

// Orange 86, Green 141, Purple 161, Red 181, unassisted 191.
const pulling = (over: Partial<BandProfile> = {}): BandProfile => ({ ...defaultBandProfile('Pull-ups')!, ...over })
// Green 141, Purple 161, both 111. Four bands stack into nearly every load,
// which leaves no gap for a test about gaps to point at.
const twoBands = (over: Partial<BandProfile> = {}): BandProfile =>
  pulling({ bands: pulling().bands.filter(b => b.name === 'Green' || b.name === 'Purple'), ...over })

beforeEach(async () => {
  cleanup()
  await db.settings.clear()
  // 45/10/5/2.5 pairs — 125lb of plate in total.
  await db.settings.add({
    id: 1, restTimer1: 90, restTimer2: 180, restTimerFail: 300,
    plates: [{ weight: 45, count: 2 }, { weight: 10, count: 2 }, { weight: 5, count: 2 }, { weight: 2.5, count: 2 }],
  })
  await loadSettings()
})

function renderControls(options: {
  profile?: BandProfile | null
  value?: BandLoad
  target?: number
  onSuggest?: (target: number) => void
}) {
  const profile = options.profile === undefined ? pulling() : options.profile
  const [value, setValue] = createSignal<BandLoad>(options.value ?? makeBandLoad(pulling(), ['Green']))
  render(() => (
    <BandLoadControls
      profile={profile}
      value={value()}
      target={options.target}
      onSuggest={options.onSuggest}
      onChange={setValue}
    />
  ))
  return { value }
}

const body = () => (document.body.textContent ?? '').replace(/\s+/g, ' ')

// ── B3 ──────────────────────────────────────────────────────────────────────
// A 45lb prescription rendered next to an 86lb suggestion and a button that
// cannot close the gap: only bands take load off, so nothing below the
// strongest stack's assisted load is reachable however the plates are arranged.
describe('BandLoadControls — why the suggestion is where it is', () => {
  it('says nothing when the target is reachable exactly', () => {
    renderControls({ target: 141, onSuggest: () => {} })

    expect(body()).not.toMatch(/not reachable/)
    expect(body()).not.toMatch(/Nearest available/)
    expect(body()).not.toMatch(/Simpler setup/)
    expect(screen.getByText('USE SUGGESTED LOAD')).toBeTruthy()
  })

  it('names the lightest load for a target below everything achievable', () => {
    renderControls({ profile: twoBands(), value: makeBandLoad(twoBands(), ['Green']), target: 45, onSuggest: () => {} })

    expect(body()).toContain('Lightest available 111lb')
    expect(body()).toContain('45lb is not reachable')
    // The button cannot close that gap, so it is not offered.
    expect(screen.queryByText('USE SUGGESTED LOAD')).toBeNull()
  })

  it('names the heaviest load for a target above everything achievable', () => {
    renderControls({ target: 500, onSuggest: () => {} })

    expect(body()).toContain('Heaviest available 316lb')
    expect(screen.queryByText('USE SUGGESTED LOAD')).toBeNull()
  })

  /**
   * The two reasons are independent and both can apply. The tolerance rule is
   * `closest + 2.5`, not `target ± 2.5`, so a selection can be deliberately
   * further away than the nearest candidate — that is a note, never a warning.
   */
  it('reports an increment gap and a preference tradeoff separately', () => {
    renderControls({ profile: twoBands({ maxAddedWeight: 0 }), value: makeBandLoad(twoBands(), ['Green']), target: 150, onSuggest: () => {} })

    expect(body()).toContain('Nearest available 141lb (9lb under)')
    expect(body()).toContain('Simpler setup, 11lb over')
    // In range, so the suggestion is still on offer.
    expect(screen.getByText('USE SUGGESTED LOAD')).toBeTruthy()
  })

  it('says which side of the target the nearest load falls on', () => {
    renderControls({ profile: twoBands({ maxAddedWeight: 0 }), value: makeBandLoad(twoBands(), ['Green']), target: 158, onSuggest: () => {} })
    expect(body()).toContain('Nearest available 161lb (3lb over)')
  })
})

// ── C3 ──────────────────────────────────────────────────────────────────────
// `target` / `onSuggest` reached exactly two call sites. Everywhere else — both
// edit rows, all four history branches and drop rounds — rendered neither.
describe('BandLoadControls — asking for a load where nothing prescribed one', () => {
  it('shows no prescribed target when none was passed', () => {
    renderControls({ onSuggest: () => {} })

    expect(body()).not.toMatch(/Prescribed/)
    expect(body()).not.toMatch(/Target effective load/)
  })

  it('takes a target the user names, and only then', () => {
    const onSuggest = vi.fn()
    renderControls({ onSuggest })

    // Nothing on offer until asked for.
    expect(screen.queryByText('USE SUGGESTED LOAD')).toBeNull()
    fireEvent.click(screen.getByText('SUGGEST A LOAD…'))

    expect(body()).toContain('Target effective load')
    // Seeded from the load on screen rather than from a prescription nobody set.
    expect(screen.getByRole('button', { name: /^Edit target effective load,/ }).textContent).toBe('141')

    fireEvent.click(screen.getByLabelText('Increase target effective load'))
    fireEvent.click(screen.getByText('USE SUGGESTED LOAD'))
    expect(onSuggest).toHaveBeenCalledWith(143.5)
  })

  it('explains an unreachable target the user named, and withholds the button', () => {
    renderControls({ profile: twoBands(), onSuggest: () => {}, value: makeBandLoad(twoBands(), ['Green']) })

    fireEvent.click(screen.getByText('SUGGEST A LOAD…'))
    // 141 down to 91, below both bands on.
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByLabelText('Decrease target effective load'))

    expect(body()).toContain('Lightest available 111lb')
    expect(screen.queryByText('USE SUGGESTED LOAD')).toBeNull()
  })

  it('renders no suggestion affordance at all without a profile', () => {
    renderControls({ profile: null, onSuggest: undefined })

    expect(screen.queryByText('SUGGEST A LOAD…')).toBeNull()
    expect(screen.queryByText('USE SUGGESTED LOAD')).toBeNull()
  })

  /** Rendering the control must never write to the record it is describing. */
  it('leaves the load untouched until the suggestion is taken', () => {
    const { value } = renderControls({ target: 45, onSuggest: () => {} })
    const before = { ...value() }

    fireEvent.click(screen.getByLabelText('Increase added weight'))
    expect(value()).toMatchObject({ bands: before.bands, assistance: before.assistance })
    expect(effectiveBandLoad(value())).toBe(effectiveBandLoad(before) + 2.5)
  })
})

describe('BandLoadControls — stacking bands', () => {
  const chip = (name: string) => within(screen.getByRole('group', { name: 'bands' })).getByRole('button', { name })
  const pressed = () => within(screen.getByRole('group', { name: 'bands' }))
    .getAllByRole('button', { pressed: true }).map(c => c.textContent)

  it('puts a second band on beside the first, and takes either off again', () => {
    const { value } = renderControls({})
    expect(pressed()).toEqual(['Green'])

    fireEvent.click(chip('Purple'))
    expect(value()).toMatchObject({ bands: ['Green', 'Purple'], assistance: 80 })
    expect(pressed()).toEqual(['Green', 'Purple'])
    expect(body()).toContain('assistance 80lb')
    expect(body()).toContain('= 111lb effective')

    fireEvent.click(chip('Green'))
    expect(value()).toMatchObject({ bands: ['Purple'], assistance: 30 })
  })

  it('keeps calibration order whichever band went on first', () => {
    const { value } = renderControls({ value: makeBandLoad(pulling(), ['Red']) })
    fireEvent.click(chip('Orange'))
    expect(value().bands).toEqual(['Orange', 'Red'])
  })

  it('takes every band off with NONE, keeping the plates', () => {
    const { value } = renderControls({ value: makeBandLoad(pulling(), ['Green', 'Purple'], 5) })
    expect(chip('NONE').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip('NONE'))
    expect(value()).toMatchObject({ bands: [], assistance: 0, addedWeight: 5 })
    expect(chip('NONE').getAttribute('aria-pressed')).toBe('true')
  })

  it('puts on as many of a band as you own, one per tap, then takes them all off', async () => {
    await updateSettings({ bands: [{ name: 'Orange', count: 1 }, { name: 'Green', count: 2 }, { name: 'Purple', count: 1 }, { name: 'Red', count: 1 }] })
    const { value } = renderControls({ value: makeBandLoad(pulling(), []) })

    fireEvent.click(chip('Green'))
    expect(value().bands).toEqual(['Green'])
    fireEvent.click(chip('Green'))
    expect(value()).toMatchObject({ bands: ['Green', 'Green'], assistance: 100 })
    expect(pressed()).toEqual(['Green ×2'])
    fireEvent.click(chip('Green ×2'))
    expect(value().bands).toEqual([])
    // One of a band is still just on and off.
    fireEvent.click(chip('Red'))
    fireEvent.click(chip('Red'))
    expect(value().bands).toEqual([])
  })

  it('offers only bands you own, but always the ones a set already has', async () => {
    await updateSettings({ bands: [{ name: 'Orange', count: 0 }, { name: 'Green', count: 1 }, { name: 'Purple', count: 1 }] })
    renderControls({ value: makeBandLoad(pulling(), ['Green']) })
    const names = () => within(screen.getByRole('group', { name: 'bands' })).getAllByRole('button').map(c => c.textContent)
    // Orange is put aside and Red is not in the equipment at all.
    expect(names()).toEqual(['NONE', 'Green', 'Purple'])
    cleanup()

    // A finished set with two Reds on keeps both reachable, and can still
    // cycle to two, though the equipment has none now.
    const { value } = renderControls({ value: makeBandLoad(pulling(), ['Red', 'Red']) })
    expect(names()).toContain('Red ×2')
    fireEvent.click(chip('Red ×2'))
    fireEvent.click(chip('Red'))
    fireEvent.click(chip('Red'))
    expect(value().bands).toEqual(['Red', 'Red'])
  })

  it('prices a stack on a finished set from the calibration it was recorded under', () => {
    // Recorded under the estimates, Green 48 and Purple 31; measured since as 50 and 30.
    const old = pulling({ bands: pulling().bands.map(b => ({ ...b, assistance: ({ Green: 48, Purple: 31 } as Record<string, number>)[b.name] ?? b.assistance })) })
    const { value } = renderControls({ value: makeBandLoad(old, ['Green']) })
    fireEvent.click(chip('Purple'))
    expect(value().assistance).toBe(79)
  })
})
