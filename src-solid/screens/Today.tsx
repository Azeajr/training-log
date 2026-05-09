import { createSignal, onMount, Show, For } from 'solid-js'
import { useNavigate, A } from '@solidjs/router'
import { db } from '../../src/db/db-v2'
import type { Lift, Session } from '../../src/db/db-v2'
import { workout, startSession, clearSession } from '../store/workoutStore'
import { calcMainSets, calcFslSets, calcWarmup } from '../../src/lib/calc'
import { getNextSession } from '../../src/lib/session'
import SessionPreview from '../components/SessionPreview'
import Rule from '../components/Rule'

interface WeekStatus {
  liftId: number
  name: string
  status: 'pending' | 'completed' | 'skipped' | 'suggested'
}

export default function Today() {
  const navigate = useNavigate()
  const [loading, setLoading] = createSignal(true)
  const [lifts, setLifts] = createSignal<Lift[]>([])
  const [weekStatuses, setWeekStatuses] = createSignal<WeekStatus[]>([])
  const [selectedLiftId, setSelectedLiftId] = createSignal<number | null>(null)
  const [currentWeek, setCurrentWeek] = createSignal<1 | 2 | 3 | 4>(1)
  const [currentCycleId, setCurrentCycleId] = createSignal<number>(1)
  const [tm, setTm] = createSignal(0)
  const [liftType, setLiftType] = createSignal<'upper' | 'lower'>('upper')
  const [showAbandonConfirm, setShowAbandonConfirm] = createSignal(false)

  onMount(() => { void load() })

  const load = async () => {
    setLoading(true)
    const next = await getNextSession()
    const allLifts = (await db.lifts.toArray()).sort((a, b) => a.order - b.order)
    setLifts(allLifts)
    setCurrentWeek(next.week)
    setCurrentCycleId(next.cycleId)
    setSelectedLiftId(next.liftId)

    const sessions = await db.sessions.where('cycleId').equals(next.cycleId).toArray()
    const statuses: WeekStatus[] = allLifts.map(l => {
      const s = sessions.find(se => se.liftId === l.id && se.week === next.week)
      return { liftId: l.id!, name: l.name, status: s ? s.status : 'pending' }
    })
    setWeekStatuses(statuses)

    const currentTms = await db.trainingMaxes.where('liftId').equals(next.liftId).sortBy('setAt')
    const latestTm = currentTms[currentTms.length - 1]
    if (latestTm) setTm(latestTm.weight)

    const lift = allLifts.find(l => l.id === next.liftId)
    if (lift) setLiftType(lift.liftType)

    setLoading(false)
  }

  const handleSelectLift = async (liftId: number) => {
    setSelectedLiftId(liftId)
    const tms = await db.trainingMaxes.where('liftId').equals(liftId).sortBy('setAt')
    const latest = tms[tms.length - 1]
    setTm(latest?.weight ?? 0)
    const lift = lifts().find(l => l.id === liftId)
    if (lift) setLiftType(lift.liftType)
  }

  const launchSession = async () => {
    const selId = selectedLiftId()
    if (!selId) return
    const existing = await db.sessions
      .where('cycleId').equals(currentCycleId())
      .filter(s => s.liftId === selId && s.week === currentWeek() && s.status === 'pending')
      .first()

    let session: Session
    if (existing) {
      session = existing
    } else {
      const id = await db.sessions.add({
        cycleId: currentCycleId(),
        liftId: selId,
        week: currentWeek(),
        date: new Date(),
        notes: null,
        status: 'pending',
      })
      session = await db.sessions.get(id) as Session
    }
    startSession(session)
    navigate('/workout')
  }

  const handleStart = () => {
    const selId = selectedLiftId()
    if (!selId) return
    if (workout.activeSession && workout.activeSession.liftId === selId) {
      navigate('/workout')
      return
    }
    if (workout.activeSession) {
      setShowAbandonConfirm(true)
      return
    }
    void launchSession()
  }

  const handleAbandonAndStart = () => {
    clearSession()
    setShowAbandonConfirm(false)
    void launchSession()
  }

  const selectedLift = () => lifts().find(l => l.id === selectedLiftId())
  const main = () => selectedLift() ? calcMainSets(tm(), currentWeek()) : []
  const fsl = () => main().length > 0 ? calcFslSets(main()[0].weight) : []
  const warmup = () => selectedLift() ? calcWarmup(tm(), main()[0]?.weight ?? tm(), liftType(), main()[0]?.reps ?? 5) : []
  const activeLiftName = () => lifts().find(l => l.id === workout.activeSession?.liftId)?.name ?? ''

  const statusLabel = (ws: WeekStatus) => {
    if (ws.liftId === selectedLiftId()) return '->'
    if (ws.status === 'completed') return 'done'
    if (ws.status === 'skipped') return 'skip'
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
              class={`mb-4 ${currentWeek() === 4 ? 'text-blue-400' : 'text-muted'}`}
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
                <SessionPreview warmup={warmup()} main={main()} fsl={fsl()} />
              </Show>
              <button
                onClick={handleStart}
                disabled={tm() === 0}
                class="mt-6 border border-accent text-accent px-6 py-4 font-mono w-full tracking-widest text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                START WORKOUT
              </button>
            </Show>
          </div>
        </div>

        <Show when={showAbandonConfirm()}>
          <div class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div class="bg-surface border border-border p-6 font-mono max-w-sm w-full">
              <div class="text-text uppercase tracking-widest text-sm mb-2">ABANDON SESSION?</div>
              <div class="text-muted text-xs mb-6">
                Your {activeLiftName()} session is unfinished. Starting a new lift will discard it.
              </div>
              <div class="flex gap-3">
                <button
                  onClick={handleAbandonAndStart}
                  class="flex-1 border border-danger text-danger py-3 text-xs tracking-widest font-mono"
                >
                  ABANDON
                </button>
                <button
                  onClick={() => setShowAbandonConfirm(false)}
                  class="flex-1 border border-border text-muted py-3 text-xs tracking-widest font-mono"
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
