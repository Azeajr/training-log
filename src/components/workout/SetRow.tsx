import { createSignal, createEffect, Show, Switch, Match } from 'solid-js'
import type { Set } from '../../types/domain'
import AmrapTargets from './AmrapTargets'
import type { AmrapTarget } from '../../lib/calc'
import { estimated1RM } from '../../lib/calc'
import Stepper from '../forms/Stepper'
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
}

export default function SetRow(props: Props) {
  const [reps, setReps] = createSignal(props.set.reps)
  const [weight, setWeight] = createSignal(props.set.weight)
  const [weightEditing, setWeightEditing] = createSignal(false)
  const [editing, setEditing] = createSignal(false)
  const [editReps, setEditReps] = createSignal(props.loggedReps ?? props.set.reps)
  const [editWeight, setEditWeight] = createSignal(props.loggedWeight ?? props.set.weight)
  // eslint-disable-next-line no-unassigned-vars -- Solid `ref={rowEl}` reassigns at runtime
  let rowEl!: HTMLDivElement

  const isAmrap = () => props.set.isAmrap ?? false

  createEffect(() => {
    if (props.isActive) rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })

  createEffect(() => {
    const newWeight = props.set.weight
    if (!props.isCompleted && !weightEditing()) setWeight(newWeight)
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
        <div ref={rowEl} class="border-l-4 border-accent pl-3 py-3 mb-1">
          <div class="flex items-baseline gap-3">
            <button
              onClick={() => setWeightEditing(w => !w)}
              class={`text-2xl font-mono border-b-2 ${weightEditing() ? 'text-accent border-accent' : 'text-text border-muted border-dashed'}`}
            >
              {weight()}<span class="text-base ml-1">lb</span>
            </button>
            <span class="text-xl text-text">x {props.set.reps}{isAmrap() ? '+' : ''}</span>
            <Show when={isAmrap()}>
              <span class="text-warn text-xs tracking-widest">AMRAP</span>
            </Show>
            <Show when={props.set.type === 'joker'}>
              <span class="text-warn text-xs tracking-widest">JOKER</span>
            </Show>
          </div>
          <PlateDisplay weight={weight()} />
          <Show when={isAmrap() && props.amrapTargets && props.amrapTargets.length > 0}>
            <AmrapTargets targets={props.amrapTargets!} />
          </Show>
          <div class="mt-3 flex flex-col gap-2">
            <Show when={weightEditing()}>
              <div class="flex items-center gap-2">
                <span class="text-xs text-faint uppercase tracking-widest w-8">wt</span>
                <Stepper value={weight()} onChange={v => { setWeight(v); props.onWeightChange?.(v) }} step={2.5} min={0} label="weight" />
              </div>
            </Show>
            <div class="flex items-center gap-2">
              <span class="text-xs text-faint uppercase tracking-widest w-8">reps</span>
              <Stepper value={reps()} onChange={setReps} step={1} min={0} label="reps" />
            </div>
            <button
              onClick={() => { props.onLog(reps(), weight()); setReps(props.set.reps); setWeightEditing(false) }}
              class="w-full border border-accent text-accent py-4 font-mono text-base tracking-widest"
            >
              LOG
            </button>
          </div>
        </div>
      </Match>

      {/* Upcoming set — read-only preview */}
      <Match when={!props.isCompleted}>
        <div class="flex items-center gap-3 py-2.5 pl-3 text-sm text-muted border-l-4 border-transparent">
          <span class="w-16 text-right font-mono">{props.set.weight}lb</span>
          <span>x {props.set.reps}{isAmrap() ? '+' : ''}</span>
          <Show when={isAmrap()}>
            <span class="text-xs text-faint tracking-widest">AMRAP</span>
          </Show>
          <Show when={props.set.type === 'joker'}>
            <span class="text-xs text-faint tracking-widest">JOKER</span>
          </Show>
          <span class="text-faint text-xs font-mono ml-auto">
            {estimated1RM(props.set.weight, props.set.reps).toFixed(0)}lb e1RM
          </span>
        </div>
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
        <div
          class="flex items-center gap-3 py-3 pl-3 text-sm text-muted border-l-4 border-transparent"
          onClick={startEdit}
        >
          <span class="w-16 text-right font-mono cursor-pointer hover:text-text-dim">{props.loggedWeight ?? props.set.weight}lb</span>
          <span class="cursor-pointer hover:text-text-dim">x {props.loggedReps}</span>
          <Show when={isAmrap()}>
            <span class="text-xs tracking-widest">AMRAP</span>
          </Show>
          <span class="text-accent text-xs tracking-widest">done</span>
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
        </div>
      </Match>
    </Switch>
  )
}
