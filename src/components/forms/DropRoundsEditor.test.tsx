// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { render, screen, fireEvent } from '@solidjs/testing-library'
import DropRoundsEditor from './DropRoundsEditor'
import type { BandLoad, BandProfile, DropRound } from '../../types/domain'

const profile = (): BandProfile => ({
  enabled: true,
  rawLoad: 191,
  maxAddedWeight: null,
  bands: [
    { name: 'Orange', assistance: 105 },
    { name: 'Green', assistance: 50 },
  ],
})

const bandLoad = (): BandLoad => ({
  band: 'Green',
  rawLoad: 191,
  assistance: 50,
  addedWeight: 0,
  calibration: [
    { name: 'Orange', assistance: 105 },
    { name: 'Green', assistance: 50 },
  ],
})

function renderEditor(initial: DropRound[], seed?: BandLoad | null) {
  const [rounds, setRounds] = createSignal<DropRound[]>(initial)
  render(() => (
    <DropRoundsEditor
      profile={profile()}
      bandLoad={seed}
      rounds={rounds()}
      onChange={setRounds}
      weight={100}
      reps={8}
    />
  ))
  return { rounds }
}

describe('DropRoundsEditor', () => {
  /**
   * `BandLoad.calibration` is an array, and a spread shares it by reference.
   * `makeBandLoad` copies it deliberately — "the profile row is editable and
   * this is a record" — and this call site did not, so a new round and the round
   * it was seeded from shared one table. Nothing writes through it today; this
   * is the snapshot isolation the record is supposed to have.
   */
  it('gives an added round its own calibration array', () => {
    const seed = bandLoad()
    const { rounds } = renderEditor([{ weight: 141, reps: 8, bandLoad: seed }])

    fireEvent.click(screen.getByText('+ ADD DROP ROUND'))

    const [first, second] = rounds()
    expect(second.bandLoad).toEqual(first.bandLoad)
    expect(second.bandLoad).not.toBe(first.bandLoad)
    expect(second.bandLoad!.calibration).not.toBe(first.bandLoad!.calibration)
    expect(second.bandLoad!.calibration![0]).not.toBe(first.bandLoad!.calibration![0])

    // And writing through one leaves the other alone.
    second.bandLoad!.calibration![0].assistance = 999
    expect(first.bandLoad!.calibration![0].assistance).toBe(105)
  })

  it('copies the seeding load the same way when there are no rounds yet', () => {
    const seed = bandLoad()
    const { rounds } = renderEditor([], seed)

    fireEvent.click(screen.getByText('+ ADD DROP ROUND'))

    expect(rounds()[0].bandLoad).not.toBe(seed)
    expect(rounds()[0].bandLoad!.calibration).not.toBe(seed.calibration)
  })

  /**
   * A load recorded before calibration snapshots existed carries none, and
   * `BandLoadControls` falls back to the live profile for exactly those. An
   * empty array is not the same as an absent one — it would suppress that
   * fallback and strand the row with no bands to choose from.
   */
  it('keeps an absent calibration absent rather than inventing an empty one', () => {
    const legacy: BandLoad = { band: 'Green', rawLoad: 191, assistance: 50, addedWeight: 0 }
    const { rounds } = renderEditor([{ weight: 141, reps: 8, bandLoad: legacy }])

    fireEvent.click(screen.getByText('+ ADD DROP ROUND'))

    expect(rounds()[1].bandLoad!.calibration).toBeUndefined()
  })

  it('adds a plain-weight round when nothing carries a band load', () => {
    const { rounds } = renderEditor([{ weight: 100, reps: 8, bandLoad: null }])

    fireEvent.click(screen.getByText('+ ADD DROP ROUND'))

    expect(rounds()[1]).toMatchObject({ weight: 100, reps: 8, bandLoad: null })
  })

  it('edits one round without disturbing the others', () => {
    const onChange = vi.fn()
    const [rounds] = createSignal<DropRound[]>([
      { weight: 100, reps: 8, bandLoad: null },
      { weight: 90, reps: 6, bandLoad: null },
    ])
    render(() => (
      <DropRoundsEditor rounds={rounds()} onChange={onChange} weight={100} reps={8} />
    ))

    fireEvent.click(screen.getByLabelText('Decrease drop 1 reps'))

    expect(onChange).toHaveBeenCalledWith([
      { weight: 100, reps: 7, bandLoad: null },
      { weight: 90, reps: 6, bandLoad: null },
    ])
  })
})
