import { For, Show } from 'solid-js'
import { db } from '../../db/index'
import type { PtExercise, PtSetCheck } from '../../types/domain'
import {
  formatPtPrescription,
  ptCheckActuals,
  readRecordedPtSet,
  recordedPtRunSetFields,
  resolvePtCheck,
  updatePtSession,
  type PtRecordedKinds,
  type PtSessionDetail,
} from '../../lib/pt'
import {
  applyPtSetPatch,
  withPtSetAdded,
  withPtSetRemoved,
  type PtRunSet,
} from '../../store/pt-store'
import { useSingleFlight } from '../../hooks/use-single-flight'
import { showToast } from '../../store/toast-store'
import SectionLabel from '../layout/SectionLabel'
import SubLabel from '../layout/SubLabel'
import NotesField from '../forms/NotesField'
import PtSetList, { ptSetDraftChanged, type PtSetDraft } from './PtSetList'

interface Props {
  detail: PtSessionDetail
  /** The edit in progress. Owned above, because this component unmounts on a fold. */
  draft: PtRunDraft
  onDraftChange: (next: PtRunDraft) => void
  onSaved: () => void
  onCancel: () => void
}

/**
 * Everything an unsaved edit of a recorded run consists of.
 *
 * Held by whatever outlives the editor rather than by the editor, because the
 * editor sits inside a collapsible history row: folding the row unmounted it and
 * took the work with it, with no prompt and no sign that anything had been lost.
 *
 * `pending` is the other half. A3's inner set editor buffers field changes until
 * APPLY SET CHANGES, so text typed but not applied is in neither `sets` nor the
 * database, and lifting only the applied half would still lose it on a fold.
 */
export interface PtRunDraft {
  sets: Record<number, PtRecordedSet[]>
  notes: string
  exerciseNotes: Record<number, string>
  /** Open set editors, by ptExercise id. Not yet applied to `sets`. */
  pending: Record<number, PtSetDraft>
  /**
   * Whether anything has been applied to the draft.
   *
   * A flag rather than a comparison against the saved run: it answers the only
   * question the collapsed row asks, and the one thing it gets wrong — a value
   * changed and changed back still counts — errs toward warning about work that
   * turns out to be identical, never toward discarding work that is not.
   */
  dirty: boolean
}

/** A recorded run as an edit of it starts: exactly what the database says. */
export function seedPtRunDraft(detail: PtSessionDetail): PtRunDraft {
  return {
    sets: Object.fromEntries(
      detail.exercises.map(row => [row.exercise.id!, row.checks.map(c => toRunSet(c, row.exercise))]),
    ),
    notes: detail.session.notes ?? '',
    exerciseNotes: Object.fromEntries(detail.exercises.map(row => [row.exercise.id!, row.note ?? ''])),
    pending: {},
    dirty: false,
  }
}

/** Whether a draft is holding anything a fold or a departure would lose. */
export const ptRunDraftDirty = (draft: PtRunDraft | undefined): boolean =>
  draft != null && (draft.dirty || Object.values(draft.pending).some(ptSetDraftChanged))

const NOTE_CLASS = 'w-full bg-surface border border-border text-text font-mono px-2 py-2 text-xs focus:outline-none focus:border-accent resize-none'

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'something went wrong'

/** A draft of a set that already happened: the live shape, plus what it meant. */
type PtRecordedSet = PtRunSet & PtRecordedKinds

/**
 * A recorded set as the editor holds it.
 *
 * Every field is materialized rather than left to fall back, because that is
 * what saving will write — a legacy row that recorded only a tick resolves
 * against the prescription once, here, and is concrete from then on.
 *
 * The kinds ride along unresolved. A row that has them keeps them; one written
 * before they existed keeps the gap, so saving the run again does not write
 * today's routine into the past as though it were known history.
 */
const toRunSet = (check: PtSetCheck, exercise: PtExercise): PtRecordedSet => ({
  done: check.done,
  ...ptCheckActuals(check, exercise),
  measure: check.measure ?? null,
  resistanceKind: check.resistanceKind ?? null,
})

/**
 * A set added to a run that is already history.
 *
 * It is a new record, so unlike its neighbours it takes the routine as it
 * stands — which is the context its own editor is about to show — and is
 * materialized straight away like every other set in the draft.
 */
const addedRunSet = (sets: PtRecordedSet[], exercise: PtExercise): PtRecordedSet[] => {
  const next = withPtSetAdded(sets)
  const added = next[next.length - 1]
  next[next.length - 1] = {
    done: added.done,
    ...resolvePtCheck(exercise, added),
    measure: exercise.measure,
    resistanceKind: exercise.resistanceKind,
  }
  return next
}

/**
 * Edit a run that has already been saved.
 *
 * Drafted entirely in local state and written on SAVE, the same shape as a live
 * run: nothing is touched until the user commits, so backing out costs nothing
 * and a failed write leaves the edit on screen to retry.
 */
