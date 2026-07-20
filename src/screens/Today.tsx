import { createSignal, createResource, onMount, Show, For } from 'solid-js'
import { useNavigate, A } from '@solidjs/router'
import { db } from '../db/index'
import type { Lift, Session } from '../types/domain'
import { workout, startSession, clearSession, addAccessory, toActiveAccessory } from '../store/workout-store'
import { calcMainSets, calcWarmup, calcSupplementalSets, getSupplementalLabel, calcCrossSets, getCrossLabel, effectiveSupplementalWeek } from '../lib/calc'
import type { FslSet } from '../lib/calc'
import { getNextSessionAdvancingIfDone } from '../lib/cycle'
import { discardPendingSession, reconcileActiveSession } from '../lib/session'
import { getCurrentTm } from '../lib/training-max'
import { getAssistanceDefaults, getAssistanceDefaultPicks, ASSISTANCE_SECTIONS, SECTION_LABEL, type AssistanceSection } from '../lib/assistance'
import { settings } from '../store/settings-store'
import { useConfirmation } from '../hooks/use-confirmation'
import Rule from '../components/layout/Rule'
import SectionLabel from '../components/layout/SectionLabel'
import SetReadout from '../components/forms/SetReadout'
import AccessoryPicker from '../components/workout/AccessoryPicker'

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
  onMount(() => { void load() })

  const loadAssistanceDefaults = async (liftId: number) => {
    setAssistanceDefaults(await getAssistanceDefaults(db, liftId))
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

    setTm(await getCurrentTm(db, next.liftId))
    await loadAssistanceDefaults(next.liftId)

    setLoading(false)
  }

  const handleSelectLift = async (liftId: number) => {
    setSelectedLiftId(liftId)
    setTm(await getCurrentTm(db, liftId))
    await loadAssistanceDefaults(liftId)
  }

  const launchSession = async () => {
    const selId = selectedLiftId()
    if (!selId) return
    const existing = await db.sessions
      .where('cycleId').equals(currentCycleId())
      .filter(s => s.liftId === selId && s.week === currentWeek())
      .toArray()
    const pending = existing.find(s => s.status === 'pending')

    let session: Session
    if (pending) {
      session = pending
    } else {
      // No pending row but the lift already has history this week: starting
      // again is a redo. The new pending row reopens the lift's week
      // (weekComplete counts any pending row as work owed), so confirm instead
      // of silently un-completing the day.
      if (existing.length > 0) {
        const name = lifts().find(l => l.id === selId)?.name ?? 'This lift'
        const done = existing.some(s => s.status === 'completed')
        if (!await confirm(
          `${name} ${done ? 'is already completed' : 'was skipped'} this week. Redo it as a new session?`,
          { confirmLabel: 'REDO' }
        )) return
      }
      const draft: Omit<Session, 'id'> = {
        cycleId: currentCycleId(),
        liftId: selId,
        week: currentWeek(),
        date: new Date(),
        notes: null,
        status: 'pending',
      }
      const id = await db.sessions.add(draft)
      session = { ...draft, id }
    }
    startSession(session)
    // Seed each fixed slot from this lift's persisted default — the pick from
    // last time (or from Today), until the user swaps it mid-session.
    for (const pick of await getAssistanceDefaultPicks(db, selId)) {
      addAccessory(toActiveAccessory(pick, pick.section))
    }
    navigate('/workout')
  }

  const handleStart = async () => {
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
      if (active.id) await discardPendingSession(db, active.id)
      clearSession()
    }
    void launchSession()
  }

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

  // Status outranks the selection arrow: selecting a finished lift must not
  // hide that it's already done — that's the cue against an accidental redo.
  const statusLabel = (ws: WeekStatus) => {
    if (ws.status === 'completed') return 'done'
    if (ws.status === 'skipped') return 'skip'
    if (ws.liftId === selectedLiftId()) return '->'
    return ''
  }

  return (
    <Show when={!loading()}>
      <div class="p-4 md:p-8 font-mono max-w-5xl mx-auto">
        <Show when={workout.activeSession}>
          <A
            href="/workout"
            class="block border border-warn text-warn px-4 py-3 text-xs tracking-widest uppercase mb-6"
          >
            &#9654; SESSION IN PROGRESS — RESUME
          </A>
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
                    class={`border px-3 py-2 text-xs tracking-widest ${
                      ws.liftId === selectedLiftId()
                        ? 'border-warn text-warn'
                        : ws.status === 'completed'
                        ? 'border-accent text-accent'
                        : ws.status === 'skipped'
                        ? 'border-danger text-danger'
                        : 'border-border text-muted hover:border-text hover:text-text'
                    }`}
                  >
                    {ws.name} {statusLabel(ws)}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div>
            <Show when={selectedLift()}>
              <Rule label={`${selectedLift()!.name} . TODAY`} class="text-muted mb-4" />
              <Show when={tm() === 0}>
                <p class="text-warn text-xs uppercase tracking-widest mb-4">
                  No training max set for {selectedLift()!.name} —{' '}
                  <A href="/settings" class="underline">add one in Settings</A> before starting.
                </p>
              </Show>
              <Show when={tm() > 0}>
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
                  <Show when={supplementalLabel() !== null && supplementalSets().length > 0}>
                    <div>
                      <SectionLabel class="mb-1">{supplementalLabel()}</SectionLabel>
                      <SetReadout size="sm" alignWeight tone="text-text-dim" class="pl-2" weight={supplementalSets()[0].weight} value={`${supplementalSets()[0].reps}`} />
                    </div>
                  </Show>
                  <For each={crossPreview() ?? []}>
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
                            <span>{def() ? def()!.name : `+ CHOOSE`}</span>
                          </button>
                        </div>
                      )
                    }}
                  </For>
                </div>
              </Show>
              <button
                onClick={() => void handleStart()}
                disabled={tm() === 0}
                class="mt-6 border border-accent text-accent px-6 py-4 font-mono w-full tracking-widest text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                START WORKOUT
              </button>
            </Show>
          </div>
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
  )
}
