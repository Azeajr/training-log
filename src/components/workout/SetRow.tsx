import { createSignal, createEffect, Show, Switch, Match } from 'solid-js'
import type { Set } from '../../types/domain'
import AmrapTargets from './AmrapTargets'
import type { AmrapTarget } from '../../lib/calc'
import { estimated1RM } from '../../lib/calc'
import Stepper from '../forms/Stepper'
import SetLogControls, { FieldRow } from '../forms/SetLogControls'
import SetReadout from '../forms/SetReadout'
import PlateDisplay from '../forms/PlateDisplay'
import InlineConfirm from '../ui/InlineConfirm'

interface Props {
  set: Omit<Set, 'id' | 'sessionId'> & { isAmrap?: boolean }
  isActive: boolean
  isCompleted: boolean
  loggedReps?: number
  loggedWeight?: number
  amrapTargets?: AmrapTarget[]
  onLog: (reps: number, weight: number) => void
  onEdit: (reps: number, weight: number) => void
  onWeightChange?: (weight: number) => void
  onDelete?: () => void
  // Whether to show the plate-loading breakdown for this set. Defaults true;
  // pass false for non-barbell movements where plate math is meaningless.
  showPlates?: boolean
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

  const isAmrap = () => props.set.isAmrap ?? false

  createEffect(() => {
    const newWeight = props.set.weight
    if (!props.isCompleted && !weightTouched()) setWeight(newWeight)
  })

  const startEdit = () => {
    setEditing(true)
    setEditReps(props.loggedReps ?? props.set.reps)
    setEditWeight(props.loggedWeight ?? props.set.weight)
  }

  return (
    <Switch>
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
          <Show when={props.showPlates ?? true}>
            <PlateDisplay weight={weight()} />
          </Show>
          <Show when={isAmrap() && props.amrapTargets && props.amrapTargets.length > 0}>
            <AmrapTargets targets={props.amrapTargets!} />
          </Show>
          <SetLogControls
            weight={weight()}
            onWeightChange={v => { setWeightTouched(true); setWeight(v); props.onWeightChange?.(v) }}
            onLog={() => { props.onLog(reps(), weight()); setReps(props.set.reps); setWeightTouched(false) }}
          >
            <FieldRow label="reps">
              <Stepper value={reps()} onChange={setReps} step={1} min={0} label="reps" />
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
              {estimated1RM(props.set.weight, props.set.reps).toFixed(0)}lb e1RM
            </span>
          }
        />
      </Match>

      {/* Completed — inline edit form */}
      <Match when={editing()}>
        <div class="flex items-center gap-3 py-3 pl-3 border-l-4 border-accent flex-wrap">
          <Stepper value={editWeight()} onChange={setEditWeight} step={2.5} min={0} label="edit-weight" />
          <span class="text-text-dim font-mono text-sm">×</span>
          <Stepper value={editReps()} onChange={setEditReps} step={1} min={0} label="edit-reps" />
          <button
            onClick={() => { props.onEdit(editReps(), editWeight()); setEditing(false) }}
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
                  {estimated1RM(props.loggedWeight ?? props.set.weight, props.loggedReps!).toFixed(0)}lb e1RM
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
