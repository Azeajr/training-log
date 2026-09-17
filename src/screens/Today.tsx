import { createSignal, createResource, onMount, Show, For } from 'solid-js'
import { useNavigate, A } from '@solidjs/router'
import { db } from '../db/index'
import type { Lift, PtRoutine } from '../types/domain'
import { workout, startSession, resumeSession, clearSession, addAccessory, toActiveAccessory } from '../store/workout-store'
import { calcMainSets, calcWarmup, calcSupplementalSets, getSupplementalLabel, calcCrossSets, getCrossLabel, effectiveSupplementalWeek } from '../lib/calc'
import type { FslSet } from '../lib/calc'
import { getNextSessionAdvancingIfDone } from '../lib/cycle'
import {
  discardPendingSession, hydrateSessionState, reconcileActiveSession, startOrResumePendingSession,
} from '../lib/session'
import { getCurrentTm } from '../lib/training-max'
import { getAssistanceDefaults, getAssistanceDefaultPicks, ASSISTANCE_SECTIONS, SECTION_LABEL, type AssistanceSection } from '../lib/assistance'
import { settings } from '../store/settings-store'
import { useConfirmation } from '../hooks/use-confirmation'
import { useSingleFlight } from '../hooks/use-single-flight'
import { showToast } from '../store/toast-store'
import { createAsyncRead } from '../lib/async-read'
import { listPtRoutines } from '../lib/pt'
import { ptSessionRoutineIds } from '../store/pt-store'
import Rule from '../components/layout/Rule'
import SectionLabel from '../components/layout/SectionLabel'
import SetReadout from '../components/forms/SetReadout'
import AccessoryPicker from '../components/workout/AccessoryPicker'

const message = (err: unknown): string =>
  err instanceof Error ? err.message : 'something went wrong'

interface WeekStatus {
  liftId: number
  name: string
  status: 'pending' | 'completed' | 'skipped'
}

