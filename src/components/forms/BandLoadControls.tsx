import { For, Show } from 'solid-js'
import type { BandLoad, BandProfile } from '../../types/domain'
import type { PlateLoading } from '../../lib/plate-loading'
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
  /**
   * How the ADDED weight is loaded. Base is always 0 — the implement's own
   * weight is part of `rawLoad`, never of what you hang on top of it — but the
   * mode follows the lift: belt plates are singles, plates slid onto a bar are
   * paired. Hardcoding 'total' here showed a paired lift's added weight as
   * singles, which is half the plates it actually needs.
   */
  loading?: PlateLoading
}) {
  // Captured ONCE, at mount, not derived from props.value. This is the band the
  // set was logged under back when the calibration still had it. The moment the
  // user selects something else `props.value` stops carrying it, so a reactive
  // version would drop the option exactly when it is needed to get back — and
  // `makeBandLoad` would then miss the lookup and silently reset the set to
  // "None" with zero assistance, changing its effective load by the whole
  // assistance value.
  const fromProfile = props.profile?.bands ?? []
  const recorded = props.value.band && !fromProfile.some(b => b.name === props.value.band)
    ? { name: props.value.band, assistance: props.value.assistance }
    : null

  const choices = () => {
    const list = props.profile?.bands ?? []
    return recorded ? [...list, recorded] : list
  }
  const changeBand = (band: string) => {
    if ((band || null) === props.value.band) return
    props.onChange(makeBandLoad(
      {
        enabled: true,
        rawLoad: props.value.rawLoad,
        maxAddedWeight: props.profile?.maxAddedWeight ?? null,
        bands: choices(),
      },
      band || null,
      props.value.addedWeight,
    ))
  }
  const addedLoading = (): PlateLoading => ({ mode: props.loading?.mode ?? 'total', base: 0 })
  return (
    <div class="flex flex-col gap-2 w-full text-sm">
      <Show when={props.target != null}><span class="text-muted text-xs">Prescribed: {props.target}lb effective</span></Show>
      <label class="flex items-center gap-2">Band
        <select aria-label={`${props.label ?? ''} band`.trim()} value={props.value.band ?? ''}
          onChange={e => changeBand(e.currentTarget.value)} class="bg-surface border border-border p-2 text-text">
          <option value="">None</option>
          <For each={choices()}>{b =>
            <option value={b.name}>{b.name}{recorded && b.name === recorded.name ? ' (recorded)' : ''}</option>
          }</For>
        </select>
      </label>
      <div class="flex items-center gap-2 flex-wrap">
        <span>Added lb</span>
        <Stepper value={props.value.addedWeight} onChange={addedWeight => props.onChange({ ...props.value, addedWeight })}
          step={2.5} min={0} fieldLabel={`${props.label ?? ''} added weight`.trim()} />
      </div>
      <PlateDisplay weight={props.value.addedWeight} loading={addedLoading()} />
      <div class="text-muted text-xs">Raw {props.value.rawLoad}lb − assistance {props.value.assistance}lb + added {props.value.addedWeight}lb = {effectiveBandLoad(props.value)}lb effective</div>
      <Show when={props.onSuggest}><button type="button" onClick={props.onSuggest} class="text-accent text-xs text-left">USE SUGGESTED LOAD</button></Show>
    </div>
  )
}
