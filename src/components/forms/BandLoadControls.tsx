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
  // The bands this set was RECORDED under, falling back to the live profile for
  // rows written before that snapshot existed. Reading the profile first
  // re-priced a finished set the moment its dropdown was touched: a
  // recalibration keeps all four names and changes every assistance, so a set
  // logged at 191 − 48 came back as 191 − 50, and switching band produced a
  // load from neither calibration (the recorded raw load against a re-measured
  // assistance).
  const atMount = props.value.calibration ?? props.profile?.bands ?? []

  // Captured ONCE, at mount, not derived from props.value. This is the pairing
  // the set actually carries. The moment the user selects something else
  // `props.value` stops carrying it, so a reactive version would drop it
  // exactly when it is needed to get back.
  //
  // It fires on a DISAGREEMENT, not only on a missing name. A band the
  // calibration has since dropped is the obvious case, and `makeBandLoad` would
  // miss that lookup and silently reset the set to "None" with zero assistance.
  // But a band still listed under a different assistance loses just as much and
  // says nothing: before this, Green → Purple → Green on a legacy row wrote the
  // profile's Green and the set's own value was gone for good.
  const match = props.value.band ? atMount.find(b => b.name === props.value.band) : undefined
  const recorded = props.value.band && match?.assistance !== props.value.assistance
    ? { name: props.value.band, assistance: props.value.assistance }
    : null

  const choices = () => {
    const list = [...(props.value.calibration ?? props.profile?.bands ?? [])]
    if (!recorded) return list
    // Replaced in place rather than appended when the name is still listed:
    // two options reading "Green" are indistinguishable in the select, and
    // `makeBandLoad` resolves by name and would take whichever came first.
    const at = list.findIndex(b => b.name === recorded.name)
    if (at === -1) return [...list, recorded]
    const merged = [...list]
    merged[at] = recorded
    return merged
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
