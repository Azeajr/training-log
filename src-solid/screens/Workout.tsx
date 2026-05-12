import { createSignal, createEffect, on, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { db } from '../../src/db/db-v2'
import type { Lift, Exercise } from '../../src/db/db-v2'
import { workout, logSet, editSet, advanceSet, deleteLastSet, startRest, clearSession, setNotes } from '../store/workoutStore'
import {
  calcMainSets,
  calcFslSets,
  calcJokerSet,
  calcJokerIncrement,
  calcNextJokerWeight,
  shouldShowJokerButton,
  targetReps,
  JOKER_MIN_REPS,
} from '../../src/lib/calc'
import { useCalcWorker } from '../../src/hooks/useCalcWorker'
import type { AmrapTarget, MainSet, FslSet, WarmupSet, JokerSet } from '../../src/lib/calc'
import type { RestType } from '../store/workoutStore'
import { getAmrapTargets, advanceCycleIfComplete, deloadTms } from '../../src/lib/session'
import SetRow from '../components/SetRow'
import AccessoryPicker from '../components/AccessoryPicker'
import AccessoryLog from '../components/AccessoryLog'
import RestTimer from '../components/RestTimer'
import Rule from '../components/Rule'

export default function Workout() {
  const navigate = useNavigate()
  const calcWorker = useCalcWorker()

  const [lift, setLift] = createSignal<Lift | null>(null)
  const [allSets, setAllSets] = createSignal<(WarmupSet | MainSet | FslSet | JokerSet)[]>([])
  const [jokerSets, setJokerSets] = createSignal<JokerSet[]>([])
  const [amrapTargets, setAmrapTargets] = createSignal<AmrapTarget[]>([])
  const [showPicker, setShowPicker] = createSignal(false)
  const [exercises, setExercises] = createSignal<Exercise[]>([])
  const [skipConfirm, setSkipConfirm] = createSignal(false)
  const [exitConfirm, setExitConfirm] = createSignal(false)
  const [cycleCompleteData, setCycleCompleteData] = createSignal<Array<{ liftName: string; weight: number }> | null>(null)

  let prevAmrapSets: Array<{ weight: number; reps: number; label: string }> = []
  let tmWeight = 0

  createEffect(on(() => workout.activeSession, (session) => {
    if (!session) return
    void loadData()
  }))

  const loadData = async () => {
    const session = workout.activeSession
    if (!session) return
    const l = await db.lifts.get(session.liftId)
    if (!l) return
    setLift(l)

    const tms = await db.trainingMaxes.where('liftId').equals(l.id!).sortBy('setAt')
    tmWeight = tms[tms.length - 1]?.weight ?? 0

    const main = calcMainSets(tmWeight, session.week)
    const freshLoggedSets = workout.loggedSets
    const loggedFsl = freshLoggedSets.filter(s => s.type === 'fsl')
    const fslOverride = loggedFsl.length > 0 ? loggedFsl[loggedFsl.length - 1].weight : null
    const fsl = calcFslSets(main[0].weight).map((s, i) =>
      fslOverride !== null && i >= loggedFsl.length ? { ...s, weight: fslOverride } : s
    )
    const warmup = await calcWorker.calcWarmup(tmWeight, main[0].weight, l.liftType, main[0].reps)
    const restoredJokers: JokerSet[] = freshLoggedSets
      .filter(s => s.type === 'joker')
      .map((s, i) => ({ type: 'joker' as const, setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false as const }))
    setJokerSets(restoredJokers)
    setAllSets([...warmup, ...main, ...restoredJokers, ...fsl])

    if (session.week !== 4) {
      const amrapSet = main.find(s => s.isAmrap)
      if (amrapSet) {
        const prevSets = await getAmrapTargets(session.liftId, session.week, session.cycleId)
        if (prevSets.length > 0) {
          prevAmrapSets = prevSets
          setAmrapTargets(await calcWorker.calcAmrapTargets(prevSets, amrapSet.weight))
        } else {
          prevAmrapSets = []
          const est1RM = tmWeight / 0.9
          setAmrapTargets([{ label: 'goal', reps: targetReps(est1RM, amrapSet.weight), est1RM: Math.round(est1RM) }])
        }
      }
    }

    const allExercises = await db.exercises.toArray()
    setExercises(allExercises)
  }

  const handleAmrapWeightChange = async (weight: number) => {
    if (prevAmrapSets.length > 0) {
      setAmrapTargets(await calcWorker.calcAmrapTargets(prevAmrapSets, weight))
    } else if (tmWeight > 0) {
      const est1RM = tmWeight / 0.9
      setAmrapTargets([{ label: 'goal', reps: targetReps(est1RM, weight), est1RM: Math.round(est1RM) }])
    }
  }

  const handleDeleteSet = async () => {
    const sets = workout.loggedSets
    const lastSet = sets[sets.length - 1]
    if (!lastSet) return
    if (lastSet.id) await db.sets.delete(lastSet.id)
    if (lastSet.type === 'joker') {
      const updatedJokers = jokerSets().slice(0, -1)
      setJokerSets(updatedJokers)
      setAllSets(prev => {
        const w = prev.filter(s => s.type === 'warmup') as WarmupSet[]
        const m = prev.filter(s => s.type === 'main') as MainSet[]
        const f = prev.filter(s => s.type === 'fsl') as FslSet[]
        return [...w, ...m, ...updatedJokers, ...f]
      })
    }
    deleteLastSet()
    void loadData()
  }

  const handleLog = (setIndex: number, reps: number, weight: number) => {
    const s = allSets()[setIndex]
    const setData = {
      sessionId: workout.activeSession!.id!,
      type: s.type,
      setNumber: s.setNumber,
      weight,
      reps,
      isAmrap: (s as MainSet).isAmrap ?? false,
    }
    logSet(setData)
    advanceSet()
    db.sets.add(setData).then(dbId => editSet(setIndex, { id: dbId }))

    if (s.type === 'fsl' && weight !== s.weight) {
      setAllSets(prev => prev.map((ps, idx) =>
        ps.type === 'fsl' && idx > setIndex ? { ...ps, weight } : ps
      ))
    }
    if (s.type === 'main' && s.setNumber === 1 && weight !== s.weight) {
      setAllSets(prev => prev.map(ps => ps.type === 'fsl' ? { ...ps, weight } : ps))
    }

    const nextS = allSets()[setIndex + 1]
    let restType: RestType
    if (reps < s.reps) {
      restType = 'fail'
    } else if (!nextS || nextS.type !== s.type) {
      restType = 'transition'
    } else {
      restType = 'normal'
    }
    startRest(restType)
  }

  const handleEdit = (setIndex: number, reps: number, weight: number) => {
    editSet(setIndex, { reps, weight })
    const dbId = workout.loggedSets[setIndex]?.id
    if (dbId) db.sets.update(dbId, { reps, weight })
  }

  const handleAddJoker = () => {
    const sets = allSets()
    const amrapSet = sets.find(s => s.type === 'main' && (s as MainSet).isAmrap) as MainSet | undefined
    const amrapIdx = amrapSet ? sets.indexOf(amrapSet) : -1
    const loggedAmrapReps = amrapIdx >= 0 ? (workout.loggedSets[amrapIdx]?.reps ?? 0) : 0
    const weekGoalReps = JOKER_MIN_REPS[workout.activeSession!.week] ?? 1
    const increment = calcJokerIncrement(loggedAmrapReps, weekGoalReps)
    const jk = jokerSets()
    const lastWeight = jk.length > 0 ? jk[jk.length - 1].weight : (amrapSet?.weight ?? 0)
    const jokerReps = ({ 1: 5, 2: 3, 3: 1 } as Record<number, number>)[workout.activeSession!.week] ?? 5
    const newJoker = calcJokerSet(lastWeight, jk.length + 1, jokerReps, increment)
    const updatedJokers = [...jk, newJoker]
    setJokerSets(updatedJokers)
    setAllSets(prev => {
      const w = prev.filter(s => s.type === 'warmup') as WarmupSet[]
      const m = prev.filter(s => s.type === 'main') as MainSet[]
      const f = prev.filter(s => s.type === 'fsl') as FslSet[]
      return [...w, ...m, ...updatedJokers, ...f]
    })
  }

  const handleComplete = async () => {
    const session = workout.activeSession
    if (!session?.id) return
    await db.sessions.update(session.id, { status: 'completed', notes: workout.notes, date: new Date() })
    for (const acc of workout.activeAccessories) {
      for (const s of acc.loggedSets) {
        if (s.setNumber != null) {
          await db.accessorySets.add({
            sessionId: session.id,
            exerciseId: acc.exerciseId,
            setNumber: s.setNumber,
            weight: s.weight ?? null,
            reps: s.reps ?? null,
            duration: s.duration ?? null,
            distance: s.distance ?? null,
          })
        }
      }
    }
    const advanced = await checkWeekAdvancement()
    if (!advanced) { clearSession(); navigate('/today') }
  }

  const handleExit = async () => {
    const session = workout.activeSession
    if (!session?.id) return
    await db.sets.where('sessionId').equals(session.id).delete()
    await db.accessorySets.where('sessionId').equals(session.id).delete()
    clearSession()
    navigate('/today')
  }

  const handleSkip = async () => {
    const session = workout.activeSession
    if (!session?.id) return
    await db.sessions.update(session.id, { status: 'skipped' })
    const advanced = await checkWeekAdvancement()
    if (!advanced) { clearSession(); navigate('/today') }
  }

  const checkWeekAdvancement = async (): Promise<boolean> => {
    const { advanced, newTms } = await advanceCycleIfComplete()
    if (advanced) setCycleCompleteData(newTms)
    return advanced
  }

  const handleCycleCompleteDismiss = () => {
    setCycleCompleteData(null)
    clearSession()
    navigate('/today')
  }

  const warmupSets = () => allSets().filter(s => s.type === 'warmup') as WarmupSet[]
  const mainSets = () => allSets().filter(s => s.type === 'main') as MainSet[]
  const jokerSetsRendered = () => allSets().filter(s => s.type === 'joker') as JokerSet[]
  const fslSets = () => allSets().filter(s => s.type === 'fsl') as FslSet[]
  const warmupCount = () => warmupSets().length
  const mainCount = () => mainSets().length
  const jokerCount = () => jokerSetsRendered().length

  const showJokerButton = () => workout.activeSession ? shouldShowJokerButton({
    week: workout.activeSession.week,
    loggedSets: workout.loggedSets,
    warmupCount: warmupCount(),
    mainCount: mainCount(),
    jokerCount: jokerCount(),
  }) : false

  const amrapSet = () => mainSets().find(s => s.isAmrap)
  const amrapIdx = () => { const a = amrapSet(); return a ? allSets().indexOf(a) : -1 }
  const loggedAmrapReps = () => amrapIdx() >= 0 ? (workout.loggedSets[amrapIdx()]?.reps ?? 0) : 0
  const jokerIncrement = () => calcJokerIncrement(loggedAmrapReps(), JOKER_MIN_REPS[workout.activeSession?.week ?? 1] ?? 1)
  const lastJokerWeight = () => jokerCount() > 0 ? jokerSetsRendered()[jokerCount() - 1].weight : (amrapSet()?.weight ?? 0)
  const nextJokerWeight = () => calcNextJokerWeight(lastJokerWeight(), jokerIncrement())
  const liftName = () => lift()?.name ?? '...'

  return (
    <Show
      when={workout.activeSession}
      fallback={
        <div class="p-6 font-mono text-muted">
          No active session. Go to <span class="text-accent">TODAY</span> to start one.
        </div>
      }
    >
      <div class="p-4 md:p-8 font-mono pb-48 max-w-3xl mx-auto">
            <Rule
              label={`${liftName()} . WEEK ${workout.activeSession!.week}${workout.activeSession!.week === 4 ? ' . DELOAD' : ''}`}
              class={`mb-6 ${workout.activeSession!.week === 4 ? 'text-blue-400' : 'text-muted'}`}
            />

            <div class="md:grid md:grid-cols-3 md:gap-8 md:items-start mb-6">
              <div class="mb-6 md:mb-0">
                <div class="text-muted uppercase text-xs tracking-widest mb-2">WARM UP</div>
                <For each={warmupSets()}>
                  {(s, i) => (
                    <SetRow
                      set={{ ...s, isAmrap: false }}
                      isActive={workout.currentSetIndex === i()}
                      isCompleted={i() < workout.currentSetIndex}
                      loggedReps={workout.loggedSets[i()]?.reps}
                      loggedWeight={workout.loggedSets[i()]?.weight}
                      onLog={(reps, weight) => handleLog(i(), reps, weight)}
                      onEdit={(reps, weight) => handleEdit(i(), reps, weight)}
                      onDelete={i() === workout.currentSetIndex - 1 ? handleDeleteSet : undefined}
                    />
                  )}
                </For>
              </div>

              <div class="mb-6 md:mb-0">
                <div class="text-muted uppercase text-xs tracking-widest mb-2">MAIN</div>
                <For each={mainSets()}>
                  {(s, i) => {
                    const globalIdx = () => warmupCount() + i()
                    return (
                      <SetRow
                        set={s}
                        isActive={workout.currentSetIndex === globalIdx()}
                        isCompleted={globalIdx() < workout.currentSetIndex}
                        loggedReps={workout.loggedSets[globalIdx()]?.reps}
                        loggedWeight={workout.loggedSets[globalIdx()]?.weight}
                        amrapTargets={s.isAmrap ? amrapTargets() : undefined}
                        onLog={(reps, weight) => handleLog(globalIdx(), reps, weight)}
                        onEdit={(reps, weight) => handleEdit(globalIdx(), reps, weight)}
                        onWeightChange={s.isAmrap ? handleAmrapWeightChange : undefined}
                        onDelete={globalIdx() === workout.currentSetIndex - 1 ? handleDeleteSet : undefined}
                      />
                    )
                  }}
                </For>
                <Show when={jokerSetsRendered().length > 0}>
                  <div class="mt-4">
                    <div class="text-muted uppercase text-xs tracking-widest mb-2">JOKER SETS</div>
                    <For each={jokerSetsRendered()}>
                      {(s, i) => {
                        const globalIdx = () => warmupCount() + mainCount() + i()
                        return (
                          <SetRow
                            set={s}
                            isActive={workout.currentSetIndex === globalIdx()}
                            isCompleted={globalIdx() < workout.currentSetIndex}
                            loggedReps={workout.loggedSets[globalIdx()]?.reps}
                            loggedWeight={workout.loggedSets[globalIdx()]?.weight}
                            onLog={(reps, weight) => handleLog(globalIdx(), reps, weight)}
                            onEdit={(reps, weight) => handleEdit(globalIdx(), reps, weight)}
                            onDelete={globalIdx() === workout.currentSetIndex - 1 ? handleDeleteSet : undefined}
                          />
                        )
                      }}
                    </For>
                  </div>
                </Show>
                <Show when={showJokerButton()}>
                  <button
                    onClick={handleAddJoker}
                    class="w-full border border-warn text-warn py-3 font-mono text-xs tracking-widest hover:bg-warn/10 mt-4"
                  >
                    + JOKER SET  {nextJokerWeight()}lb
                  </button>
                </Show>
              </div>

              <div class="mb-6 md:mb-0">
                <div class="text-muted uppercase text-xs tracking-widest mb-2">FSL  5 x 10</div>
                <For each={fslSets()}>
                  {(s, i) => {
                    const globalIdx = () => warmupCount() + mainCount() + jokerCount() + i()
                    return (
                      <SetRow
                        set={{ ...s, isAmrap: false }}
                        isActive={workout.currentSetIndex === globalIdx()}
                        isCompleted={globalIdx() < workout.currentSetIndex}
                        loggedReps={workout.loggedSets[globalIdx()]?.reps}
                        loggedWeight={workout.loggedSets[globalIdx()]?.weight}
                        onLog={(reps, weight) => handleLog(globalIdx(), reps, weight)}
                        onEdit={(reps, weight) => handleEdit(globalIdx(), reps, weight)}
                        onDelete={globalIdx() === workout.currentSetIndex - 1 ? handleDeleteSet : undefined}
                      />
                    )
                  }}
                </For>
                <Show when={fslSets().length > 0 && workout.loggedSets.filter(s => s.type === 'fsl').length >= fslSets().length}>
                  <button
                    onClick={() => {
                      const last = fslSets()[fslSets().length - 1]
                      setAllSets(prev => [
                        ...prev,
                        { type: 'fsl' as const, setNumber: fslSets().length + 1, weight: last.weight, reps: last.reps },
                      ])
                    }}
                    class="w-full border border-border text-muted py-2 font-mono text-xs tracking-widest hover:border-accent hover:text-accent mt-2"
                  >
                    + ADD FSL SET
                  </button>
                </Show>
              </div>
            </div>

            <Show when={workout.activeAccessories.length > 0}>
              <div class="mb-4">
                <Rule label="ACCESSORIES" class="text-muted mb-2" />
                <For each={workout.activeAccessories}>
                  {acc => (
                    <AccessoryLog
                      accessory={acc}
                      exercise={exercises().find(e => e.id === acc.exerciseId)}
                    />
                  )}
                </For>
              </div>
            </Show>

            <button
              onClick={() => setShowPicker(true)}
              class="w-full border border-border py-3 text-muted text-xs tracking-widest hover:border-accent hover:text-accent mb-6"
            >
              + SELECT ASSISTANCE EXERCISE
            </button>

            <div class="mb-6">
              <Rule label="NOTES" class="text-muted mb-2" />
              <textarea
                value={workout.notes}
                onInput={e => setNotes(e.currentTarget.value)}
                class="w-full bg-surface border border-border text-text font-mono px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none"
                rows={3}
                placeholder="Session notes..."
              />
            </div>

            <div class="flex gap-3">
              <button
                onClick={() => void handleComplete()}
                class="flex-1 border border-accent text-accent py-4 font-mono text-sm tracking-widest"
              >
                COMPLETE SESSION
              </button>
              <Show
                when={!skipConfirm()}
                fallback={
                  <div class="flex gap-2">
                    <button
                      onClick={() => void handleSkip()}
                      class="border border-danger text-danger px-3 py-4 font-mono text-xs tracking-widest"
                    >
                      CONFIRM SKIP
                    </button>
                    <button
                      onClick={() => setSkipConfirm(false)}
                      class="text-muted px-3 py-4 font-mono text-xs"
                    >
                      CANCEL
                    </button>
                  </div>
                }
              >
                <button
                  onClick={() => setSkipConfirm(true)}
                  class="border border-danger text-danger px-5 py-4 font-mono text-sm"
                >
                  SKIP LIFT
                </button>
              </Show>
            </div>

            <div class="flex justify-end mt-3">
              <Show
                when={!exitConfirm()}
                fallback={
                  <div class="flex gap-3 items-center">
                    <span class="text-muted text-xs">discard this attempt?</span>
                    <button
                      onClick={() => void handleExit()}
                      class="border border-danger text-danger px-3 py-1 font-mono text-xs tracking-widest"
                    >
                      CONFIRM EXIT
                    </button>
                    <button
                      onClick={() => setExitConfirm(false)}
                      class="text-muted font-mono text-xs"
                    >
                      cancel
                    </button>
                  </div>
                }
              >
                <button
                  onClick={() => setExitConfirm(true)}
                  class="text-muted hover:text-text-dim font-mono text-xs tracking-widest"
                >
                  EXIT WITHOUT SAVING
                </button>
              </Show>
            </div>

            <Show when={showPicker() && lift()}>
              <AccessoryPicker
                liftId={lift()!.id!}
                onClose={() => { setShowPicker(false); void loadData() }}
              />
            </Show>

            <Show when={cycleCompleteData()}>
              {data => (
                <div class="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                  <div class="bg-surface border border-accent p-6 font-mono max-w-sm w-full">
                    <div class="text-accent uppercase tracking-widest text-sm mb-1">CYCLE COMPLETE</div>
                    <div class="text-muted text-xs mb-4">New training maxes:</div>
                    <div class="mb-6 space-y-2">
                      <For each={data()}>
                        {({ liftName, weight }) => (
                          <div class="flex justify-between text-sm">
                            <span class="text-text uppercase tracking-widest">{liftName}</span>
                            <span class="text-accent">{weight} lbs</span>
                          </div>
                        )}
                      </For>
                    </div>
                    <button
                      onClick={handleCycleCompleteDismiss}
                      class="w-full border border-accent text-accent py-3 text-xs tracking-widest font-mono mb-2"
                    >
                      CONTINUE
                    </button>
                    <button
                      onClick={async () => { await deloadTms(); handleCycleCompleteDismiss() }}
                      class="w-full border border-border text-muted py-3 text-xs tracking-widest font-mono hover:border-danger hover:text-danger"
                    >
                      DELOAD INSTEAD  −10%
                    </button>
                  </div>
                </div>
              )}
            </Show>

            <RestTimer />
          </div>
    </Show>
  )
}
