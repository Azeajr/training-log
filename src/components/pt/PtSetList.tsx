import { createSignal, For, Show } from 'solid-js'
import type { PtExercise } from '../../types/domain'
import { formatPtResistance, formatPtTarget, resolvePtCheck } from '../../lib/pt'
import { addPtSet, removePtSet, setPtSetFields, type PtRunSet } from '../../store/pt-store'
import { FieldRow } from '../forms/SetLogControls'
import SetReadout from '../forms/SetReadout'
import Stepper from '../forms/Stepper'
import DurationInput from '../forms/DurationInput'
import InlineConfirm from '../ui/InlineConfirm'

interface Props {
  exercise: PtExercise
  sets: PtRunSet[]
}

const INPUT_CLASS = 'bg-surface border border-border text-text px-2 py-1 text-sm focus:outline-none focus:border-accent'

/**
 * What a set reads as, split the way `SetReadout` expects it.
 *
 * Weight goes in its own slot so the row renders "10lb × 10 reps" like every
 * other logger. A band is not a weight, so it joins the value text instead —
 * which leaves the same bare "× 10 reps" a bodyweight accessory set already
 * shows.
 */
function describe(exercise: PtExercise, set: PtRunSet): { weight: number | null; value: string } {
  const actual = resolvePtCheck(exercise, set)
  const merged = {
    ...exercise,
    targetReps: actual.reps, targetSeconds: actual.seconds,
    targetDistance: actual.distance, distanceUnit: actual.distanceUnit,
    resistanceWeight: null, resistanceBand: actual.band,
  }
  const height = actual.equipmentHeight == null
    ? '' : `${actual.equipmentHeight} ${actual.equipmentHeightUnit ?? 'in'} high`
  return {
    weight: actual.weight,
    value: [formatPtTarget(merged), formatPtResistance(merged), height].filter(Boolean).join(' . '),
  }
}

/**
 * One exercise's sets during a run, in the app's four states: upcoming, active,
 * recorded, and being edited.
 *
 * Any set opens its editor, not just the active one — a set logged wrong is
 * noticed while the next one is already under way, and having to finish the
 * exercise before fixing it is how a wrong number ends up saved.
 */
