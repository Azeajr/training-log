import { batch, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { useNavigate, useParams } from '@solidjs/router'
import { db } from '../db/index'
import type { PtExercise } from '../types/domain'
import {
  commitPtSession,
  formatPtPrescription,
  getPtRoutine,
  resolvePtCheck,
  type PtRoutineDetail,
} from '../lib/pt'
import {
  clearPtRun,
  getPtExerciseNote,
  getPtRun,
  ptSessionRoutineIds,
  addPtSet,
  ensurePtSets,
  removePtSet,
  setPtSetFields,
  ptSetsFor,
  ptExerciseNotesForCommit,
  ptPersistenceError,
  setPtExerciseNote,
  setPtNotes,
  startPtRun,
} from '../store/pt-store'
import { createAsyncRead } from '../lib/async-read'
import { useConfirmation } from '../hooks/use-confirmation'
import { useSingleFlight } from '../hooks/use-single-flight'
import { showToast } from '../store/toast-store'
import Rule from '../components/layout/Rule'
import BottomBar from '../components/layout/BottomBar'
import AsyncErrorBox from '../components/ui/AsyncErrorBox'
import FoldGlyph from '../components/ui/FoldGlyph'
import SectionLabel from '../components/layout/SectionLabel'
import SubLabel from '../components/layout/SubLabel'
import NotesField from '../components/forms/NotesField'
import PtSetList from '../components/pt/PtSetList'

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'something went wrong'

const NOTE_CLASS = 'w-full bg-surface border border-border text-text font-mono px-2 py-2 text-xs focus:outline-none focus:border-accent resize-none'

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
  // The store owns how many sets a run has, not the prescription — a run can
  // add sets to an exercise or drop one, and every count here follows that.
  const setsOf = (ex: PtExercise) => ptSetsFor(ex.id!, ex.routineId)
  const doneIn = (items: PtExercise[]) => items.reduce((sum, ex) => sum + setsOf(ex).filter(s => s.done).length, 0)
  const setsIn = (items: PtExercise[]) => items.reduce((sum, ex) => sum + setsOf(ex).length, 0)

  const read = createAsyncRead()

  const load = async (isCurrent: () => boolean) => {
    const id = routineId()
    if (params.routineId !== undefined && id === null) {
      if (isCurrent()) navigate('/pt', { replace: true })
      return
    }
    const ids = [...new Set([...ptSessionRoutineIds(), ...(id === null ? [] : [id])])]
    const loaded = await Promise.all(
      ids.map(async routineId => ({ routineId, detail: await getPtRoutine(db, routineId) })),
    )
    if (!isCurrent()) return

    // A parked draft whose routine cannot be loaded is dropped, not treated as
    // a reason to refuse the whole session. Every id here is either the one the
    // user just asked for or one carried in from `pt-store`, and the store
    // outlives the database: an IMPORT clears every table and leaves the
    // localStorage draft pointing at routine ids that no longer exist. Failing
    // the load on any bad id meant one stale draft bounced the user back to /pt
    // from every routine they tried to start, forever, with no way to clear the
    // draft because the routine it names is not on the list to delete.
    const usable = loaded.filter(r => r.detail && r.detail.exercises.length > 0)
    for (const { routineId } of loaded.filter(r => !usable.includes(r))) clearPtRun(routineId)

    if (usable.length === 0) {
      showToast(loaded.some(r => !r.detail) ? 'That routine no longer exists.' : 'That routine has no exercises yet.')
      navigate('/pt', { replace: true })
      return
    }
    if (loaded.length > usable.length) {
      showToast(`Dropped ${loaded.length - usable.length} routine that no longer exists.`)
    }
    const details = usable.map(r => r.detail)
    // Only start the requested run once it is known to be one of the usable
    // ones — starting it first would park the live draft under a routine that
    // is about to be cleared.
    if (id !== null && usable.some(r => r.routineId === id)) startPtRun(id)
    const sorted = (details as PtRoutineDetail[]).sort((a, b) => a.routine.order - b.routine.order)
    // Seed each exercise's set list to its prescribed length. Only the screen
    // knows the prescription, so the store cannot do this for itself — and it
    // only ever grows, leaving a resumed run's own sets alone.
    batch(() => sorted.forEach(group =>
      group.exercises.forEach(ex => ensurePtSets(ex.id!, ex.sets, ex.routineId))))
    setGroups(sorted)
  }

  void read.run(load)

  const total = createMemo(() => setsIn(exercises()))
  const doneCount = createMemo(() => doneIn(exercises()))

  // A set editor open with unapplied changes, anywhere in the session —
  // including inside a folded routine, which is why this is tracked here rather
  // than asked of the DOM. The draft lives in `PtSetList` and in memory only, so
  // finishing, leaving and reloading all have to reckon with it.
  const [pending, setPending] = createSignal<Record<number, boolean>>({})
  const hasPending = () => Object.values(pending()).some(Boolean)

  const warnOnUnload = (e: BeforeUnloadEvent) => { if (hasPending()) e.preventDefault() }
  window.addEventListener('beforeunload', warnOnUnload)
  onCleanup(() => window.removeEventListener('beforeunload', warnOnUnload))

  const { busy: finishing, guard } = useSingleFlight()

  const handleFinish = guard(async () => {
    if (!groups().length) return

    if (hasPending()) {
      showToast('One set has unapplied changes.')
      return
    }

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
        setsOf(ex).map((set, i) => ({
          ptExerciseId: ex.id!,
          setNumber: i + 1,
          done: set.done,
          // Pinned now, against the prescription as it stands today. A later
          // edit to the routine must not rewrite what this run says happened.
          ...resolvePtCheck(ex, set),
          // And what those values mean, pinned with them: without it a reader
          // has only the current routine to decide which of them apply.
          measure: ex.measure,
          resistanceKind: ex.resistanceKind,
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
      //
      // BOTH counts are read before the clear. `doneCount` and `total` are
      // memos over the store's set lists, so a denominator interpolated after
      // it reads 0 and the run reports "1/0 done". `routineName` reads
      // `groups()`, which the clear does not touch.
      const completed = doneCount()
      const prescribed = total()
      groups().forEach(group => clearPtRun(group.routine.id!))
      showToast(`${routineName()} logged — ${completed}/${prescribed} done.`)
      navigate('/pt')
    } catch (err) {
      showToast(`Could not save that run: ${message(err)}`)
    }
  })

  /**
   * Leaving the run screen unmounts every set editor with it. Ticks are in the
   * store and survive; an unapplied set edit is not and does not, so it is the
   * one thing worth stopping for.
   */
  const handleBack = async () => {
    if (hasPending() && !await confirm(
      'One set has unapplied changes. Leave anyway?',
      // Named rather than left as the default CANCEL: the set editor this is
      // warning about has a CANCEL of its own on screen at the same time.
      { destructive: true, confirmLabel: 'LEAVE', cancelLabel: 'STAY' },
    )) return
    navigate('/pt')
  }

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
          <AsyncErrorBox
            title="Could not load routine"
            error={read.error()!}
            onRetry={() => void read.retry()}
          />
        </div>
      }
    >
      <Show
        when={exercises().length > 0}
        fallback={<div class="p-4 md:p-8 font-mono text-muted text-sm tracking-widest uppercase">Loading…</div>}
      >
        {/* pb-32, not the `p-4` shorthand's padding: the action bar is fixed
            above the nav, and without this the last exercise note sat under it
            on a phone. */}
        <div class="p-4 md:px-8 md:pt-8 pb-32 font-mono max-w-5xl mx-auto">
          <Rule label={routineName()} labelSuffix={`. ${doneCount()}/${total()}`} class="text-muted mb-4" />

          <button
            onClick={() => void handleBack()}
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
          <For each={groups()}>{group => {
            const [open, setOpen] = createSignal(true)
            const panelId = `pt-group-${group.routine.id}`
            const groupTotal = () => setsIn(group.exercises)
            // A single routine is already named and counted by the page Rule, so
            // grouping it under a second identical header says everything twice.
            // The fold earns its place only once there is more than one routine
            // to fold past.
            const grouped = () => groups().length > 1
            return (
            <div class={grouped() ? 'mb-4 border border-border p-3' : undefined}>
              <Show when={grouped()}>
                <button
                  onClick={() => setOpen(v => !v)}
                  aria-expanded={open()}
                  aria-controls={panelId}
                  class="w-full flex items-baseline gap-2 mb-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span class="text-text text-sm uppercase tracking-widest">
                    {group.routine.name} . {doneIn(group.exercises)}/{groupTotal()} sets
                  </span>
                  <FoldGlyph expanded={open()} class="text-faint text-xs ml-auto" />
                </button>
              </Show>
              <div id={panelId} hidden={grouped() && !open()}>
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

                      <PtSetList
                        exercise={exercise}
                        sets={setsOf(exercise)}
                        onPatch={(setNumber, fields) => setPtSetFields(exercise.id!, setNumber, fields, exercise.routineId)}
                        onAdd={() => addPtSet(exercise.id!, exercise.routineId)}
                        onRemove={setNumber => removePtSet(exercise.id!, setNumber, exercise.routineId)}
                        onPendingChange={p => setPending(current => ({ ...current, [exercise.id!]: p }))}
                      />

                      <SubLabel class="mb-1">NOTE</SubLabel>
                      <NotesField
                        value={getPtExerciseNote(exercise.id!, exercise.routineId)}
                        onInput={v => setPtExerciseNote(exercise.id!, v, exercise.routineId)}
                        rows={2}
                        placeholder="Swapped to the green band"
                        ariaLabel={`Note for ${exercise.name}`}
                        textareaClass={NOTE_CLASS}
                      />
                    </div>
                  )}
                </For>

                <div class="mb-6">
                  <SectionLabel class="mb-1">{groups().length > 1 ? 'ROUTINE NOTES' : 'SESSION NOTES'}</SectionLabel>
                  <NotesField
                    value={getPtRun(group.routine.id!)?.notes ?? ''}
                    onInput={v => setPtNotes(v, group.routine.id!)}
                    rows={2}
                    placeholder="Shoulder felt better than Tuesday"
                    ariaLabel={groups().length === 1 ? 'Session notes' : `Notes for ${group.routine.name}`}
                    textareaClass={NOTE_CLASS}
                  />
                </div>
              </div>
            </div>
            )
          }}</For>
          </fieldset>

        </div>

        {/* Fixed, because a multi-routine PT session is the longest scroll in
            the app and this was the only logging screen where finishing meant
            scrolling back to find the button. The count is session-wide, the
            same aggregate the page heading shows. DISCARD stays secondary and
            keeps its own confirmation. */}
        <BottomBar>
          <div class="flex items-center gap-3 py-2">
            <span class="text-muted text-xs tracking-widest whitespace-nowrap shrink-0">
              {doneCount()}/{total()} DONE
            </span>
            <div class="flex gap-2 flex-1 justify-end">
              <button
                onClick={() => void handleDiscard()}
                disabled={finishing()}
                class="border border-border text-muted hover:border-danger hover:text-danger px-3 py-2 text-xs tracking-widest uppercase disabled:opacity-40"
              >
                DISCARD
              </button>
              <button
                onClick={() => void handleFinish()}
                disabled={finishing()}
                class="border border-accent text-accent px-3 py-2 text-xs tracking-widest uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {groups().length > 1 ? 'FINISH SESSION' : 'FINISH'}
              </button>
            </div>
          </div>
        </BottomBar>
      </Show>
    </Show>
  )
}
