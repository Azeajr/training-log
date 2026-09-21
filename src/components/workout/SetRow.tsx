import { createSignal, createEffect, on, Show, Switch, Match } from 'solid-js'
import type { Set, BandLoad, BandProfile } from '../../types/domain'
import BandLoadControls from '../forms/BandLoadControls'
import { effectiveBandLoad, makeBandLoad, suggestBandLoad } from '../../lib/band-loading'
import AmrapTargets from './AmrapTargets'
import type { AmrapTarget } from '../../lib/calc'
import { estimated1RM } from '../../lib/calc'
import { settings } from '../../store/settings-store'
import Stepper from '../forms/Stepper'
import SetLogControls, { FieldRow } from '../forms/SetLogControls'
import SetReadout from '../forms/SetReadout'
import PlateDisplay from '../forms/PlateDisplay'
import InlineConfirm from '../ui/InlineConfirm'
import type { PlateLoading } from '../../lib/plate-loading'

interface Props {
  set: Omit<Set, 'id' | 'sessionId'> & { isAmrap?: boolean }
  isActive: boolean
  isCompleted: boolean
  /**
   * Planned, deliberately not performed. Distinct from completed, which is the
   * distinction the cursor alone could not make — moving past a warmup nobody
   * did used to render it as a set they had done.
   */
  isSkipped?: boolean
  /** Take the skip back. Absent unless the row is skipped. */
  onUnskip?: () => void
  loggedReps?: number
  loggedWeight?: number
  bandProfile?: BandProfile | null
  loggedBandLoad?: BandLoad | null
  previousBandLoad?: BandLoad | null
  amrapTargets?: AmrapTarget[]
  onLog: (reps: number, weight: number, bandLoad?: BandLoad | null) => void
  onEdit: (reps: number, weight: number, bandLoad?: BandLoad | null) => void
  onWeightChange?: (weight: number) => void
  onDelete?: () => void
  // Resolved plate-loading for this set, or null/undefined for no readout
  // (non-plate-loaded movements).
  loading?: PlateLoading | null
  // Called with this row's element when it becomes the active set. Scroll-to-
  // active is a page concern (there's one current set on the page), so the row
  // only reports its element — Workout owns the scroll. Only the linear flow
  // wires this; independent sections (cross, accessories) pass nothing and so
  // never grab focus. Opt-in by default means a new section can't reintroduce
  // the multi-active-row scroll fight.
  activeRef?: (el: HTMLDivElement) => void
}

