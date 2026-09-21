import BandLoadControls from './BandLoadControls'
import { copyBandLoad, effectiveBandLoad, suggestBandLoad } from '../../lib/band-loading'
import { settings } from '../../store/settings-store'
import { Index, Show } from 'solid-js'
import type { DropRound, BandLoad, BandProfile } from '../../types/domain'
import type { PlateLoading } from '../../lib/plate-loading'
import Stepper from './Stepper'

export default function DropRoundsEditor(props: {
  profile?: BandProfile | null
  bandLoad?: BandLoad | null
  /** Passed through to each round's band control — see BandLoadControls. */
  loading?: PlateLoading
  rounds: DropRound[]
  onChange: (rounds: DropRound[]) => void
  weight: number
  reps: number
}) {
  const update = (index: number, field: keyof DropRound, value: number) =>
    props.onChange(props.rounds.map((round, i) => i === index ? { ...round, [field]: value } : round))
  return (
    <div class="flex flex-col gap-2 mt-2">
      <Index each={props.rounds}>
        {(round, i) => (
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-muted text-xs">Drop {i + 1}</span>
            <Show
              when={round().bandLoad}
              fallback={<><Stepper value={round().weight} onChange={v => update(i, 'weight', v)} step={2.5} min={0} fieldLabel={`drop ${i + 1} weight`} /><span class="text-muted text-xs">lb ×</span></>}
            >
              {/* A drop round has no prescription — it is defined by dropping
                  to a lower load, and it was the one band control with no way
                  to ask for one. The user names the load they want. */}
              <BandLoadControls profile={props.profile} loading={props.loading} value={round().bandLoad!} label={`drop ${i + 1}`}
                onSuggest={props.profile ? target => {
                  const bandLoad = suggestBandLoad(props.profile!, target, settings.plates)
                  props.onChange(props.rounds.map((r, n) => n === i ? { ...r, bandLoad, weight: effectiveBandLoad(bandLoad) } : r))
                } : undefined}
                onChange={bandLoad => props.onChange(props.rounds.map((r, n) => n === i ? { ...r, bandLoad, weight: effectiveBandLoad(bandLoad) } : r))} />
              {/* Bare — the band summary already ends in its own "lb". */}
              <span class="text-muted text-xs">×</span>
            </Show>
            <Stepper value={round().reps} onChange={v => update(i, 'reps', v)} min={0} fieldLabel={`drop ${i + 1} reps`} />
            <button type="button" aria-label={`Remove drop ${i + 1}`} onClick={() => props.onChange(props.rounds.filter((_, n) => n !== i))} class="text-muted text-xs">remove</button>
          </div>
        )}
      </Index>
      <button type="button" class="text-left text-accent text-xs tracking-widest" onClick={() => {
        const last = props.rounds.at(-1)
        const previousBand = last?.bandLoad ?? props.bandLoad
        // Deep on `calibration`, the way `makeBandLoad` builds one: a spread
        // shares that array by reference, and a BandLoad is a record of what a
        // set was, not a view onto a profile that is still editable. Absent
        // stays absent — a load written before snapshots existed falls back to
        // the live profile in BandLoadControls, and an empty array would
        // suppress that fallback and leave the row with no bands to pick from.
        props.onChange([...props.rounds, {
          weight: last?.weight ?? props.weight,
          reps: last?.reps ?? props.reps,
          bandLoad: previousBand ? copyBandLoad(previousBand) : null,
        }])
      }}>+ ADD DROP ROUND</button>
    </div>
  )
}
