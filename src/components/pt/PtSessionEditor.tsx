import { createSignal, For, Show } from 'solid-js'
import { db } from '../../db/index'
import type { PtExercise, PtSetCheck } from '../../types/domain'
import {
  formatPtPrescription,
  ptCheckActuals,
  resolvePtCheck,
  updatePtSession,
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
import PtSetList from './PtSetList'

interface Props {
  detail: PtSessionDetail
  onSaved: () => void
  onCancel: () => void
}

const NOTE_CLASS = 'w-full bg-surface border border-border text-text font-mono px-2 py-2 text-xs focus:outline-none focus:border-accent resize-none'

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'something went wrong'

/**
 * A recorded set as the editor holds it.
 *
 * Every field is materialized rather than left to fall back, because that is
 * what saving will write — a legacy row that recorded only a tick resolves
 * against the prescription once, here, and is concrete from then on.
 */
const toRunSet = (check: PtSetCheck, exercise: PtExercise): PtRunSet => ({
  done: check.done,
  ...ptCheckActuals(check, exercise),
})

/**
 * Edit a run that has already been saved.
 *
 * Drafted entirely in local state and written on SAVE, the same shape as a live
 * run: nothing is touched until the user commits, so backing out costs nothing
 * and a failed write leaves the edit on screen to retry.
 */
export default function PtSessionEditor(props: Props) {
  const seed = (): Record<number, PtRunSet[]> => Object.fromEntries(
    props.detail.exercises.map(row => [row.exercise.id!, row.checks.map(c => toRunSet(c, row.exercise))]),
  )

  const [sets, setSets] = createSignal<Record<number, PtRunSet[]>>(seed())
  const [notes, setNotes] = createSignal(props.detail.session.notes ?? '')
  const [exerciseNotes, setExerciseNotes] = createSignal<Record<number, string>>(
    Object.fromEntries(props.detail.exercises.map(row => [row.exercise.id!, row.note ?? ''])),
  )

  const setsOf = (exerciseId: number) => sets()[exerciseId] ?? []
  const update = (exerciseId: number, next: PtRunSet[]) =>
    setSets(current => ({ ...current, [exerciseId]: next }))

  const { busy: saving, guard } = useSingleFlight()

  const handleSave = guard(async () => {
    try {
      await updatePtSession(db, {
        sessionId: props.detail.session.id!,
        notes: notes(),
        exercises: props.detail.exercises.map(row => ({
          ptExerciseId: row.exercise.id!,
          checks: setsOf(row.exercise.id!).map((set, i) => ({
            setNumber: i + 1,
            done: set.done,
            ...resolvePtCheck(row.exercise, set),
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
              onPatch={(setNumber, fields) =>
                update(row.exercise.id!, applyPtSetPatch(setsOf(row.exercise.id!), setNumber, fields))}
              onAdd={() => update(row.exercise.id!, withPtSetAdded(setsOf(row.exercise.id!)))}
              onRemove={setNumber =>
                update(row.exercise.id!, withPtSetRemoved(setsOf(row.exercise.id!), setNumber))}
            />

            <SubLabel class="mb-1">NOTE</SubLabel>
            <NotesField
              value={exerciseNotes()[row.exercise.id!] ?? ''}
              onInput={v => setExerciseNotes(current => ({ ...current, [row.exercise.id!]: v }))}
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
          onInput={setNotes}
          rows={2}
          placeholder="Shoulder felt better than Tuesday"
          ariaLabel="Session notes"
          textareaClass={NOTE_CLASS}
        />
      </div>

      <div class="flex gap-2">
        <button
          onClick={() => props.onCancel()}
          class="flex-1 border border-border text-muted px-3 py-2 text-xs tracking-widest uppercase"
        >
          CANCEL
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