export default function PtSessionEditor(props: Props) {
  /** Applied changes mark the run unsaved; an open set editor does not, yet. */
  const edit = (patch: Partial<PtRunDraft>) =>
    props.onDraftChange({ ...props.draft, ...patch, dirty: true })

  const notes = () => props.draft.notes
  const exerciseNotes = () => props.draft.exerciseNotes

  // APPLY SET CHANGES puts an edit into the draft below; SAVE CHANGES writes the
  // draft. An edit still sitting in the inner editor is in neither, and saving
  // over it would look exactly like saving it.
  const hasPending = () => Object.values(props.draft.pending).some(ptSetDraftChanged)

  const setsOf = (exerciseId: number) => props.draft.sets[exerciseId] ?? []
  const update = (exerciseId: number, next: PtRecordedSet[]) =>
    edit({ sets: { ...props.draft.sets, [exerciseId]: next } })

  const setDraftFor = (exerciseId: number, next: PtSetDraft | null) => {
    const pending = { ...props.draft.pending }
    if (next === null) delete pending[exerciseId]
    else pending[exerciseId] = next
    // Opening or typing in a set editor is not yet a change to the run, so this
    // one does not go through `edit`.
    props.onDraftChange({ ...props.draft, pending })
  }

  const { busy: saving, guard } = useSingleFlight()

  const handleSave = guard(async () => {
    if (hasPending()) {
      showToast('One set has unapplied changes.')
      return
    }
    try {
      await updatePtSession(db, {
        sessionId: props.detail.session.id!,
        notes: notes(),
        exercises: props.detail.exercises.map(row => ({
          ptExerciseId: row.exercise.id!,
          checks: setsOf(row.exercise.id!).map((set, i) => ({
            setNumber: i + 1,
            done: set.done,
            // The draft, passed through. Re-resolving here against a routine
            // that has since changed is what erased recorded work on any save,
            // including a notes-only one.
            ...recordedPtRunSetFields(set),
          })),
          note: exerciseNotes()[row.exercise.id!] ?? null,
        })),
      })
      showToast('Run updated.')
      props.onSaved()
    } catch (err) {
      showToast(`Could not save that run: ${message(err)}`)
    }
  })

  return (
    <fieldset disabled={saving()} class="min-w-0">
      <For each={props.detail.exercises}>
        {row => (
          <div class="border border-border px-3 py-3 mb-3">
            <div class="text-text text-sm uppercase tracking-widest">{row.exercise.name}</div>
            <div class="text-faint text-xs mb-2">{formatPtPrescription(row.exercise)}</div>

            <PtSetList
              exercise={row.exercise}
              sets={setsOf(row.exercise.id!)}
              read={set => readRecordedPtSet(row.exercise, set)}
              commitLabel="APPLY SET CHANGES"
              draft={props.draft.pending[row.exercise.id!] ?? null}
              onDraftChange={next => setDraftFor(row.exercise.id!, next)}
              onPatch={(setNumber, fields) =>
                update(row.exercise.id!, applyPtSetPatch(setsOf(row.exercise.id!), setNumber, fields))}
              onAdd={() => update(row.exercise.id!, addedRunSet(setsOf(row.exercise.id!), row.exercise))}
              onRemove={setNumber =>
                update(row.exercise.id!, withPtSetRemoved(setsOf(row.exercise.id!), setNumber))}
            />

            <SubLabel class="mb-1">NOTE</SubLabel>
            <NotesField
              value={exerciseNotes()[row.exercise.id!] ?? ''}
              onInput={v => edit({ exerciseNotes: { ...exerciseNotes(), [row.exercise.id!]: v } })}
              rows={2}
              placeholder="Swapped to the green band"
              ariaLabel={`Note for ${row.exercise.name}`}
              textareaClass={NOTE_CLASS}
            />
          </div>
        )}
      </For>

      <div class="mb-3">
        <SectionLabel class="mb-1">SESSION NOTES</SectionLabel>
        <NotesField
          value={notes()}
          onInput={v => edit({ notes: v })}
          rows={2}
          placeholder="Shoulder felt better than Tuesday"
          ariaLabel="Session notes"
          textareaClass={NOTE_CLASS}
        />
      </div>

      <div class="flex gap-2">
        {/* Not "CANCEL": the set editor inside this one has a CANCEL of its
            own with a much smaller scope, and two nested controls under one
            word with opposite reach is how the draft got lost in the first
            place. This one is the pair to SAVE CHANGES beside it. */}
        <button
          onClick={() => props.onCancel()}
          class="flex-1 border border-border text-muted px-3 py-2 text-xs tracking-widest uppercase"
        >
          DISCARD CHANGES
        </button>
        <button
          onClick={() => void handleSave()}
          class="flex-1 border border-accent text-accent px-3 py-2 text-xs tracking-widest uppercase disabled:opacity-40"
        >
          <Show when={saving()} fallback="SAVE CHANGES">SAVING…</Show>
        </button>
      </div>
    </fieldset>
  )
}
