import { For, Show } from 'solid-js'
import type { BandLoad, BandProfile } from '../../types/domain'
import { effectiveBandLoad, makeBandLoad } from '../../lib/band-loading'
import Stepper from './Stepper'
import PlateDisplay from './PlateDisplay'

export default function BandLoadControls(props: {
  profile?: BandProfile | null
  value: BandLoad
  onChange: (load: BandLoad) => void
  label?: string
  target?: number
  onSuggest?: () => void
}) {
  const choices = () => props.profile?.bands ?? (props.value.band ? [{ name: props.value.band, assistance: props.value.assistance }] : [])
  const changeBand = (band: string) => {
    if ((band || null) === props.value.band) return
    const profile = props.profile ?? { enabled: true, rawLoad: props.value.rawLoad, bands: choices(), maxAddedWeight: null }
    props.onChange(makeBandLoad({ ...profile, rawLoad: props.value.rawLoad }, band || null, props.value.addedWeight))
  }
  return (
    <div class="flex flex-col gap-2 w-full text-sm">
      <Show when={props.target != null}><span class="text-muted text-xs">Prescribed: {props.target}lb effective</span></Show>
      <label class="flex items-center gap-2">Band
        <select aria-label={`${props.label ?? ''} band`.trim()} value={props.value.band ?? ''}
          onChange={e => changeBand(e.currentTarget.value)} class="bg-surface border border-border p-2 text-text">
          <option value="">None</option>
          <For each={choices()}>{b => <option value={b.name}>{b.name}</option>}</For>
          <Show when={props.value.band && !choices().some(b => b.name === props.value.band)}>
            <option value={props.value.band!}>{props.value.band} (recorded)</option>
          </Show>
        </select>
      </label>
      <div class="flex items-center gap-2 flex-wrap">
        <span>Added lb</span>
        <Stepper value={props.value.addedWeight} onChange={addedWeight => props.onChange({ ...props.value, addedWeight })}
          step={2.5} min={0} fieldLabel={`${props.label ?? ''} added weight`.trim()} />
      </div>
      <PlateDisplay weight={props.value.addedWeight} loading={{ mode: 'total', base: 0 }} />
      <div class="text-muted text-xs">Raw {props.value.rawLoad}lb − assistance {props.value.assistance}lb + added {props.value.addedWeight}lb = {effectiveBandLoad(props.value)}lb effective</div>
      <Show when={props.onSuggest}><button type="button" onClick={props.onSuggest} class="text-accent text-xs text-left">USE SUGGESTED LOAD</button></Show>
    </div>
  )
}
