import BandLoadControls from './BandLoadControls'
import { effectiveBandLoad } from '../../lib/band-loading'
import { Index, Show } from 'solid-js'
import type { DropRound, BandLoad, BandProfile } from '../../types/domain'
import Stepper from './Stepper'

export default function DropRoundsEditor(props: {
  profile?: BandProfile | null
  bandLoad?: BandLoad | null
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
            <Show when={round().bandLoad} fallback={<Stepper value={round().weight} onChange={v => update(i, 'weight', v)} step={2.5} min={0} fieldLabel={`drop ${i + 1} weight`} />}>
              <BandLoadControls profile={props.profile} value={round().bandLoad!} label={`drop ${i + 1}`}
                onChange={bandLoad => props.onChange(props.rounds.map((r, n) => n === i ? { ...r, bandLoad, weight: effectiveBandLoad(bandLoad) } : r))} />
            </Show>
            <span class="text-muted text-xs">lb ×</span>
            <Stepper value={round().reps} onChange={v => update(i, 'reps', v)} min={0} fieldLabel={`drop ${i + 1} reps`} />
            <button type="button" aria-label={`Remove drop ${i + 1}`} onClick={() => props.onChange(props.rounds.filter((_, n) => n !== i))} class="text-muted text-xs">remove</button>
          </div>
        )}
      </Index>
      <button type="button" class="text-left text-accent text-xs tracking-widest" onClick={() => {
        const last = props.rounds.at(-1)
        const previousBand = last?.bandLoad ?? props.bandLoad
        props.onChange([...props.rounds, { weight: last?.weight ?? props.weight, reps: last?.reps ?? props.reps, bandLoad: previousBand ? { ...previousBand } : null }])
      }}>+ ADD DROP ROUND</button>
    </div>
  )
}
