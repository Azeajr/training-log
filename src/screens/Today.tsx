import { createSignal, onMount, Show, For } from 'solid-js'
import { useNavigate, A } from '@solidjs/router'
import { db } from '../db/index'
import type { Lift, Session } from '../types/domain'
import { workout, startSession, clearSession } from '../store/workout-store'
import { calcMainSets, calcWarmup, calcSupplementalSets, getSupplementalLabel } from '../lib/calc'
import type { FslSet } from '../lib/calc'
import { getNextSession } from '../lib/cycle'
import { getCurrentTm } from '../lib/training-max'
import { settings } from '../store/settings-store'
import { useConfirmation } from '../hooks/use-confirmation'
import SessionPreview from '../components/workout/SessionPreview'
import Rule from '../components/layout/Rule'

interface WeekStatus {
  liftId: number
  name: string
  status: 'pending' | 'completed' | 'skipped' | 'suggested'
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
  onMount(() => { void load() })

  const load = async () => {
    setLoading(true)
    const next = await getNextSession(db)
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

    setTm(await getCurrentTm(db, next.liftId))

    setLoading(false)
  }

  const handleSelectLift = async (liftId: number) => {
    setSelectedLiftId(liftId)
    setTm(await getCurrentTm(db, liftId))
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

  const handleStart = async () => {
    const selId = selectedLiftId()
    if (!selId) return
    if (workout.activeSession && workout.activeSession.liftId === selId) {
      navigate('/workout')
      return
    }
    if (workout.activeSession) {
      const activeLiftName = lifts().find(l => l.id === workout.activeSession?.liftId)?.name ?? ''
      if (!await confirm(`Abandon ${activeLiftName} session?`, { destructive: true, confirmLabel: 'YES' })) return
      clearSession()
    }
    void launchSession()
  }

  const selectedLift = () => lifts().find(l => l.id === selectedLiftId())
  const main = () => selectedLift() ? calcMainSets(tm(), currentWeek(), settings.barWeight) : []
  const warmup = () => selectedLift() ? calcWarmup(tm(), main()[0]?.weight ?? tm(), settings.barWeight) : []

  const supplementalSets = (): FslSet[] =>
    calcSupplementalSets(settings.supplementalTemplate ?? 'fsl+bbb', main(), tm(), currentWeek(), settings.barWeight)

  const supplementalLabel = (): string | null =>
    getSupplementalLabel(settings.supplementalTemplate ?? 'fsl+bbb', supplementalSets(), currentWeek())

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
                <SessionPreview warmup={warmup()} main={main()} fsl={supplementalSets()} supplementalLabel={supplementalLabel()} />
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
      </div>
    </Show>
  )
}
