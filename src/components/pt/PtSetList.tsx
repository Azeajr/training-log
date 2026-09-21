import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import type { PtExercise } from '../../types/domain'
import {
  changedPtActuals,
  formatPtResistance,
  formatPtTarget,
  ptActualParts,
  readLivePtSet,
  type PtSetActuals,
  type PtSetReading,
} from '../../lib/pt'
import type { PtRunSet } from '../../store/pt-store'
import { showToast } from '../../store/toast-store'
import { FieldRow } from '../forms/SetLogControls'
import SetReadout from '../forms/SetReadout'
import Stepper from '../forms/Stepper'
import DurationInput from '../forms/DurationInput'
import InlineConfirm from '../ui/InlineConfirm'

interface Props {
  exercise: PtExercise
  sets: PtRunSet[]
  /**
   * Apply a patch to one set. The caller owns where the sets live — the live run
   * writes to `pt-store`, an edit of a recorded run to local state — and both
   * route through the same pure helpers so carry-forward behaves identically.
   */
  onPatch: (setNumber: number, fields: Partial<PtRunSet>) => void
  onAdd: () => void
  onRemove: (setNumber: number) => void
  /**
   * How to read one set: which kinds it has, and what it holds.
   *
   * Defaults to a live run's reading, where a blank field still means "as
   * prescribed" and resolves against `exercise`. A recorded run passes its own,
   * because its sets are already materialized and are read under the kinds they
   * were DONE under — resolving those again against today's routine is what
   * erased them.
   */
  read?: (set: PtRunSet, index: number) => PtSetReading
  /**
   * The primary commit button's label. Defaults to `SAVE SET CHANGES`.
   *
   * Passing one also means "this list has no completion semantics of its own":
   * the `LOG SET` action, which commits AND ticks, is only offered when the
   * label is left alone. A run being edited in history is already finished, so
   * its inner action says what it does — apply into the run draft, which the
   * enclosing SAVE CHANGES still has to write.
   */
  commitLabel?: string
  /**
   * Told whenever this list gains or loses unapplied set edits.
   *
   * The draft lives here, but the buttons that would destroy it — FINISH, SAVE
   * CHANGES, leaving the screen — live above. They ask through this.
   */
  onPendingChange?: (pending: boolean) => void
}

/**
 * A set being edited: which one, what it opened on, and what it says now.
 *
 * `initial` is what makes the commit sparse. Without it the editor could only
 * offer the whole snapshot, and see `changedPtActuals` for why that is not the
 * same thing.
 */