export default function PtSetList(props: Props) {
  const [editing, setEditing] = createSignal<number | null>(null)
  const exercise = () => props.exercise
  const routineId = () => props.exercise.routineId
  const activeIndex = () => props.sets.findIndex(s => !s.done)

  const patch = (index: number, fields: Partial<PtRunSet>) =>
    setPtSetFields(exercise().id!, index + 1, fields, routineId())

  // Seeded from what the set already holds, falling back to the prescription,
  // so opening the editor on an untouched set shows what it would record.
  const valueOf = (index: number) => resolvePtCheck(exercise(), props.sets[index] ?? {})

  return (
    <div class="mb-2">
      <For each={props.sets}>
        {(set, i) => (
          <Show
            when={editing() === i()}
            fallback={
              // The tick sits OUTSIDE SetReadout, not in its `leading` slot:
              // that slot renders inside the row's own button, and a checkbox
              // nested in a button is unreachable and merges its accessible name
              // into the row's. SetReadout keeps `trailing` outside for the same
              // reason.
              <div class="flex items-center gap-2 py-0.5">
                <button
                  role="checkbox"
                  aria-checked={set.done}
                  aria-label={`${exercise().name} set ${i() + 1}, ${formatPtTarget(exercise())}${
                    formatPtResistance(exercise()) ? `, ${formatPtResistance(exercise())}` : ''
                  }`}
                  onClick={() => patch(i(), { done: !set.done })}
                  class={`border px-2 py-1 shrink-0 text-xs font-mono tracking-widest transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    set.done
                      ? 'border-accent text-accent bg-surface-high'
                      : 'border-border text-muted hover:border-accent hover:text-accent'
                  }`}
                >
                  <span aria-hidden="true">{set.done ? '[x]' : '[ ]'} </span>
                  {i() + 1}
                </button>
                <SetReadout
                  weight={describe(exercise(), set).weight}
                  value={describe(exercise(), set).value}
                  size="sm"
                  tone={set.done ? undefined : 'text-faint'}
                  onClick={() => setEditing(i())}
                  badges={<Show when={i() === activeIndex()}><span class="text-warn ml-1">next</span></Show>}
                  trailing={
                    <InlineConfirm
                      label="✕"
                      ariaLabel={`Remove ${exercise().name} set ${i() + 1}`}
                      confirmText="remove set?"
                      onConfirm={() => removePtSet(exercise().id!, i() + 1, routineId())}
                      class="ml-auto"
                    />
                  }
                  class="flex-1 min-w-0"
                />
              </div>
            }
          >
            <div class="border border-accent px-2 py-2 mb-1 flex flex-col gap-2">
              <span class="text-warn text-xs tracking-widest uppercase">Set {i() + 1}</span>

              <Show when={exercise().measure === 'reps'}>
                <FieldRow label="reps">
                  <Stepper
                    value={valueOf(i()).reps ?? 0}
                    onChange={v => patch(i(), { reps: v })}
                    step={1} min={0} fieldLabel={`set ${i() + 1} reps`}
                  />
                </FieldRow>
              </Show>
              <Show when={exercise().measure === 'time'}>
                <FieldRow label="time">
                  <DurationInput
                    value={valueOf(i()).seconds}
                    onChange={v => patch(i(), { seconds: v })}
                    fieldLabel={`set ${i() + 1}`}
                  />
                </FieldRow>
              </Show>
              <Show when={exercise().measure === 'distance'}>
                <FieldRow label="dist">
                  <Stepper
                    value={valueOf(i()).distance ?? 0}
                    onChange={v => patch(i(), { distance: v })}
                    step={1} min={0} fieldLabel={`set ${i() + 1} distance`}
                  />
                </FieldRow>
              </Show>

              <Show when={exercise().resistanceKind === 'weight'}>
                <FieldRow label="wt">
                  <Stepper
                    value={valueOf(i()).weight ?? 0}
                    onChange={v => patch(i(), { weight: v })}
                    step={2.5} min={0} fieldLabel={`set ${i() + 1} weight`}
                  />
                </FieldRow>
              </Show>
              <Show when={exercise().resistanceKind === 'band'}>
                <FieldRow label="band">
                  <input
                    type="text"
                    value={valueOf(i()).band ?? ''}
                    onInput={e => patch(i(), { band: e.currentTarget.value })}
                    aria-label={`Set ${i() + 1} band`}
                    class={`${INPUT_CLASS} w-full`}
                  />
                </FieldRow>
              </Show>

              <FieldRow label="height">
                <Stepper
                  value={valueOf(i()).equipmentHeight ?? 0}
                  onChange={v => patch(i(), {
                    equipmentHeight: v === 0 ? null : v,
                    equipmentHeightUnit: v === 0 ? null : valueOf(i()).equipmentHeightUnit ?? 'in',
                  })}
                  step={1} min={0} fieldLabel={`set ${i() + 1} equipment height`}
                />
                <span class="text-muted text-xs">{valueOf(i()).equipmentHeightUnit ?? 'in'}</span>
              </FieldRow>

              <div class="flex gap-2">
                <button
                  onClick={() => { patch(i(), { done: true }); setEditing(null) }}
                  class="flex-1 border border-accent text-accent py-2 font-mono text-sm tracking-widest"
                >
                  LOG
                </button>
                <button onClick={() => setEditing(null)} class="text-muted text-xs px-2">cancel</button>
              </div>
            </div>
          </Show>
        )}
      </For>

      <button
        onClick={() => addPtSet(exercise().id!, routineId())}
        class="w-full text-left mt-1 text-faint text-xs font-mono hover:text-accent tracking-widest"
      >
        + ADD SET
      </button>
    </div>
  )
}
