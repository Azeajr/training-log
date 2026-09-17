import { createMemo, createSignal, For, Index, Show } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import { db } from '../db/index'
import type { PtExercise } from '../types/domain'
import {
  commitPtSession,
  formatPtPrescription,
  formatPtResistance,
  formatPtTarget,
  getPtRoutine,
  type PtRoutineDetail,
} from '../lib/pt'
import {
  clearPtRun,
  getPtExerciseNote,
  getPtRun,
  ptSessionRoutineIds,
  isPtSetDone,
  ptExerciseNotesForCommit,
  ptPersistenceError,
  setPtExerciseNote,
  setPtNotes,
  startPtRun,
  togglePtSet,
} from '../store/pt-store'
import { createAsyncRead } from '../lib/async-read'
import { useConfirmation } from '../hooks/use-confirmation'
import { useSingleFlight } from '../hooks/use-single-flight'
import { showToast } from '../store/toast-store'
import Rule from '../components/layout/Rule'
import SectionLabel from '../components/layout/SectionLabel'
import SubLabel from '../components/layout/SubLabel'

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'something went wrong'

/**
 * Run selected PT routines together, keeping each routine's history separate.
 *
 * Ticks live in `store/pt-store` until FINISH writes the whole run in one
 * transaction. That is the entire reason there is no "pending" PT session in
 * the database: nothing exists to resume incorrectly, and DISCARD is a store
 * reset rather than a delete that has to be guarded against a concurrent
 * completion.
 */
