// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { render, screen, fireEvent, cleanup } from '@solidjs/testing-library'
import BandLoadControls from './BandLoadControls'
import { defaultBandProfile, effectiveBandLoad, makeBandLoad } from '../../lib/band-loading'
import { db } from '../../db/index'
import { loadSettings } from '../../store/settings-store'
import type { BandLoad, BandProfile } from '../../types/domain'

// Orange 86, Green 141, Purple 161, Red 181, unassisted 191.
const pulling = (over: Partial<BandProfile> = {}): BandProfile => ({ ...defaultBandProfile('Pull-ups')!, ...over })

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
  const [value, setValue] = createSignal<BandLoad>(options.value ?? makeBandLoad(pulling(), 'Green'))
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
// cannot close the gap: only a band takes load off, so nothing below the
// strongest band's assisted load is reachable however the plates are arranged.
describe('BandLoadControls — why the suggestion is where it is', () => {
  it('says nothing when the target is reachable exactly', () => {
    renderControls({ target: 141, onSuggest: () => {} })

    expect(body()).not.toMatch(/not reachable/)
    expect(body()).not.toMatch(/Nearest available/)
    expect(body()).not.toMatch(/Simpler setup/)
    expect(screen.getByText('USE SUGGESTED LOAD')).toBeTruthy()
  })

  it('names the lightest load for a target below everything achievable', () => {
    renderControls({ target: 45, onSuggest: () => {} })

    expect(body()).toContain('Lightest available 86lb')
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
    renderControls({ profile: pulling({ maxAddedWeight: 0 }), target: 150, onSuggest: () => {} })

    expect(body()).toContain('Nearest available 141lb (9lb under)')
    expect(body()).toContain('Simpler setup, 11lb over')
    // In range, so the suggestion is still on offer.
    expect(screen.getByText('USE SUGGESTED LOAD')).toBeTruthy()
  })

  it('says which side of the target the nearest load falls on', () => {
    renderControls({ profile: pulling({ maxAddedWeight: 0 }), target: 158, onSuggest: () => {} })
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
    renderControls({ onSuggest: () => {}, value: makeBandLoad(pulling(), 'Orange') })

    fireEvent.click(screen.getByText('SUGGEST A LOAD…'))
    for (let i = 0; i < 20; i++) fireEvent.click(screen.getByLabelText('Decrease target effective load'))

    expect(body()).toContain('Lightest available 86lb')
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
    expect(value()).toMatchObject({ band: before.band, assistance: before.assistance })
    expect(effectiveBandLoad(value())).toBe(effectiveBandLoad(before) + 2.5)
  })
})