interface PtSetDraft {
  index: number
  initial: Required<PtSetActuals>
  values: Required<PtSetActuals>
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
function describe(reading: PtSetReading): { weight: number | null; value: string } {
  const parts = ptActualParts(reading.context, reading.values)
  return {
    weight: parts.weight,
    value: [parts.target, parts.resistance, parts.height].filter(Boolean).join(' . '),
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
  const [draft, setDraft] = createSignal<PtSetDraft | null>(null)
  const editing = () => draft()?.index ?? null
  const exercise = () => props.exercise
  const activeIndex = () => props.sets.findIndex(s => !s.done)

  const reading = (index: number): PtSetReading => {
    const set = props.sets[index] ?? { done: false }
    return props.read ? props.read(set, index) : readLivePtSet(exercise(), set)
  }

  // Which fields a set HAS. Read from the set's own reading, so an old set keeps
  // the shape it was recorded in while the routine moves on around it.
  const contextOf = (index: number) => reading(index).context

  /**
   * What the editor shows: the open draft for the set being edited, the set's
   * own reading for every other row.
   */
  const valueOf = (index: number) => {
    const open = draft()
    return open?.index === index ? open.values : reading(index).values
  }

  const changes = () => {
    const open = draft()
    return open ? changedPtActuals(open.initial, open.values) : {}
  }
  const dirty = () => Object.keys(changes()).length > 0

  // The draft is memory-only, so everything that could destroy it asks first.
  createEffect(() => props.onPendingChange?.(dirty()))
  onCleanup(() => props.onPendingChange?.(false))

  const openEditor = (index: number) => {
    if (dirty()) {
      // Never silently commit and never silently drop: two editors cannot be
      // open at once, so the one already open has to be settled by hand.
      showToast('Apply or cancel the open set first.')
      return
    }
    const values = reading(index).values
    setDraft({ index, initial: { ...values }, values: { ...values } })
  }

  const patchDraft = (fields: PtSetActuals) =>
    setDraft(open => open && { ...open, values: { ...open.values, ...fields } })

  const closeEditor = () => setDraft(null)

  /**
   * Send the edit up, as a patch of only what changed.
   *
   * `done` is passed only by an action that means to change completion. Opening
   * a set and committing without touching anything sends nothing at all, which
   * is what keeps carry-forward from pushing untouched equipment into the sets
   * below.
   */
  const commit = (index: number, done?: boolean) => {
    const fields = changes()
    if (done !== undefined || Object.keys(fields).length > 0) {
      props.onPatch(index + 1, done === undefined ? fields : { ...fields, done })
    }
    closeEditor()
  }

  /**
   * Removing a set renumbers every set after it, so an open draft has to follow
   * the set it belongs to rather than stay on an index that now holds a
   * different one. Removing the set being edited takes its draft with it.
   */
  const handleRemove = (setNumber: number) => {
    const open = draft()
    if (open) {
      if (open.index === setNumber - 1) closeEditor()
      else if (open.index > setNumber - 1) setDraft({ ...open, index: open.index - 1 })
    }
    props.onRemove(setNumber)
  }

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
                  aria-label={`${exercise().name} set ${i() + 1}, ${formatPtTarget(contextOf(i()))}${
                    formatPtResistance(contextOf(i())) ? `, ${formatPtResistance(contextOf(i()))}` : ''
                  }`}
                  onClick={() => props.onPatch(i() + 1, { done: !set.done })}
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
                  weight={describe(reading(i())).weight}
                  value={describe(reading(i())).value}
                  size="sm"
                  tone={set.done ? undefined : 'text-faint'}
                  onClick={() => openEditor(i())}
                  badges={<Show when={i() === activeIndex()}><span class="text-warn ml-1">next</span></Show>}
                  trailing={
                    <InlineConfirm
                      label="✕"
                      ariaLabel={`Remove ${exercise().name} set ${i() + 1}`}
                      confirmText="remove set?"
                      onConfirm={() => handleRemove(i() + 1)}
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

              <Show when={contextOf(i()).measure === 'reps'}>
                <FieldRow label="reps">
                  <Stepper
                    value={valueOf(i()).reps ?? 0}
                    onChange={v => patchDraft({ reps: v })}
                    step={1} min={0} fieldLabel={`set ${i() + 1} reps`}
                  />
                </FieldRow>
              </Show>
              <Show when={contextOf(i()).measure === 'time'}>
                <FieldRow label="time">
                  <DurationInput
                    value={valueOf(i()).seconds}
                    onChange={v => patchDraft({ seconds: v })}
                    fieldLabel={`set ${i() + 1}`}
                  />
                </FieldRow>
              </Show>
              <Show when={contextOf(i()).measure === 'distance'}>
                <FieldRow label="dist">
                  <Stepper
                    value={valueOf(i()).distance ?? 0}
                    onChange={v => patchDraft({ distance: v })}
                    step={1} min={0} fieldLabel={`set ${i() + 1} distance`}
                  />
                </FieldRow>
              </Show>

              <Show when={contextOf(i()).resistanceKind === 'weight'}>
                <FieldRow label="wt">
                  {/* Zero is "unloaded", not "loaded with nothing" — the same
                      reading the height field below takes, and the one
                      `validatePtExercise` enforces on the prescription by
                      refusing a weighted exercise with no weight. Stored as an
                      explicit null so the set reads "× 10 reps" rather than
                      "0lb × 10 reps", which is how a set dropped to bodyweight
                      on an otherwise loaded exercise should read. */}
                  <Stepper
                    value={valueOf(i()).weight ?? 0}
                    onChange={v => patchDraft({ weight: v === 0 ? null : v })}
                    step={2.5} min={0} fieldLabel={`set ${i() + 1} weight`}
                  />
                </FieldRow>
              </Show>
              <Show when={contextOf(i()).resistanceKind === 'band'}>
                <FieldRow label="band">
                  <input
                    type="text"
                    value={valueOf(i()).band ?? ''}
                    onInput={e => patchDraft({ band: e.currentTarget.value })}
                    aria-label={`Set ${i() + 1} band`}
                    class={`${INPUT_CLASS} w-full`}
                  />
                </FieldRow>
              </Show>

              <FieldRow label="height">
                <Stepper
                  value={valueOf(i()).equipmentHeight ?? 0}
                  onChange={v => patchDraft({
                    equipmentHeight: v === 0 ? null : v,
                    equipmentHeightUnit: v === 0 ? null : valueOf(i()).equipmentHeightUnit ?? 'in',
                  })}
                  step={1} min={0} fieldLabel={`set ${i() + 1} equipment height`}
                />
                <span class="text-muted text-xs">{valueOf(i()).equipmentHeightUnit ?? 'in'}</span>
              </FieldRow>

              {/* Two named actions rather than one that also ticks. Correcting a
                  number and saying the set is finished are different claims, and
                  LOG made the second the only way to do the first. CANCEL now
                  cancels, so it is spelled like the other commit controls. */}
              <div class="flex gap-2">
                <Show when={props.commitLabel === undefined && !set.done}>
                  <button
                    onClick={() => commit(i(), true)}
                    class="flex-1 border border-accent text-accent py-2 font-mono text-sm tracking-widest"
                  >
                    LOG SET
                  </button>
                </Show>
                <button
                  onClick={() => commit(i())}
                  class="flex-1 border border-border text-muted py-2 font-mono text-sm tracking-widest"
                >
                  {props.commitLabel ?? 'SAVE SET CHANGES'}
                </button>
                <button onClick={closeEditor} class="text-muted text-xs px-2">CANCEL</button>
              </div>
            </div>
          </Show>
        )}
      </For>

      <button
        onClick={() => props.onAdd()}
        class="w-full text-left mt-1 text-faint text-xs font-mono hover:text-accent tracking-widest"
      >
        + ADD SET
      </button>
    </div>
  )
}