export default function PtRun() {
  const params = useParams<{ routineId: string }>()
  const navigate = useNavigate()
  const { confirm } = useConfirmation()

  const routineId = (): number | null => {
    const parsed = Number(params.routineId)
    return Number.isInteger(parsed) ? parsed : null
  }

  const [groups, setGroups] = createSignal<PtRoutineDetail[]>([])
  const exercises = createMemo(() => groups().flatMap(group => group.exercises))
  const routineName = () => groups().length === 1 ? groups()[0].routine.name : 'PT SESSION'
  const groupDone = (items: PtExercise[]) => items.reduce((sum, ex) => sum +
    Array.from({ length: ex.sets }, (_, i) => i + 1).filter(n => isPtSetDone(ex.id!, n, ex.routineId)).length, 0)

  const read = createAsyncRead()

  const load = async (isCurrent: () => boolean) => {
    const id = routineId()
    if (params.routineId !== undefined && id === null) {
      if (isCurrent()) navigate('/pt', { replace: true })
      return
    }
    const ids = [...new Set([...ptSessionRoutineIds(), ...(id === null ? [] : [id])])]
    const details = await Promise.all(ids.map(id => getPtRoutine(db, id)))
    if (!isCurrent()) return
    if (!details.length || details.some(detail => !detail || detail.exercises.length === 0)) {
      showToast(details.some(detail => !detail) ? 'That routine no longer exists.' : 'That routine has no exercises yet.')
      navigate('/pt', { replace: true })
      return
    }
    if (id !== null) startPtRun(id)
    setGroups((details as PtRoutineDetail[]).sort((a, b) => a.routine.order - b.routine.order))
  }

  void read.run(load)

  const total = createMemo(() => exercises().reduce((sum, ex) => sum + ex.sets, 0))
  const doneCount = createMemo(() =>
    exercises().reduce(
      (sum, ex) => sum + Array.from({ length: ex.sets }, (_, i) => i + 1)
        .filter(setNumber => isPtSetDone(ex.id!, setNumber, ex.routineId)).length,
      0,
    ),
  )

  const { busy: finishing, guard } = useSingleFlight()

  const handleFinish = guard(async () => {
    if (!groups().length) return

    if (doneCount() === 0) {
      if (!await confirm(
        'Nothing is ticked off. Save this run anyway?',
        { confirmLabel: 'SAVE' },
      )) return
    }

    const runs = groups().map(group => {
      const id = group.routine.id!
      const run = getPtRun(id)!
      const checks = group.exercises.flatMap(ex =>
        Array.from({ length: ex.sets }, (_, i) => ({
          ptExerciseId: ex.id!,
          setNumber: i + 1,
          done: isPtSetDone(ex.id!, i + 1, id),
        })),
      )

      return {
        routineId: id,
        // The moment the run STARTED, not the moment it was saved: a session
        // begun at 11pm and saved after midnight belongs to the day it was
        // done. Falls back to now for a run whose store entry predates this.
        date: run.startedAt != null ? new Date(run.startedAt) : new Date(),
        notes: run.notes,
        checks,
        exerciseNotes: ptExerciseNotesForCommit(id),
      }
    })
    try {
      await commitPtSession(db, runs)
      // Cleared only after the write lands. A failed commit keeps every tick,
      // so the user can retry rather than re-ticking the whole routine.
      const completed = doneCount()
      groups().forEach(group => clearPtRun(group.routine.id!))
      showToast(`${routineName()} logged — ${completed}/${total()} done.`)
      navigate('/pt')
    } catch (err) {
      showToast(`Could not save that run: ${message(err)}`)
    }
  })

  const handleDiscard = async () => {
    const hasNotes = groups().some(group => {
      const run = getPtRun(group.routine.id!)
      return run?.notes.trim() || Object.values(run?.exerciseNotes ?? {}).some(note => note.trim())
    })
    if ((doneCount() > 0 || hasNotes) && !await confirm(
      'Discard this PT session? Nothing will be saved.',
      { destructive: true, confirmLabel: 'DISCARD' },
    )) return
    groups().forEach(group => clearPtRun(group.routine.id!))
    navigate('/pt')
  }

  return (
    <Show
      when={!read.error()}
      fallback={
        <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
          <div role="alert" class="border border-danger px-3 py-2">
            <div class="text-danger text-xs uppercase tracking-widest mb-1">Could not load routine</div>
            <div class="text-text-dim text-sm mb-2 break-words">{read.error()}</div>
            <button
              onClick={() => void read.retry()}
              class="border border-danger text-danger px-3 py-1 text-xs tracking-widest uppercase"
            >
              RETRY
            </button>
          </div>
        </div>
      }
    >
      <Show
        when={exercises().length > 0}
        fallback={<div class="p-4 md:p-8 font-mono text-muted text-sm tracking-widest uppercase">Loading…</div>}
      >
        <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
          <Rule label={routineName()} labelSuffix={`. ${doneCount()}/${total()}`} class="text-muted mb-4" />

          <button
            onClick={() => navigate('/pt')}
            disabled={finishing()}
            class="border border-border text-muted px-3 py-2 text-xs tracking-widest mb-4"
          >
            BACK TO ROUTINES
          </button>

          <Show when={ptPersistenceError()}>
            <div role="alert" class="border border-warn text-warn px-3 py-2 text-xs mb-4">
              Ticks are not being saved to this device ({ptPersistenceError()}). Finish the run
              before reloading, or they will be lost.
            </div>
          </Show>

          <fieldset disabled={finishing()} class="min-w-0">
          <For each={groups()}>{group => (
            <details open aria-label={`${group.routine.name} routine`} class="mb-4 border border-border p-3">
              <summary class="cursor-pointer text-text text-sm uppercase tracking-widest mb-3">
                {group.routine.name} · {groupDone(group.exercises)}/{group.exercises.reduce((sum, ex) => sum + ex.sets, 0)} sets
              </summary>
                <For each={group.exercises}>
                  {exercise => (
                    <div class="border border-border px-3 py-3 mb-3">
                      <div class="text-text text-sm uppercase tracking-widest">{exercise.name}</div>
                      <div class="text-faint text-xs mb-2">{formatPtPrescription(exercise)}</div>

                      <Show when={exercise.description}>
                        <p class="text-text-dim text-xs whitespace-pre-wrap mb-2">{exercise.description}</p>
                      </Show>
                      <Show when={exercise.videoUrl}>
                        {/* noopener/noreferrer: the link is a URL the user pasted, and
                            an opened tab with `window.opener` can navigate this one. */}
                        <a
                          href={exercise.videoUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-info text-xs tracking-widest underline inline-block mb-2"
                        >
                          ▶ WATCH
                        </a>
                      </Show>

                      <div class="flex flex-wrap gap-2 mb-2">
                        <Index each={Array.from({ length: exercise.sets }, (_, i) => i + 1)}>
                          {setNumber => {
                            const checked = () => isPtSetDone(exercise.id!, setNumber(), exercise.routineId)
                            return (
                              <button
                                role="checkbox"
                                aria-checked={checked()}
                                aria-label={`${exercise.name} set ${setNumber()}, ${formatPtTarget(exercise)}${
                                  formatPtResistance(exercise) ? `, ${formatPtResistance(exercise)}` : ''
                                }`}
                                onClick={() => togglePtSet(exercise.id!, setNumber(), exercise.routineId)}
                                class={`border px-3 py-2 text-xs tracking-widest ${
                                  checked()
                                    ? 'border-accent text-accent bg-surface-high'
                                    : 'border-border text-muted hover:border-accent hover:text-accent'
                                }`}
                              >
                                <span aria-hidden="true">{checked() ? '[x]' : '[ ]'} </span>
                                {setNumber()}
                              </button>
                            )
                          }}
                        </Index>
                      </div>

                      <SubLabel class="mb-1">NOTE</SubLabel>
                      <input
                        type="text"
                        value={getPtExerciseNote(exercise.id!, exercise.routineId)}
                        onInput={e => setPtExerciseNote(exercise.id!, e.currentTarget.value, exercise.routineId)}
                        placeholder="Swapped to the green band"
                        aria-label={`Note for ${exercise.name}`}
                        class="w-full bg-surface border border-border text-text px-2 py-1 text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                  )}
                </For>

                <div class="mb-6">
                  <SectionLabel class="mb-1">{groups().length > 1 ? 'ROUTINE NOTES' : 'SESSION NOTES'}</SectionLabel>
                  <textarea
                    value={getPtRun(group.routine.id!)?.notes ?? ''}
                    onInput={e => setPtNotes(e.currentTarget.value, group.routine.id!)}
                    rows={2}
                    placeholder="Shoulder felt better than Tuesday"
                    aria-label={groups().length === 1 ? 'Session notes' : `Notes for ${group.routine.name}`}
                    class="w-full bg-surface border border-border text-text px-2 py-1 text-sm focus:outline-none focus:border-accent"
                  />
                </div>
            </details>
          )}</For>
          </fieldset>

          <div class="flex gap-2">
            <button
              onClick={() => void handleDiscard()}
              disabled={finishing()}
              class="flex-1 border border-border text-muted hover:border-danger hover:text-danger px-4 py-3 text-xs tracking-widest uppercase"
            >
              DISCARD
            </button>
            <button
              onClick={() => void handleFinish()}
              disabled={finishing()}
              class="flex-1 border border-accent text-accent px-4 py-3 text-xs tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {groups().length > 1 ? 'FINISH SESSION' : 'FINISH'}
            </button>
          </div>
        </div>
      </Show>
    </Show>
  )
}
