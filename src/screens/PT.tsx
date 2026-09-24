import { createSignal, For, onCleanup, Show } from 'solid-js'
import { A, useBeforeLeave, useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import type { PtRoutine } from '../types/domain'
import {
  deletePtRoutine,
  deletePtSession,
  formatPtCheck,
  formatPtPrescription,
  getPtSessionDetail,
  listArchivedPtRoutines,
  listPtRoutines,
  listPtSessions,
  unarchivePtRoutine,
  type PtSessionDetail,
  type PtSessionSummary,
} from '../lib/pt'
import { clearPtRun, getPtRun, ptSessionRoutineIds, startPtSession } from '../store/pt-store'
import { createAsyncRead } from '../lib/async-read'
import { useConfirmation } from '../hooks/use-confirmation'
import { showToast } from '../store/toast-store'
import { formatDateShort, formatTimeShort } from '../lib/format'
import Rule from '../components/layout/Rule'
import AsyncErrorBox from '../components/ui/AsyncErrorBox'
import FoldGlyph from '../components/ui/FoldGlyph'
import PtSessionEditor, {
  ptRunDraftDirty,
  seedPtRunDraft,
  type PtRunDraft,
} from '../components/pt/PtSessionEditor'
import SectionLabel from '../components/layout/SectionLabel'
import InlineConfirm from '../components/ui/InlineConfirm'

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'something went wrong'

const HISTORY_LIMIT = 30

// A routine can be run several times in a day, and by date alone those runs
// were indistinguishable — in the list, and in the dialog asking which to delete.
const runWhen = (date: Date): string => `${formatDateShort(date)}, ${formatTimeShort(date)}`

// One loading voice per screen. The app has several shapes of "Loading…" by
// context (full-screen fallback vs embedded), and a screen that uses two of
// them reads as two different screens.
const LOADING_CLASS = 'text-muted text-xs uppercase tracking-widest'

export default function PT() {
  const navigate = useNavigate()
  const { confirm } = useConfirmation()
  const [routines, setRoutines] = createSignal<PtRoutine[]>([])
  const [selected, setSelected] = createSignal<number[]>([])
  const [archived, setArchived] = createSignal<PtRoutine[]>([])
  const [counts, setCounts] = createSignal<Record<number, number>>({})
  const [history, setHistory] = createSignal<PtSessionSummary[]>([])
  const [openSession, setOpenSession] = createSignal<number | null>(null)
  const [detail, setDetail] = createSignal<PtSessionDetail | null>(null)
  const [editing, setEditing] = createSignal(false)

  /**
   * Unsaved edits, by session id, held above the row that renders them.
   *
   * The editor lives inside a collapsible row, so folding the row — or opening
   * another one — unmounted it and took the edit with it silently. Keeping the
   * draft here outlives both, and a draft is dropped only by a successful save
   * or an explicit CANCEL.
   */
  const [runDrafts, setRunDrafts] = createSignal<Record<number, PtRunDraft>>({})
  const draftFor = (sessionId: number): PtRunDraft | undefined => runDrafts()[sessionId]
  const isDirty = (sessionId: number) => ptRunDraftDirty(draftFor(sessionId))
  const anyDirty = () => Object.keys(runDrafts()).some(id => isDirty(Number(id)))

  const putDraft = (sessionId: number, next: PtRunDraft) =>
    setRunDrafts(current => ({ ...current, [sessionId]: next }))
  const dropDraft = (sessionId: number) =>
    setRunDrafts(current => {
      const next = { ...current }
      delete next[sessionId]
      return next
    })

  /** An edit survives a fold, but not a reload: it is in memory only. */
  const warnOnUnload = (e: BeforeUnloadEvent) => { if (anyDirty()) e.preventDefault() }
  window.addEventListener('beforeunload', warnOnUnload)
  onCleanup(() => window.removeEventListener('beforeunload', warnOnUnload))

  useBeforeLeave(e => {
    if (e.defaultPrevented || !anyDirty()) return
    e.preventDefault()
    void confirm(
      'A recorded run has unsaved changes. Leave anyway?',
      { destructive: true, confirmLabel: 'LEAVE', cancelLabel: 'STAY' },
    ).then(ok => { if (ok) e.retry(true) })
  })

  const read = createAsyncRead()

  const load = async (isCurrent: () => boolean) => {
    const [rows, archivedRows, sessions, exercises] = await Promise.all([
      listPtRoutines(db),
      listArchivedPtRoutines(db),
      listPtSessions(db, HISTORY_LIMIT),
      db.ptExercises.toArray(),
    ])
    if (!isCurrent()) return
    const byRoutine: Record<number, number> = {}
    for (const ex of exercises) {
      if (ex.archived) continue
      byRoutine[ex.routineId] = (byRoutine[ex.routineId] ?? 0) + 1
    }
    setRoutines(rows)
    setArchived(archivedRows)
    setCounts(byRoutine)
    setHistory(sessions)
  }

  void read.run(load)

  const handleDeleteRoutine = async (routine: PtRoutine) => {
    try {
      await deletePtRoutine(db, routine.id!)
      // The in-progress run belongs to a routine that no longer exists — its
      // exercise ids would resolve to nothing on the run screen. Dropped here
      // rather than left to fail later.
      clearPtRun(routine.id!)
      showToast(`Deleted ${routine.name}.`)
      await read.run(load)
    } catch (err) {
      showToast(`Could not delete that routine: ${message(err)}`)
    }
  }

  const handleRestore = async (routine: PtRoutine) => {
    try {
      await unarchivePtRoutine(db, routine.id!)
      showToast(`${routine.name} restored.`)
      await read.run(load)
    } catch (err) {
      showToast(`Could not restore that routine: ${message(err)}`)
    }
  }

  const handleDeleteSession = async (summary: PtSessionSummary) => {
    if (!await confirm(
      `Delete the ${runWhen(summary.session.date)} ${summary.routineName} run?`,
      { destructive: true, confirmLabel: 'DELETE' },
    )) return
    try {
      await deletePtSession(db, summary.session.id!)
      if (openSession() === summary.session.id) setOpenSession(null)
      await read.run(load)
    } catch (err) {
      showToast(`Could not delete that run: ${message(err)}`)
    }
  }

  /** Re-read one run's detail, and the history list its counts come from. */
  const reopenSession = async (sessionId: number) => {
    setDetail(null)
    try {
      const loaded = await getPtSessionDetail(db, sessionId)
      // Guarded: a second tap while this one is in flight must not publish the
      // first run's exercises under the second run's heading.
      if (openSession() === sessionId) setDetail(loaded)
      await read.run(load)
    } catch (err) {
      showToast(`Could not load that run: ${message(err)}`)
    }
  }

  const toggleDetail = async (sessionId: number) => {
    if (openSession() === sessionId) {
      setOpenSession(null)
      setEditing(false)
      return
    }
    setOpenSession(sessionId)
    // A run with an edit in progress reopens into it. The fold is a place to
    // look at something else from, not a decision about the edit.
    setEditing(draftFor(sessionId) != null)
    setDetail(null)
    try {
      const loaded = await getPtSessionDetail(db, sessionId)
      if (openSession() === sessionId) setDetail(loaded)
    } catch (err) {
      showToast(`Could not load that run: ${message(err)}`)
    }
  }

  return (
    <Show
      when={!read.error()}
      fallback={
        <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
          <AsyncErrorBox
            title="Could not load PT"
            error={read.error()!}
            onRetry={() => void read.retry()}
          />
        </div>
      }
    >
      <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
        <Show when={ptSessionRoutineIds().length > 0}>
          <button
            onClick={() => navigate('/pt/run')}
            class="block w-full text-left border border-warn text-warn px-4 py-3 text-xs tracking-widest uppercase mb-6"
          >
            RESUME PT SESSION . {ptSessionRoutineIds().length} routine{ptSessionRoutineIds().length === 1 ? '' : 's'}
          </button>
        </Show>

        <Rule label="PT ROUTINES" class="text-muted mb-4" />

        <Show
          when={!read.loading() || routines().length > 0}
          fallback={<p class={`${LOADING_CLASS} mb-6`}>Loading…</p>}
        >
          <Show
            when={routines().length > 0}
            fallback={
              <p class="text-text-dim text-sm mb-6">
                No routines yet. Build one from the exercises your physio gave you, then tick
                them off as you go.
              </p>
            }
          >
            <div class="mb-6 space-y-2">
              <For each={routines()}>
                {routine => (
                  <div class="border border-border px-3 py-2">
                    <div class="flex items-center justify-between gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Include ${routine.name}`}
                        checked={!!getPtRun(routine.id!) || selected().includes(routine.id!)}
                        disabled={!!getPtRun(routine.id!) || (counts()[routine.id!] ?? 0) === 0}
                        onChange={e => setSelected(ids => e.currentTarget.checked
                          ? [...ids, routine.id!]
                          : ids.filter(id => id !== routine.id))}
                        class="h-5 w-5 shrink-0 accent-accent"
                      />
                      <div class="min-w-0">
                        <div class="text-text text-sm uppercase tracking-widest truncate">{routine.name}</div>
                        <div class="text-faint text-xs tracking-widest">
                          {counts()[routine.id!] ?? 0} exercise{(counts()[routine.id!] ?? 0) === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => navigate(`/pt/${routine.id}/run`)}
                          disabled={(counts()[routine.id!] ?? 0) === 0}
                          class="border border-accent text-accent px-3 py-1 text-xs tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {getPtRun(routine.id!) ? 'RESUME' : 'START'}
                        </button>
                        <A
                          href={`/pt/${routine.id}/edit`}
                          class="border border-border text-muted hover:border-accent hover:text-accent px-3 py-1 text-xs tracking-widest"
                        >
                          EDIT
                        </A>
                        <InlineConfirm
                          label="✕"
                          ariaLabel={`Delete ${routine.name}`}
                          confirmText="delete routine + its history?"
                          onConfirm={() => void handleDeleteRoutine(routine)}
                        />
                      </div>
                    </div>
                    <Show when={routine.notes}>
                      <p class="text-text-dim text-xs mt-1 whitespace-pre-wrap">{routine.notes}</p>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>

        <Show when={routines().length > 0}>
          <p class="text-text-dim text-xs mb-2">Select routines to do together in one session.</p>
          <button
            disabled={selected().length === 0}
            onClick={() => {
              startPtSession(selected().filter(id => routines().some(r => r.id === id) && (counts()[id] ?? 0) > 0))
              navigate('/pt/run')
            }}
            class="w-full border border-accent text-accent px-4 py-3 text-xs tracking-widest mb-4 disabled:opacity-40"
          >
            {ptSessionRoutineIds().length ? 'ADD TO SESSION' : 'START SESSION'} ({selected().length})
          </button>
        </Show>

        <A
          href="/pt/new"
          class="block text-center border border-border text-muted hover:border-accent hover:text-accent px-4 py-3 text-xs tracking-widest uppercase mb-8"
        >
          + NEW ROUTINE
        </A>

        {/* Archived routines keep their runs, so they stay listed here rather
            than disappearing: a rehab block that comes back is a restore, not a
            rebuild. */}
        <Show when={archived().length > 0}>
          <div class="mb-8">
            <SectionLabel tone="text-faint" class="mb-2">ARCHIVED</SectionLabel>
            <div class="space-y-2">
              <For each={archived()}>
                {routine => (
                  <div class="border border-border/50 px-3 py-2 flex items-center justify-between gap-2">
                    <span class="text-muted text-sm uppercase tracking-widest truncate">{routine.name}</span>
                    <div class="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void handleRestore(routine)}
                        class="border border-border text-muted hover:border-accent hover:text-accent px-3 py-1 text-xs tracking-widest"
                      >
                        RESTORE
                      </button>
                      <InlineConfirm
                        label="✕"
                        ariaLabel={`Delete ${routine.name}`}
                        confirmText="delete routine + its history?"
                        onConfirm={() => void handleDeleteRoutine(routine)}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <Rule label="PT HISTORY" class="text-muted mb-4" />
        <Show
          when={history().length > 0}
          fallback={<p class="text-text-dim text-sm">No PT runs recorded yet.</p>}
        >
          <div class="space-y-1">
            <For each={history()}>
              {summary => (
                <div class="border-b border-border/50 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <button
                      onClick={() => void toggleDetail(summary.session.id!)}
                      aria-expanded={openSession() === summary.session.id}
                      aria-controls={`pt-session-${summary.session.id}`}
                      class="flex-1 min-w-0 text-left flex items-center justify-between gap-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <FoldGlyph expanded={openSession() === summary.session.id} class="text-faint text-xs shrink-0" />
                      <span class="text-faint text-xs tracking-widest w-20 shrink-0">
                        <span class="block">{formatDateShort(summary.session.date)}</span>
                        <span class="block">{formatTimeShort(summary.session.date)}</span>
                      </span>
                      <span class="text-text uppercase tracking-widest truncate flex-1">
                        {summary.routineName}
                      </span>
                      <Show when={isDirty(summary.session.id!)}>
                        <span class="text-warn text-xs tracking-widest shrink-0">UNSAVED CHANGES</span>
                      </Show>
                      <span class={summary.done === summary.total ? 'text-accent text-xs tracking-widest' : 'text-warn text-xs tracking-widest'}>
                        {summary.done}/{summary.total}
                      </span>
                    </button>
                    <InlineConfirm
                      label="✕"
                      ariaLabel={`Delete ${summary.routineName} run from ${runWhen(summary.session.date)}`}
                      confirmText="delete run?"
                      onConfirm={() => void handleDeleteSession(summary)}
                    />
                  </div>

                  <Show when={openSession() === summary.session.id}>
                    <div id={`pt-session-${summary.session.id}`} class="pl-16 pt-2 pb-1">
                      <Show when={detail()} fallback={<p class={LOADING_CLASS}>Loading…</p>}>
                        <Show when={!editing()} fallback={
                          <PtSessionEditor
                            detail={detail()!}
                            draft={draftFor(summary.session.id!) ?? seedPtRunDraft(detail()!)}
                            onDraftChange={next => putDraft(summary.session.id!, next)}
                            onSaved={() => {
                              setEditing(false)
                              dropDraft(summary.session.id!)
                              void reopenSession(summary.session.id!)
                            }}
                            onCancel={() => { setEditing(false); dropDraft(summary.session.id!) }}
                          />
                        }>
                        <button
                          onClick={() => {
                            putDraft(summary.session.id!, draftFor(summary.session.id!) ?? seedPtRunDraft(detail()!))
                            setEditing(true)
                          }}
                          class="border border-border text-muted px-3 py-1 mb-2 text-xs tracking-widest uppercase"
                        >
                          EDIT RUN
                        </button>
                        <For each={detail()!.exercises}>
                          {row => (
                            <div class="mb-2">
                              <div class="flex justify-between gap-3 text-xs">
                                <span class="text-text-dim uppercase tracking-widest truncate">
                                  {row.exercise.name}
                                </span>
                                <span class="text-faint shrink-0">
                                  {row.checks.filter(c => c.done).length}/{row.checks.length}
                                </span>
                              </div>
                              <div class="text-faint text-xs">{formatPtPrescription(row.exercise)}</div>
                              {/* What was actually done, set by set — the
                                  prescription above is the plan, and the two
                                  differ whenever equipment or effort changed
                                  mid-run. */}
                              <For each={row.checks}>
                                {(check, setIndex) => (
                                  <div class="flex gap-2 text-xs">
                                    <span class={check.done ? 'text-accent' : 'text-faint'}>
                                      {check.done ? '[x]' : '[ ]'} {setIndex() + 1}
                                    </span>
                                    <span class={check.done ? 'text-text-dim' : 'text-faint'}>
                                      {formatPtCheck(check, row.exercise)}
                                    </span>
                                  </div>
                                )}
                              </For>
                              <Show when={row.note}>
                                <div class="text-text-dim text-xs whitespace-pre-wrap">{row.note}</div>
                              </Show>
                            </div>
                          )}
                        </For>
                        <Show when={detail()!.session.notes}>
                          <div class="mt-2">
                            <SectionLabel tone="text-faint" class="mb-1">NOTES</SectionLabel>
                            <p class="text-text-dim text-xs whitespace-pre-wrap">{detail()!.session.notes}</p>
                          </div>
                        </Show>
                        </Show>
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  )
}
