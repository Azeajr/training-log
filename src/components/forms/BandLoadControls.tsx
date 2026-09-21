import { createSignal, For, Show } from 'solid-js'
import type { BandLoad, BandProfile } from '../../types/domain'
import type { PlateLoading } from '../../lib/plate-loading'
import { effectiveBandLoad, makeBandLoad, suggestBandLoadDetailed } from '../../lib/band-loading'
import { settings } from '../../store/settings-store'
import Stepper from './Stepper'
import PlateDisplay from './PlateDisplay'

export default function BandLoadControls(props: {
  profile?: BandProfile | null
  value: BandLoad
  onChange: (load: BandLoad) => void
  label?: string
  /**
   * The load this set was prescribed, where a saved one exists.
   *
   * Only passed by a surface that HAS one. History has today's prescription
   * available and it is not the target of a set logged weeks ago, so it passes
   * nothing and lets the user name a target instead — see `targetLabel`.
   */
  target?: number
  /** What `target` is: a prescription, or a load the user asked for just now. */
  targetLabel?: 'Prescribed' | 'Target effective load'
  onSuggest?: (target: number) => void
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

  // A target the user names here, for a surface with no saved one. Held until
  // asked for: an editor that opened showing a target nobody set would be
  // describing the record, which is A1's mistake on the band side.
  const [asking, setAsking] = createSignal(false)
  const [desired, setDesired] = createSignal(0)
  const target = () => props.target ?? (asking() ? desired() : null)
  const label = () => props.targetLabel ?? (props.target != null ? 'Prescribed' : 'Target effective load')

  /**
   * Why the suggestion is where it is.
   *
   * Two independent facts, either or both of which can apply. Range is about
   * what the setup can reach at all — only a band takes load off, so nothing
   * below the strongest band's assisted load exists however the plates are
   * arranged. Preference is the algorithm deliberately taking a simpler setup
   * over the nearest one, which is a note and never a warning.
   */
  const suggestion = () => {
    const t = target()
    return props.profile && t != null
      ? suggestBandLoadDetailed(props.profile, t, settings.plates)
      : null
  }

  const outOfRange = () => {
    const s = suggestion()
    const t = target()
    if (!s || t == null) return null
    if (t < s.minAchievable) return `Lightest available ${s.minAchievable}lb — ${t}lb is not reachable with this calibration.`
    if (t > s.maxAchievable) return `Heaviest available ${s.maxAchievable}lb — ${t}lb is not reachable with these plates.`
    return null
  }

  const gap = () => {
    const s = suggestion()
    const t = target()
    if (!s || t == null || outOfRange() || s.nearestDistance === 0) return null
    const over = s.nearestEffectiveLoad - t
    return `Nearest available ${s.nearestEffectiveLoad}lb (${Math.abs(over)}lb ${over > 0 ? 'over' : 'under'}).`
  }

  const preference = () => {
    const s = suggestion()
    const t = target()
    if (!s || t == null || !s.preferenceUsed) return null
    const over = effectiveBandLoad(s.selected) - t
    return `Simpler setup, ${Math.abs(over)}lb ${over > 0 ? 'over' : 'under'}.`
  }

  const askTarget = () => {
    setDesired(effectiveBandLoad(props.value))
    setAsking(true)
  }

  return (
    <div class="flex flex-col gap-2 w-full text-sm">
      <Show when={props.target != null}>
        <span class="text-muted text-xs">{label()}: {props.target}lb effective</span>
      </Show>
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

      {/* A surface with no prescription can still ask for a setup — a drop
          round is DEFINED by dropping to a lower load and was the one band
          control with no way to request one. Nothing is shown until asked. */}
      <Show when={props.onSuggest && props.target == null && !asking()}>
        <button type="button" onClick={askTarget} class="text-accent text-xs text-left">SUGGEST A LOAD…</button>
      </Show>
      <Show when={props.onSuggest && props.target == null && asking()}>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-muted text-xs">{label()}</span>
          <Stepper value={desired()} onChange={setDesired} step={2.5} min={0}
            fieldLabel={`${props.label ?? ''} target effective load`.trim()} emphasized />
        </div>
      </Show>

      <Show when={outOfRange()}>{msg => <p class="text-warn text-xs">{msg()}</p>}</Show>
      <Show when={gap()}>{msg => <p class="text-muted text-xs">{msg()}</p>}</Show>
      <Show when={preference()}>{msg => <p class="text-muted text-xs">{msg()}</p>}</Show>

      {/* Suppressed only when the target is out of range: the button cannot
          close that gap, and offering it there is what made a 45lb prescription
          sit next to an 86lb suggestion with no explanation. */}
      <Show when={props.onSuggest && target() != null && !outOfRange()}>
        <button type="button" onClick={() => props.onSuggest!(target()!)} class="text-accent text-xs text-left">USE SUGGESTED LOAD</button>
      </Show>
    </div>
  )
}
