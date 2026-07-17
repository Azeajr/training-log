import { createSignal, createMemo, For, Show } from 'solid-js'
import { logAccessorySet, editAccessorySet, deleteLastAccessorySet, removeAccessory, startRest, setAccessoryNotes, type ActiveAccessory } from '../../store/workout-store'
import type { AccessorySet, Exercise } from '../../types/domain'
import { db } from '../../db/index'
import { ACCESSORY_PERCENTAGE, ACCESSORY_SETS, ACCESSORY_REPS, DEFAULT_ACCESSORY_INCREMENT_LB, roundToNearest5 } from '../../lib/calc'
import { showToast } from '../../store/toast-store'
import DurationInput from '../forms/DurationInput'
import Stepper from '../forms/Stepper'
import SetLogControls, { FieldRow } from '../forms/SetLogControls'
import SetReadout from '../forms/SetReadout'
import NotesField from '../forms/NotesField'
import PlateDisplay from '../forms/PlateDisplay'
import { settings } from '../../store/settings-store'
import { resolveExerciseLoading } from '../../lib/plate-loading'

// Pre-format an accessory set's value for the readout: reps, time (s), or
// distance (ft) — whichever the exercise type uses.
const fmtSetValue = (s: { reps?: number | null; duration?: number | null; distance?: number | null }) =>
  s.reps != null ? `${s.reps}`
    : s.duration != null ? `${s.duration}s`
    : s.distance != null ? `${s.distance}ft`
    : ''
import InlineConfirm from '../ui/InlineConfirm'

interface Props {
  accessory: ActiveAccessory
  exercise: Exercise | undefined
}

