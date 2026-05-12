import { createSignal, createMemo, For, Show } from 'solid-js'
import { logAccessorySet, editAccessorySet, deleteLastAccessorySet, removeAccessory, startRest } from '../store/workoutStore'
import type { AccessorySet, Exercise } from '../../src/db/db-v2'
import { db } from '../../src/db/db-v2'
import { ACCESSORY_PERCENTAGE, roundToNearest5 } from '../../src/lib/calc'
import DurationInput from './DurationInput'
import Stepper from './Stepper'

interface ActiveAccessory {
  exerciseId: number
  exerciseName: string
  tm: number
  calculatedWeight: number
  loggedSets: Partial<AccessorySet>[]
}

interface Props {
  accessory: ActiveAccessory
  exercise: Exercise | undefined
}

export default function AccessoryLog(props: Props) {
  const type = () => props.exercise?.type ?? 'reps'
  const nextSet = createMemo(() => props.accessory.loggedSets.length + 1)
  const [addingExtra, setAddingExtra] = createSignal(false)
  const done = createMemo(() => props.accessory.loggedSets.length >= 5 && !addingExtra())

  const initWeight = () => {
    const last = props.accessory.loggedSets[props.accessory.loggedSets.length - 1]
    return last?.weight ?? props.accessory.calculatedWeight ?? 0
  }

  const [weight, setWeight] = createSignal(initWeight())
  const [weightEditing, setWeightEditing] = createSignal(false)
  const [reps, setReps] = createSignal(10)
  const [duration, setDuration] = createSignal<number | null>(null)
  const [distance, setDistance] = createSignal(0)
  const [editingSetIdx, setEditingSetIdx] = createSignal<number | null>(null)
  const [editWeight, setEditWeight] = createSignal(0)
  const [editReps, setEditReps] = createSignal(0)
  const [editDuration, setEditDuration] = createSignal<number | null>(null)
  const [editDistance, setEditDistance] = createSignal(0)
  const [undoConfirm, setUndoConfirm] = createSignal(false)
  const [removeConfirm, setRemoveConfirm] = createSignal(false)
  let tmWritten = false

  const startEditSet = (i: number) => {
    const s = props.accessory.loggedSets[i]
    setEditWeight(s.weight ?? 0)
    setEditReps(s.reps ?? 10)
    setEditDuration(s.duration ?? null)
    setEditDistance(s.distance ?? 0)
    setEditingSetIdx(i)
  }

  const saveEditSet = (i: number) => {
    editAccessorySet(props.accessory.exerciseId, i, {
      weight: editWeight(),
      reps: type() === 'reps' ? editReps() : null,
      duration: type() === 'timed' ? editDuration() : null,
      distance: type() === 'distance' ? editDistance() : null,
    })
    setEditingSetIdx(null)
  }

  const handleLog = async () => {
    if (weight() !== (props.accessory.calculatedWeight ?? 0) && !tmWritten) {
      const newTm = roundToNearest5(weight() / ACCESSORY_PERCENTAGE)
      const tms = await db.accessoryTrainingMaxes
        .where('exerciseId').equals(props.accessory.exerciseId)
        .sortBy('setAt')
      const currentTm = tms[tms.length - 1]
      await db.accessoryTrainingMaxes.add({
        exerciseId: props.accessory.exerciseId,
        weight: newTm,
        incrementLb: currentTm?.incrementLb ?? 5,
        setAt: new Date(),
      })
      tmWritten = true
    }
    const set: Partial<AccessorySet> = {
      exerciseId: props.accessory.exerciseId,
      setNumber: nextSet(),
      weight: weight(),
      reps: type() === 'reps' ? reps() : null,
      duration: type() === 'timed' ? duration() : null,
      distance: type() === 'distance' ? distance() : null,
    }
    logAccessorySet(props.accessory.exerciseId, set)
    startRest(nextSet() >= 5 ? 'transition' : 'normal')
    setReps(10)
    setDuration(null)
    setDistance(0)
    setWeightEditing(false)
  }

  return (
    <div class="border border-border p-3 mb-3">
      <div class="text-text text-sm mb-1 uppercase tracking-widest flex items-center">
        <span class="flex-1">
          {props.accessory.exerciseName}
          <span class="text-muted ml-2 text-xs">5x10 @</span>
          <button
            onClick={() => setWeightEditing(w => !w)}
            class={`text-xs font-mono ml-1 border-b ${weightEditing() ? 'text-accent border-accent' : 'text-muted border-muted border-dashed'}`}
          >
            {weight()}lb
          </button>
        </span>
        <Show
          when={!removeConfirm()}
          fallback={
            <div class="flex items-center gap-2 ml-2">
              <span class="text-danger text-xs">remove?</span>
              <button onClick={() => removeAccessory(props.accessory.exerciseId)} class="text-danger text-xs font-mono border border-danger px-1">yes</button>
              <button onClick={() => setRemoveConfirm(false)} class="text-muted text-xs font-mono">no</button>
            </div>
          }
        >
          <button onClick={() => setRemoveConfirm(true)} class="text-faint text-xs font-mono hover:text-danger ml-2">✕</button>
        </Show>
      </div>
      <Show when={weightEditing()}>
        <div class="flex items-center gap-2 pl-2 mb-2">
          <span class="text-xs text-faint uppercase tracking-widest w-8">wt</span>
          <Stepper value={weight()} onChange={setWeight} step={2.5} min={0} />
        </div>
      </Show>
      <For each={props.accessory.loggedSets}>
        {(s, i) => {
          const isLast = () => i() === props.accessory.loggedSets.length - 1
          return (
            <Show
              when={editingSetIdx() === i()}
              fallback={
                <div class="flex items-center gap-1 text-muted text-xs pl-2 py-0.5">
                  <span onClick={() => startEditSet(i())} class="cursor-pointer hover:text-text-dim">
                    Set {i() + 1}:
                    <Show when={s.weight != null}> {s.weight}lb</Show>
                    <Show when={s.reps != null}> × {s.reps}</Show>
                    <Show when={s.duration != null}> {s.duration}s</Show>
                    <Show when={s.distance != null}> {s.distance}ft</Show>
                  </span>
                  <span class="text-accent ml-1">done</span>
                  <Show when={isLast() && !undoConfirm()}>
                    <button onClick={() => setUndoConfirm(true)} class="ml-auto text-faint text-xs hover:text-danger font-mono">undo</button>
                  </Show>
                  <Show when={isLast() && undoConfirm()}>
                    <div class="ml-auto flex items-center gap-2">
                      <span class="text-danger text-xs">undo set?</span>
                      <button onClick={() => { deleteLastAccessorySet(props.accessory.exerciseId); setUndoConfirm(false) }} class="text-danger text-xs font-mono border border-danger px-1">yes</button>
                      <button onClick={() => setUndoConfirm(false)} class="text-muted text-xs font-mono">no</button>
                    </div>
                  </Show>
                </div>
              }
            >
              <div class="flex items-center gap-2 pl-2 py-1 flex-wrap">
                <span class="text-warn text-xs">Set {i() + 1}:</span>
                <Stepper value={editWeight()} onChange={setEditWeight} step={2.5} min={0} />
                <span class="text-muted text-xs">lb ×</span>
                <Show when={type() === 'reps'}>
                  <Stepper value={editReps()} onChange={setEditReps} step={1} min={0} />
                </Show>
                <Show when={type() === 'timed'}>
                  <DurationInput value={editDuration()} onChange={setEditDuration} />
                </Show>
                <Show when={type() === 'distance'}>
                  <Stepper value={editDistance()} onChange={setEditDistance} step={1} min={0} />
                </Show>
                <button onClick={() => saveEditSet(i())} class="border border-accent text-accent px-2 py-0.5 font-mono text-xs">SAVE</button>
                <button onClick={() => setEditingSetIdx(null)} class="text-muted text-xs">cancel</button>
              </div>
            </Show>
          )
        }}
      </For>
      <Show when={!done()}>
        <div class="flex items-center gap-2 mt-2 pl-2">
          <span class="text-warn text-xs">Set {nextSet()}:</span>
          <span class="text-muted font-mono text-xs">{weight()}lb ×</span>
          <Show when={type() === 'reps'}>
            <Stepper value={reps()} onChange={setReps} step={1} min={0} />
          </Show>
          <Show when={type() === 'timed'}>
            <DurationInput value={duration()} onChange={setDuration} />
          </Show>
          <Show when={type() === 'distance'}>
            <Stepper value={distance()} onChange={setDistance} step={1} min={0} />
          </Show>
          <button onClick={() => { void handleLog(); setAddingExtra(false) }} class="border border-accent text-accent px-3 py-1 font-mono text-xs">
            LOG
          </button>
        </div>
      </Show>
      <Show when={props.accessory.loggedSets.length >= 5 && !addingExtra()}>
        <button
          onClick={() => setAddingExtra(true)}
          class="w-full text-left pl-2 mt-1 text-faint text-xs font-mono hover:text-accent tracking-widest"
        >
          + ADD SET
        </button>
      </Show>
    </div>
  )
}