export default function SetRow(props: Props) {
  const [reps, setReps] = createSignal(props.set.reps)
  const [weight, setWeight] = createSignal(props.set.weight)
  // Once the user dials the weight, stop syncing it to the (cascading)
  // prescription so their edit isn't clobbered. The weight stepper is always
  // visible, so there's no edit toggle to gate on — track "touched" instead.
  const [weightTouched, setWeightTouched] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [editReps, setEditReps] = createSignal(props.loggedReps ?? props.set.reps)
  const [editWeight, setEditWeight] = createSignal(props.loggedWeight ?? props.set.weight)

  const [bandLoad, setBandLoad] = createSignal<BandLoad | null>(null)
  const [editBandLoad, setEditBandLoad] = createSignal<BandLoad | null>(null)
  // The band twin of `weightTouched`: true once the user has moved a band
  // control themselves, as opposed to a value this component derived for them.
  const [bandTouched, setBandTouched] = createSignal(false)
  const applyBandLoad = (load: BandLoad) => {
    setBandLoad(load)
    setWeight(effectiveBandLoad(load))
    setWeightTouched(true)
    props.onWeightChange?.(effectiveBandLoad(load))
  }
  /** A band the USER picked. Outranks anything re-derived below. */
  const changeBandLoad = (load: BandLoad) => { setBandTouched(true); applyBandLoad(load) }
  const suggest = (target: number) => {
    if (props.bandProfile) applyBandLoad(suggestBandLoad(props.bandProfile, target, settings.plates))
  }
  createEffect(on(() => [props.bandProfile, props.set.weight, props.isActive] as const, (_now, prior) => {
    if (props.isCompleted || !props.isActive) return
    const profile = props.bandProfile
    if (!profile) {
      // Bands were just switched off. The number in the stepper is one
      // `applyBandLoad` derived, not one the user typed, so `weightTouched` —
      // which it set on their behalf — has to come off with it. Leaving it on
      // stranded the row at the last effective load for the rest of the
      // session: the stepper reappeared reading 148.5 against a prescribed
      // 150, the plate readout came back showing plates for 148.5, and the
      // effect below could never take the weight back because every cascade
      // from an earlier set was still being read as the user's own edit.
      if (prior?.[0]) {
        setWeightTouched(false)
        setWeight(props.set.weight)
        props.onWeightChange?.(props.set.weight)
      }
      setBandLoad(null); setBandTouched(false); return
    }
    // A deliberate choice survives the prescription moving under it. This effect
    // re-runs whenever `props.set.weight` cascades — which it does every time an
    // earlier set is edited — and re-suggesting there threw away the band the
    // user had already dialled in, mid-exercise, with no way to tell it had
    // happened. Same reason `weightTouched` gates the plain weight effect below.
    const chosen = bandTouched() ? bandLoad() : null
    if (chosen) { applyBandLoad(makeBandLoad(profile, chosen.band, chosen.addedWeight)); return }
    const previous = props.previousBandLoad
    if (previous && previous.rawLoad === profile.rawLoad && effectiveBandLoad(previous) === props.set.weight) {
      applyBandLoad({ ...previous })
    } else suggest(props.set.weight)
  }))

  const isAmrap = () => props.set.isAmrap ?? false

  createEffect(() => {
    const newWeight = props.set.weight
    if (!props.isCompleted && !weightTouched()) setWeight(newWeight)
  })

  const startEdit = () => {
    setEditBandLoad(props.loggedBandLoad ? { ...props.loggedBandLoad } : null)
    setEditing(true)
    setEditReps(props.loggedReps ?? props.set.reps)
    setEditWeight(props.loggedWeight ?? props.set.weight)
  }

  return (
    <Switch>
      {/* Skipped — a row that says so, and the way back to it. */}
      <Match when={props.isSkipped && !props.isCompleted}>
        <div class="flex items-center gap-3 py-3 pl-3 border-l-4 border-transparent">
          <SetReadout
            weight={props.set.weight}
            value={`${props.set.reps}`}
            alignWeight
            tone="text-faint"
            class="flex-1 min-w-0"
            badges={<span class="text-faint text-xs tracking-widest">skipped</span>}
          />
          <button
            onClick={() => props.onUnskip?.()}
            aria-label={`Undo skipping ${props.set.type} set ${props.set.setNumber}`}
            class="shrink-0 text-muted text-xs font-mono tracking-widest hover:text-accent"
          >
            UNDO SKIP
          </button>
        </div>
      </Match>

      {/* Active set — input form */}
      <Match when={!props.isCompleted && props.isActive}>
        <div ref={props.activeRef} class="border-l-4 border-accent pl-3 py-3 mb-1">
          <SetReadout
            size="lg"
            weight={weight()}
            value={`${reps()}${isAmrap() ? '+' : ''}`}
            weightTestId="active-weight"
            badges={
              <>
                <Show when={isAmrap()}>
                  <span class="text-warn text-xs tracking-widest">AMRAP</span>
                </Show>
                <Show when={props.set.type === 'joker'}>
                  <span class="text-warn text-xs tracking-widest">JOKER</span>
                </Show>
              </>
            }
          />
          <Show when={props.loading && !props.bandProfile}>
            <PlateDisplay weight={weight()} loading={props.loading!} />
          </Show>
          <Show when={isAmrap() && props.amrapTargets && props.amrapTargets.length > 0}>
            <AmrapTargets targets={props.amrapTargets!} onPick={setReps} />
          </Show>
          <SetLogControls
            weight={weight()}
            weightControls={bandLoad() ? <BandLoadControls target={props.set.weight} profile={props.bandProfile} value={bandLoad()!} onChange={changeBandLoad} onSuggest={suggest} loading={props.loading ?? undefined} /> : undefined}
            onWeightChange={v => { setWeightTouched(true); setWeight(v); props.onWeightChange?.(v) }}
            onLog={() => { props.onLog(reps(), weight(), bandLoad()); setReps(props.set.reps); setWeightTouched(false); setBandTouched(false) }}
          >
            <FieldRow label="reps">
              <Stepper value={reps()} onChange={setReps} step={1} min={0} label="reps" fieldLabel="reps" emphasized={isAmrap()} />
            </FieldRow>
          </SetLogControls>
        </div>
      </Match>

      {/* Upcoming set — read-only preview */}
      <Match when={!props.isCompleted}>
        <SetReadout
          weight={props.set.weight}
          value={`${props.set.reps}${isAmrap() ? '+' : ''}`}
          alignWeight
          class="py-2.5 pl-3 border-l-4 border-transparent"
          badges={
            <>
              <Show when={isAmrap()}>
                <span class="text-xs text-faint tracking-widest">AMRAP</span>
              </Show>
              <Show when={props.set.type === 'joker'}>
                <span class="text-xs text-faint tracking-widest">JOKER</span>
              </Show>
            </>
          }
          trailing={
            <span class="text-faint text-xs font-mono ml-auto">
              {estimated1RM(props.set.weight, props.set.reps, settings.highRepDiscount).toFixed(0)}lb e1RM
            </span>
          }
        />
      </Match>

      {/* Completed — inline edit form */}
      <Match when={editing()}>
        <div class="flex items-center gap-3 py-3 pl-3 border-l-4 border-accent flex-wrap">
          <Show when={editBandLoad()} fallback={<Stepper value={editWeight()} onChange={setEditWeight} step={2.5} min={0} label="edit-weight" fieldLabel="weight" />}>
            {/* The set carries its own prescription, so the edit row can name
                it — unlike history, which only has today's. */}
            <BandLoadControls profile={props.bandProfile} value={editBandLoad()!} loading={props.loading ?? undefined}
              target={props.set.weight}
              onSuggest={target => {
                if (!props.bandProfile) return
                const load = suggestBandLoad(props.bandProfile, target, settings.plates)
                setEditBandLoad(load); setEditWeight(effectiveBandLoad(load))
              }}
              onChange={load => { setEditBandLoad(load); setEditWeight(effectiveBandLoad(load)) }} />
          </Show>
          <span class="text-text-dim font-mono text-sm">×</span>
          <Stepper value={editReps()} onChange={setEditReps} step={1} min={0} label="edit-reps" fieldLabel="reps" />
          <button
            onClick={() => { props.onEdit(editReps(), editWeight(), editBandLoad()); setEditing(false) }}
            class="border border-accent text-accent px-3 py-2 text-xs font-mono tracking-widest"
          >
            SAVE
          </button>
          <button onClick={() => setEditing(false)} class="text-muted text-xs font-mono">cancel</button>
        </div>
      </Match>

      {/* Completed — read-only view */}
      <Match when={true}>
        <SetReadout
          bandLoad={props.loggedBandLoad}
          weight={props.loggedWeight ?? props.set.weight}
          value={`${props.loggedReps ?? ''}`}
          alignWeight
          onClick={startEdit}
          class="py-3 pl-3 border-l-4 border-transparent"
          badges={
            <>
              <Show when={isAmrap()}>
                <span class="text-xs tracking-widest">AMRAP</span>
              </Show>
              <span class="text-accent text-xs tracking-widest">done</span>
            </>
          }
          trailing={
            <>
              <Show when={props.loggedReps != null && props.loggedReps > 0}>
                <span class="text-faint text-xs font-mono ml-auto">
                  {estimated1RM(props.loggedWeight ?? props.set.weight, props.loggedReps!, settings.highRepDiscount).toFixed(0)}lb e1RM
                </span>
              </Show>
              <Show when={!!props.onDelete}>
                <InlineConfirm
                  label="undo"
                  confirmText="undo set?"
                  onConfirm={() => props.onDelete!()}
                  class="ml-auto"
                  stopPropagation
                />
              </Show>
            </>
          }
        />
      </Match>
    </Switch>
  )
}