export default function AccessoryLog(props: Props) {
  const type = () => props.exercise?.type ?? 'reps'
  const loading = () => (props.exercise ? resolveExerciseLoading(props.exercise, settings.barWeight) : null)
  const nextSet = createMemo(() => props.accessory.loggedSets.length + 1)
  const [addingExtra, setAddingExtra] = createSignal(false)
  const done = createMemo(() => props.accessory.loggedSets.length >= ACCESSORY_SETS && !addingExtra())

  const initWeight = () => {
    const last = props.accessory.loggedSets[props.accessory.loggedSets.length - 1]
    return last?.weight ?? props.accessory.calculatedWeight ?? 0
  }

  const [weight, setWeight] = createSignal(initWeight())
  const [reps, setReps] = createSignal(ACCESSORY_REPS)
  const [duration, setDuration] = createSignal<number | null>(null)
  const [distance, setDistance] = createSignal(0)
  const [noteOpen, setNoteOpen] = createSignal(false)
  // Live value for the active-set headline, mirroring the stepper being edited.
  const activeValue = () =>
    type() === 'reps' ? `${reps()}`
      : type() === 'timed' ? (duration() != null ? `${duration()}s` : '')
      : `${distance()}ft`
  const [editingSetIdx, setEditingSetIdx] = createSignal<number | null>(null)
  const [editWeight, setEditWeight] = createSignal(0)
  const [editReps, setEditReps] = createSignal(0)
  const [editDuration, setEditDuration] = createSignal<number | null>(null)
  const [editDistance, setEditDistance] = createSignal(0)
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
    if (props.accessory.loggedSets.length === 0 && weight() !== (props.accessory.calculatedWeight ?? 0)) {
      const newTm = roundToNearest5(weight() / ACCESSORY_PERCENTAGE)
      const tms = await db.accessoryTrainingMaxes
        .where('exerciseId').equals(props.accessory.exerciseId)
        .sortBy('setAt')
      const currentTm = tms[tms.length - 1]
      try {
        await db.accessoryTrainingMaxes.add({
          exerciseId: props.accessory.exerciseId,
          weight: newTm,
          incrementLb: currentTm?.incrementLb ?? DEFAULT_ACCESSORY_INCREMENT_LB,
          setAt: new Date(),
        })
        showToast(`${props.accessory.exerciseName} TM updated → ${newTm}lb`)
      } catch {
        showToast('Failed to save training max')
        return
      }
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
    startRest(nextSet() >= ACCESSORY_SETS ? 'transition' : 'normal')
    setReps(ACCESSORY_REPS)
    setDuration(null)
    setDistance(0)
  }

  return (
    <div class="border border-border p-3 mb-3">
      <div class="text-text text-sm mb-1 uppercase tracking-widest flex items-center">
        <span class="flex-1">
          {props.accessory.exerciseName}
          <span class="text-muted ml-2 text-xs">{ACCESSORY_SETS}x{ACCESSORY_REPS} @</span>
          <span class="text-muted text-xs font-mono ml-1">{weight()}lb</span>
        </span>
        <InlineConfirm
          label="✕"
          confirmText="remove?"
          onConfirm={() => removeAccessory(props.accessory.exerciseId)}
          class="ml-2"
          strong
        />
      </div>
      <Show
        when={noteOpen()}
        fallback={
          <button
            onClick={() => setNoteOpen(true)}
            class={props.accessory.notes?.trim()
              ? 'block w-full text-left pl-2 mb-1 text-faint text-xs font-mono hover:text-accent truncate'
              : 'block pl-2 mb-1 text-faint text-xs font-mono hover:text-accent tracking-widest'}
          >
            {props.accessory.notes?.trim() || '+ NOTE'}
          </button>
        }
      >
        <div class="pl-2 mb-2">
          <NotesField
            value={props.accessory.notes ?? ''}
            onInput={v => setAccessoryNotes(props.accessory.exerciseId, v)}
            rows={2}
            placeholder="e.g. switched grip after set 3…"
            textareaClass="w-full bg-surface border border-border text-text font-mono px-2 py-2 text-xs focus:outline-none focus:border-accent resize-none"
          />
          <button
            onClick={() => setNoteOpen(false)}
            class="text-muted text-xs mt-0.5"
          >
            done
          </button>
        </div>
      </Show>
      <For each={props.accessory.loggedSets}>
        {(s, i) => {
          const isLast = () => i() === props.accessory.loggedSets.length - 1
          return (
            <Show
              when={editingSetIdx() === i()}
              fallback={
                <SetReadout
                  weight={s.weight}
                  value={fmtSetValue(s)}
                  leading={<span class="text-muted">Set {i() + 1}:</span>}
                  onClick={() => startEditSet(i())}
                  class="pl-2 py-0.5"
                  badges={<span class="text-accent ml-1">done</span>}
                  trailing={
                    <Show when={isLast()}>
                      <InlineConfirm
                        label="undo"
                        confirmText="undo set?"
                        onConfirm={() => deleteLastAccessorySet(props.accessory.exerciseId)}
                        class="ml-auto"
                      />
                    </Show>
                  }
                />
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
        <div class="mt-2 pl-2">
          <SetReadout
            weight={weight()}
            value={activeValue()}
            leading={<span class="text-warn">Set {nextSet()}</span>}
          />
          <Show when={loading()}>
            <PlateDisplay weight={weight()} loading={loading()!} />
          </Show>
          <SetLogControls
            weight={weight()}
            onWeightChange={setWeight}
            onLog={() => { void handleLog(); setAddingExtra(false) }}
          >
            <Show when={type() === 'reps'}>
              <FieldRow label="reps">
                <Stepper value={reps()} onChange={setReps} step={1} min={0} />
              </FieldRow>
            </Show>
            <Show when={type() === 'timed'}>
              <FieldRow label="time">
                <DurationInput value={duration()} onChange={setDuration} />
              </FieldRow>
            </Show>
            <Show when={type() === 'distance'}>
              <FieldRow label="dist">
                <Stepper value={distance()} onChange={setDistance} step={1} min={0} />
              </FieldRow>
            </Show>
          </SetLogControls>
        </div>
      </Show>
      <Show when={props.accessory.loggedSets.length >= ACCESSORY_SETS && !addingExtra()}>
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