export default function Today() {
  const navigate = useNavigate()
  const { confirm } = useConfirmation()
  const [loading, setLoading] = createSignal(true)
  const [lifts, setLifts] = createSignal<Lift[]>([])
  const [weekStatuses, setWeekStatuses] = createSignal<WeekStatus[]>([])
  const [selectedLiftId, setSelectedLiftId] = createSignal<number | null>(null)
  const [currentWeek, setCurrentWeek] = createSignal<1 | 2 | 3 | 4>(1)
  const [currentCycleId, setCurrentCycleId] = createSignal<number>(1)
  const [tm, setTm] = createSignal(0)
  const [assistanceDefaults, setAssistanceDefaults] = createSignal<
    Partial<Record<AssistanceSection, { exerciseId: number; name: string }>>
  >({})
  const [pickerSlot, setPickerSlot] = createSignal<AssistanceSection | null>(null)
  // The warmup ladder and the full main-set list aren't pre-session decisions —
  // they're the next screen's content, and inline they pushed the assistance
  // pickers and START WORKOUT below the fold. Folded away by default.
  const [showFullSession, setShowFullSession] = createSignal(false)
  // The entry screen's own load, with an identity and a failure state. This was
  // `void load()` with no catch anywhere in the file — Today.tsx had ZERO catch
  // statements — so a rejected read left the screen on "Loading…" permanently:
  // no error, no retry, no way back short of navigating away. The same defect
  // F23 had on /stats, on the screen the app opens to (F102).
  const read = createAsyncRead()
  onMount(() => { void read.run(() => load()); void loadPt() })

  // PT is an aside on this screen, not what it exists for. Its read gets its
  // own state and its own catch so a failure here cannot take the 5/3/1 session
  // down with it — the shape F106 left on the cross-lift preview.
  const [ptRoutines, setPtRoutines] = createSignal<PtRoutine[]>([])
  const loadPt = async () => {
    try {
      setPtRoutines(await listPtRoutines(db))
    } catch {
      setPtRoutines([])
    }
  }

  // Everything about a lift that has to be fetched: its training max and its
  // assistance defaults. Both are async, and publishing whatever landed last
  // let a slow earlier selection overwrite a newer one — a zero-TM Deadlift
  // result arriving after Bench was chosen disabled Bench and showed Deadlift's
  // assistance under Bench's name (F17). Each call takes a generation and
  // publishes only while it is still the current one.
  let selectionGeneration = 0
  const [liftDetail, setLiftDetail] = createSignal<'loading' | 'ready'>('loading')

  const loadLiftDetail = async (liftId: number) => {
    const generation = ++selectionGeneration
    setLiftDetail('loading')
    // Cleared, not left standing: the previous lift's training max under the new
    // lift's name is a wrong number, which is worse than no number.
    setTm(0)
    setAssistanceDefaults({})
    const [weight, defaults] = await Promise.all([
      getCurrentTm(db, liftId),
      getAssistanceDefaults(db, liftId),
    ])
    if (generation !== selectionGeneration) return
    setTm(weight)
    setAssistanceDefaults(defaults)
    setLiftDetail('ready')
  }

  const load = async () => {
    setLoading(true)
    const next = await getNextSessionAdvancingIfDone(db)
    const allLifts = (await db.lifts.orderBy('order').toArray()).filter(l => !l.archived)
    setLifts(allLifts)
    setCurrentWeek(next.week)
    setCurrentCycleId(next.cycleId)
    setSelectedLiftId(next.liftId)

    const sessions = await db.sessions.where('cycleId').equals(next.cycleId).toArray()
    const statuses: WeekStatus[] = allLifts.map(l => {
      // A reopened week keeps the old completed rows and adds a fresh pending
      // one. The pending row is the work still owed, so it wins the display.
      const liftSessions = sessions.filter(se => se.liftId === l.id && se.week === next.week)
      const s = liftSessions.find(se => se.status === 'pending') ?? liftSessions[0]
      return { liftId: l.id!, name: l.name, status: s ? s.status : 'pending' }
    })
    setWeekStatuses(statuses)

    await loadLiftDetail(next.liftId)

    setLoading(false)
  }

  const handleSelectLift = async (liftId: number) => {
    setSelectedLiftId(liftId)
    await loadLiftDetail(liftId)
  }

  const launchSession = async () => {
    const selId = selectedLiftId()
    if (!selId) return
    // Validate the captured target inside the operation. START is enabled from
    // a training max read when the lift was selected, and another tab — or a
    // destructive import — can take it away in between. Starting anyway would
    // build the whole session off a TM of 0 (F17).
    if (await getCurrentTm(db, selId) <= 0) {
      showToast('No training max for that lift — set one in Settings first.')
      await loadLiftDetail(selId)
      return
    }

    const existing = await db.sessions
      .where('cycleId').equals(currentCycleId())
      .filter(s => s.liftId === selId && s.week === currentWeek())
      .toArray()

    // No pending row but the lift already has history this week: starting again
    // is a redo. The new pending row reopens the lift's week (weekComplete
    // counts any pending row as work owed), so confirm instead of silently
    // un-completing the day. Asked before the transaction below, which is where
    // the decision to create actually gets made — a concurrent start that lands
    // first simply turns this into a resume.
    if (existing.length > 0 && !existing.some(s => s.status === 'pending')) {
      const name = lifts().find(l => l.id === selId)?.name ?? 'This lift'
      const done = existing.some(s => s.status === 'completed')
      if (!await confirm(
        `${name} ${done ? 'is already completed' : 'was skipped'} this week. Redo it as a new session?`,
        { confirmLabel: 'REDO' }
      )) return
    }

    const { session, created } = await startOrResumePendingSession(db, {
      cycleId: currentCycleId(),
      liftId: selId,
      week: currentWeek(),
    })

    if (created) {
      startSession(session)
    } else {
      // Resuming a row the local store knows nothing about — a backup restore
      // reaches this every time. Rebuild its saved sets and cursor rather than
      // resetting to empty, which made a half-finished session look untouched
      // and duplicated the sets already in the database (F18).
      const state = await hydrateSessionState(db, session)
      resumeSession(session, state)
      if (state.restored) {
        showToast('Picked up the sets already saved for this session. Assistance work is only saved once a session is completed.')
      }
    }

    // Seed each fixed slot from this lift's persisted default — the pick from
    // last time (or from Today), until the user swaps it mid-session. A resumed
    // session gets them too: its assistance picks were never written down.
    //
    // Caught, and the navigation happens anyway. This runs AFTER startSession,
    // so a failure here used to leave a real pending row created and the store
    // pointing at it, with no navigation and no error — the user stranded on
    // Today under a "SESSION IN PROGRESS" banner for a session they never
    // entered, with that row holding the week open (F104). The session is real
    // and valid; only a convenience failed, so entering it is the honest
    // outcome and abandoning it would discard what the user just asked for.
    try {
      for (const pick of await getAssistanceDefaultPicks(db, selId)) {
        addAccessory(toActiveAccessory(pick, pick.section))
      }
    } catch (err) {
      showToast(`Could not load your assistance defaults: ${message(err)}`)
    }
    navigate('/workout')
  }

  // The RESUME banner's handler. Same reconciliation as START, because it is
  // the same act: a stored session is only resumable while its row is still the
  // live pending one. When it isn't, drop the dead ref and re-read the week —
  // the banner disappears with it, so say why.
  const handleResume = async () => {
    const active = workout.activeSession
    if (!active) return
    if (await reconcileActiveSession(db, active)) {
      navigate('/workout')
      return
    }
    clearSession()
    showToast('That session already finished.')
    await read.run(() => load())
  }

  const runStart = async () => {
    const selId = selectedLiftId()
    if (!selId) return
    const active = workout.activeSession
    // Resume only when the active session is truly this slot — same lift AND
    // same cycle/week — AND its DB row is still a live pending session. A stale
    // store (row completed under a killed post-complete modal, or deleted) must
    // not resume into a finished/gone session; drop the dead ref and start fresh.
    if (active && active.liftId === selId
      && active.cycleId === currentCycleId() && active.week === currentWeek()) {
      if (await reconcileActiveSession(db, active)) {
        navigate('/workout')
        return
      }
      clearSession()
    } else if (active) {
      const activeLiftName = lifts().find(l => l.id === active.liftId)?.name ?? ''
      if (!await confirm(`Abandon ${activeLiftName} session?`, { destructive: true, confirmLabel: 'YES' })) return
      // Status-guarded: if the row already completed (stale store after a
      // killed post-complete modal), keep its data and just drop the store ref.
      //
      // A failed discard keeps everything, which is right for the data — but it
      // used to say nothing, so the user believed the old session was gone when
      // it was still there, still holding the week open (F105). Returning
      // without clearing keeps the store naming what actually still exists.
      if (active.id) {
        try {
          await discardPendingSession(db, active.id)
        } catch (err) {
          showToast(`Could not abandon that session: ${message(err)}`)
          return
        }
      }
      clearSession()
    }
    // Awaited, not fired off: the single-flight guard below has to stay held
    // until the session row actually exists, which is the whole window the
    // second tap used to slip through.
    await launchSession()
  }

  // START is one operation from tap to navigation — abandon, redo confirmation,
  // select-or-create, accessory seeding and all. Two taps before the insert
  // settled both saw no pending session and both created one, and completing
  // the active one left the hidden second attempt holding the week open (F16).
  // The atomicity in startOrResumePendingSession covers a second tab; this
  // covers the second tap, and disables the button while it is held.
  const { busy: starting, guard } = useSingleFlight()
  // Wrapped: `useSingleFlight`'s guard is try/finally with no catch, so a
  // rejection anywhere in abandon → select-or-create → seed → navigate escaped
  // unhandled and the tap became a silent no-op — the user pressed START and
  // the app did nothing at all (F103).
  const handleStart = guard(async () => {
    try {
      await runStart()
    } catch (err) {
      showToast(`Could not start the session: ${message(err)}`)
    }
  })

  const selectedLift = () => lifts().find(l => l.id === selectedLiftId())
  const main = () => selectedLift() ? calcMainSets(tm(), currentWeek(), settings.barWeight) : []
  // The day's defining lift: the heaviest (last) main set — the AMRAP on weeks
  // 1-3, the top deload set on week 4. Promoted to the hero readout.
  const topMain = () => { const m = main(); return m.length > 0 ? m[m.length - 1] : null }
  const warmup = () => selectedLift() ? calcWarmup(tm(), main()[0]?.weight ?? tm(), settings.barWeight) : []

  // Supplemental preview runs at the effective week (deload may remap or skip).
  const effSuppWeek = () => effectiveSupplementalWeek(currentWeek(), settings.deloadSupplemental)
  const supplementalSets = (): FslSet[] => {
    const e = effSuppWeek()
    if (e === null) return []
    return calcSupplementalSets(settings.supplementalTemplate ?? 'fsl+bbb', calcMainSets(tm(), e, settings.barWeight), tm(), e, settings.barWeight)
  }

  const supplementalLabel = (): string | null => {
    const e = effSuppWeek()
    if (e === null) return null
    return getSupplementalLabel(settings.supplementalTemplate ?? 'fsl+bbb', supplementalSets(), e)
  }

  // Cross-lift supplemental preview for the selected lift. Mirrors the Workout
  // screen: each block computed from its movement lift's TM, skipped on deload.
  const [crossPreview] = createResource(
    () => ({ liftId: selectedLiftId(), week: currentWeek(), mode: settings.deloadSupplemental }),
    async ({ liftId, week, mode }) => {
      const eff = effectiveSupplementalWeek(week, mode)
      if (!liftId || eff === null) return []
      const blocks = (await db.liftSupplementals.where('liftId').equals(liftId).toArray())
        .sort((a, b) => a.order - b.order)
      const allLifts = await db.lifts.toArray()
      const out: Array<{ label: string; weight: number; reps: number }> = []
      for (const b of blocks) {
        const mLift = allLifts.find(l => l.id === b.movementLiftId)
        if (!mLift) continue
        const mTm = await getCurrentTm(db, b.movementLiftId)
        const sets = calcCrossSets(b, mTm, eff, settings.barWeight)
        if (sets.length > 0) out.push({ label: getCrossLabel(b, mLift.name), weight: sets[0].weight, reps: sets[0].reps })
      }
      return out
    },
  )

  // `?? []` guards a null, not a THROW. Reading a rejected createResource
  // throws, and that throw came back out of `setLoading(false)` — so one
  // optional preview failing left the entire screen stuck on "Loading…"
  // (F106). Checking `.error` first reads the failure without re-raising it.
  const crossPreviewSafe = (): Array<{ label: string; weight: number; reps: number }> =>
    crossPreview.error ? [] : (crossPreview() ?? [])

  // Status owns the colour, permanently — selecting a finished lift must not
  // hide that it's already done, that being the cue against an accidental redo.
  // Selection is a separate channel: a filled ground plus the ▸ the glyph atlas
  // already assigns to "current", so both facts read at once.
  const statusLabel = (ws: WeekStatus) => {
    if (ws.status === 'completed') return 'done'
    if (ws.status === 'skipped') return 'skip'
    return ''
  }

  const chipClass = (ws: WeekStatus) => {
    const selected = ws.liftId === selectedLiftId()
    const fill = selected ? 'bg-surface-high ' : ''
    if (ws.status === 'completed') return `${fill}border-accent text-accent`
    if (ws.status === 'skipped') return `${fill}border-danger text-danger`
    return fill + (selected
      ? 'border-text text-text'
      : 'border-border text-muted hover:border-text hover:text-text')
  }

  return (
    <Show
      when={!read.error()}
      fallback={
        <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
          <div role="alert" class="border border-danger px-3 py-2">
            <div class="text-danger text-xs uppercase tracking-widest mb-1">Could not load today</div>
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
      when={!loading()}
      fallback={<div class="p-4 md:p-8 font-mono text-muted text-sm tracking-widest uppercase">Loading…</div>}
    >
      <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
        {/* A button, not a link: this is the second entry into a live session,
            so it goes through the same reconciliation START does. As an <A> it
            walked past that check straight into live workout controls over a
            session the database had already finished (F13). */}
        <Show when={workout.activeSession}>
          <button
            onClick={() => void handleResume()}
            class="block w-full text-left border border-warn text-warn px-4 py-3 text-xs tracking-widest uppercase mb-6"
          >
            &#9654; SESSION IN PROGRESS — RESUME
          </button>
        </Show>

        <div class="md:grid md:grid-cols-2 md:gap-12 md:items-start">
          <div>
            <Rule
              label={`WEEK ${currentWeek()}${currentWeek() === 4 ? ' . DELOAD' : ''}`}
              class={`mb-4 ${currentWeek() === 4 ? 'text-info' : 'text-muted'}`}
            />
            <div class="flex gap-2 mb-6 flex-wrap">
              <For each={weekStatuses()}>
                {ws => (
                  <button
                    onClick={() => void handleSelectLift(ws.liftId)}
                    aria-pressed={ws.liftId === selectedLiftId()}
                    class={`border px-3 py-2 text-xs tracking-widest ${chipClass(ws)}`}
                  >
                    <Show when={ws.liftId === selectedLiftId()}>
                      <span aria-hidden="true">▸ </span>
                    </Show>
                    {ws.name} {statusLabel(ws)}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div>
            <Show when={selectedLift()}>
              <Rule label={`${selectedLift()!.name} . TODAY`} class="text-muted mb-4" />
              {/* Both branches wait for the selection to resolve. Neither "no
                  training max" nor a set of numbers is true while the answer is
                  still in flight, and the warning is the one that misleads —
                  it names the lift it is wrong about. */}
              <Show when={liftDetail() === 'loading'}>
                <p class="text-muted text-xs uppercase tracking-widest mb-4">Loading…</p>
              </Show>
              <Show when={liftDetail() === 'ready' && tm() === 0}>
                <p class="text-warn text-xs uppercase tracking-widest mb-4">
                  No training max set for {selectedLift()!.name} —{' '}
                  <A href="/settings" class="underline">add one in Settings</A> before starting.
                </p>
              </Show>
              <Show when={liftDetail() === 'ready' && tm() > 0}>
                <Show when={topMain()}>
                  {top => (
                    <div class="mb-6">
                      <SectionLabel class="mb-1">TOP SET</SectionLabel>
                      <SetReadout
                        size="lg"
                        weight={top().weight}
                        value={`${top().reps}${top().isAmrap ? '+' : ''}`}
                        badges={
                          <Show when={top().isAmrap}>
                            <span class="text-warn text-xs tracking-widest self-center">AMRAP</span>
                          </Show>
                        }
                      />
                    </div>
                  )}
                </Show>

                <div class="space-y-4 font-mono text-sm">
                  <button
                    onClick={() => setShowFullSession(v => !v)}
                    aria-expanded={showFullSession()}
                    class="text-faint text-xs tracking-widest hover:text-accent"
                  >
                    full session {showFullSession() ? '▾' : '▸'}
                  </button>
                  <Show when={showFullSession()}>
                    <div>
                      <SectionLabel class="mb-1">WARM UP</SectionLabel>
                      <For each={warmup()}>{s => (
                        <SetReadout size="sm" alignWeight tone="text-text-dim" class="pl-2" weight={s.weight} value={`${s.reps}`} />
                      )}</For>
                    </div>
                    <div>
                      <SectionLabel class="mb-1">MAIN</SectionLabel>
                      <For each={main()}>{s => (
                        <SetReadout
                          size="sm"
                          alignWeight
                          tone="text-text"
                          class="pl-2"
                          weight={s.weight}
                          value={`${s.reps}${s.isAmrap ? '+' : ''}`}
                          badges={
                            <Show when={s.isAmrap}>
                              <span class="text-warn text-xs tracking-widest">AMRAP</span>
                            </Show>
                          }
                        />
                      )}</For>
                    </div>
                  </Show>
                  <Show when={supplementalLabel() !== null && supplementalSets().length > 0}>
                    <div>
                      <SectionLabel class="mb-1">{supplementalLabel()}</SectionLabel>
                      <SetReadout size="sm" alignWeight tone="text-text-dim" class="pl-2" weight={supplementalSets()[0].weight} value={`${supplementalSets()[0].reps}`} />
                    </div>
                  </Show>
                  <For each={crossPreviewSafe()}>
                    {block => (
                      <div>
                        <SectionLabel class="mb-1">{block.label}</SectionLabel>
                        <SetReadout size="sm" alignWeight tone="text-text-dim" class="pl-2" weight={block.weight} value={`${block.reps}`} />
                      </div>
                    )}
                  </For>
                </div>

                <div class="mt-6">
                  <SectionLabel class="mb-1">ASSISTANCE</SectionLabel>
                  <For each={ASSISTANCE_SECTIONS}>
                    {section => {
                      const def = () => assistanceDefaults()[section]
                      return (
                        <div class="mb-2">
                          <button
                            onClick={() => setPickerSlot(section)}
                            class="w-full text-left border border-border px-3 py-2 text-xs tracking-widest text-muted hover:border-accent hover:text-accent flex justify-between"
                          >
                            <span class="text-faint">{SECTION_LABEL[section]}</span>
                            {/* uppercase to match the logged accessory header */}
                            <span class="uppercase">{def() ? def()!.name : `+ CHOOSE`}</span>
                          </button>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </Show>
              <button
                onClick={() => void handleStart()}
                disabled={liftDetail() === 'loading' || tm() === 0 || starting()}
                class="mt-6 border border-accent text-accent px-6 py-4 font-mono w-full tracking-widest text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                START WORKOUT
              </button>
            </Show>
          </div>
        </div>

        <div class="mt-10">
          <Rule label="PT" class="text-muted mb-4" />
          <Show when={ptSessionRoutineIds().length > 0}>
            <button
              onClick={() => navigate('/pt/run')}
              class="block w-full text-left border border-warn text-warn px-4 py-3 text-xs tracking-widest uppercase mb-3"
            >
              RESUME PT SESSION · {ptSessionRoutineIds().length} routine{ptSessionRoutineIds().length === 1 ? '' : 's'}
            </button>
          </Show>
          <Show
            when={ptRoutines().length > 0}
            fallback={
              <A href="/pt" class="block border border-border text-muted hover:border-accent hover:text-accent px-4 py-3 text-xs tracking-widest uppercase text-center">
                + SET UP A PT ROUTINE
              </A>
            }
          >
            <div class="space-y-2">
              <For each={ptRoutines()}>
                {routine => (
                  <button
                    onClick={() => navigate(`/pt/${routine.id}/run`)}
                    class="w-full flex items-center justify-between gap-2 border border-border text-muted hover:border-accent hover:text-accent px-3 py-2 text-xs tracking-widest uppercase"
                  >
                    <span class="truncate">{routine.name}</span>
                    <span class="shrink-0">START ▸</span>
                  </button>
                )}
              </For>
              <A href="/pt" class="block text-faint text-xs tracking-widest hover:text-accent pt-1">
                all PT routines + history ▸
              </A>
            </div>
          </Show>
        </div>

        <Show when={pickerSlot() !== null && selectedLiftId()}>
          <AccessoryPicker
            slot={pickerSlot()!}
            liftId={selectedLiftId()!}
            mode="default"
            onSelected={(exerciseId, name) =>
              setAssistanceDefaults(prev => ({ ...prev, [pickerSlot()!]: { exerciseId, name } }))
            }
            onClose={() => setPickerSlot(null)}
          />
        </Show>
      </div>
    </Show>
    </Show>
  )
}
