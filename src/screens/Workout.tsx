import { createSignal, createEffect, on, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import type { Lift, Exercise } from '../types/domain'
import { workout, logSet, editSet, advanceSet, deleteLastSet, startRest, clearSession, setNotes } from '../store/workout-store'
import {
  calcMainSets, calcWarmup, calcAmrapTargets, calcSupplementalSets, getSupplementalLabel,
  calcJokerSet, calcJokerIncrement, calcNextJokerWeight, shouldShowJokerButton,
  targetReps, JOKER_MIN_REPS, est1RMFromTm, isSupplementalType,
  applyMainCascadeToSupplemental, applySupplementalOverride,
} from '../lib/calc'
import type { AmrapTarget, MainSet, FslSet, WarmupSet, JokerSet } from '../lib/calc'
import type { SupplementalTemplate } from '../types/domain'
import type { RestType } from '../store/workout-store'
import { advanceCycleIfComplete, getAmrapTargets, deloadTms } from '../lib/cycle'
import { getCurrentTm } from '../lib/training-max'
import { settings } from '../store/settings-store'
import { useConfirmation } from '../hooks/use-confirmation'
import { showToast } from '../store/toast-store'
import SetRow from '../components/workout/SetRow'
import AccessoryPicker from '../components/workout/AccessoryPicker'
import AccessoryLog from '../components/workout/AccessoryLog'
import RestTimer from '../components/workout/RestTimer'
import CycleCompleteModal from '../components/modals/CycleCompleteModal'
import type { CycleCompleteData } from '../components/modals/CycleCompleteModal'
import Rule from '../components/layout/Rule'

function SetSection(props: {
  sets: () => (WarmupSet | MainSet | JokerSet | FslSet)[]
  offset: () => number
  forceAmrapFalse?: boolean
  amrapTargets?: () => AmrapTarget[]
  onWeightChange?: (weight: number) => void
  onLog: (idx: number, reps: number, weight: number) => void
  onEdit: (idx: number, reps: number, weight: number) => void
  onDelete: () => void
}) {
  return (
    <For each={props.sets()}>
      {(s, i) => {
        const globalIdx = () => props.offset() + i()
        return (
          <SetRow
            set={{ ...s, isAmrap: props.forceAmrapFalse ? false : !!(s as MainSet).isAmrap }}
            isActive={workout.currentSetIndex === globalIdx()}
            isCompleted={globalIdx() < workout.currentSetIndex}
            loggedReps={workout.loggedSets[globalIdx()]?.reps}
            loggedWeight={workout.loggedSets[globalIdx()]?.weight}
            amrapTargets={(s as MainSet).isAmrap && props.amrapTargets ? props.amrapTargets() : undefined}
            onLog={(reps, weight) => props.onLog(globalIdx(), reps, weight)}
            onEdit={(reps, weight) => props.onEdit(globalIdx(), reps, weight)}
            onWeightChange={(s as MainSet).isAmrap ? props.onWeightChange : undefined}
            onDelete={globalIdx() === workout.currentSetIndex - 1 ? props.onDelete : undefined}
          />
        )
      }}
    </For>
  )
}

export default function Workout() {
  const navigate = useNavigate()
  const { confirm } = useConfirmation()

  const [lift, setLift] = createSignal<Lift | null>(null)
  const [supplementalTemplate, setSupplementalTemplate] = createSignal<SupplementalTemplate>('fsl')
  const [allSets, setAllSets] = createSignal<(WarmupSet | MainSet | FslSet | JokerSet)[]>([])
  const [amrapTargets, setAmrapTargets] = createSignal<AmrapTarget[]>([])
  const [showPicker, setShowPicker] = createSignal(false)
  const [exercises, setExercises] = createSignal<Exercise[]>([])
  const [cycleCompleteData, setCycleCompleteData] = createSignal<CycleCompleteData | null>(null)

  const [prevAmrapSets, setPrevAmrapSets] = createSignal<Array<{ weight: number; reps: number; label: string }>>([])
  const [tmWeight, setTmWeight] = createSignal(0)

  createEffect(on(() => workout.activeSession, (session) => {
    if (!session) return
    void loadData()
  }))

  const composeAllSets = (tm: number, week: 1 | 2 | 3 | 4, template: SupplementalTemplate) => {
    const main = calcMainSets(tm, week, settings.barWeight)
    const loggedSets = workout.loggedSets
    const fslRaw = calcSupplementalSets(template, main, tm, week, settings.barWeight)
    const fsl = applySupplementalOverride(fslRaw, loggedSets, template)
    const warmup = calcWarmup(tm, main[0].weight, settings.barWeight)
    const restoredJokers: JokerSet[] = loggedSets
      .filter(s => s.type === 'joker')
      .map((s, i) => ({ type: 'joker' as const, setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false as const }))
    return { all: [...warmup, ...main, ...restoredJokers, ...fsl], main }
  }

  const loadData = async () => {
    const session = workout.activeSession
    if (!session) return
    const l = await db.lifts.get(session.liftId)
    if (!l) return
    setLift(l)

    const tm = await getCurrentTm(db, l.id!)
    setTmWeight(tm)

    const template = settings.supplementalTemplate ?? 'fsl+bbb'
    setSupplementalTemplate(template)
    const { all, main } = composeAllSets(tm, session.week, template)
    setAllSets(all)

    if (session.week !== 4) {
      const amrapSet = main.find(s => s.isAmrap)
      if (amrapSet) {
        const prevSets = await getAmrapTargets(db, session.liftId, session.week, session.cycleId)
        if (prevSets.length > 0) {
          setPrevAmrapSets(prevSets)
          setAmrapTargets(calcAmrapTargets(prevSets, amrapSet.weight))
        } else {
          setPrevAmrapSets([])
          const est1RM = est1RMFromTm(tm)
          setAmrapTargets([{ label: 'goal', reps: targetReps(est1RM, amrapSet.weight), est1RM: Math.round(est1RM) }])
        }
      }
    }

    setExercises(await db.exercises.toArray())
  }

  const rebuildAllSets = () => {
    const session = workout.activeSession
    if (!session) return
    const tm = tmWeight()
    if (!tm) return
    const { all } = composeAllSets(tm, session.week, supplementalTemplate())
    setAllSets(all)
  }

  const handleAmrapWeightChange = (weight: number) => {
    const prev = prevAmrapSets()
    const tm = tmWeight()
    if (prev.length > 0) {
      setAmrapTargets(calcAmrapTargets(prev, weight))
    } else if (tm > 0) {
      const est1RM = est1RMFromTm(tm)
      setAmrapTargets([{ label: 'goal', reps: targetReps(est1RM, weight), est1RM: Math.round(est1RM) }])
    }
  }

  const handleDeleteSet = async () => {
    const sets = workout.loggedSets
    const lastSet = sets[sets.length - 1]
    if (!lastSet) return
    if (lastSet.id) await db.sets.delete(lastSet.id)
    deleteLastSet()
    rebuildAllSets()
  }

  const handleLog = async (setIndex: number, reps: number, weight: number) => {
    const s = allSets()[setIndex]
    const setData = {
      sessionId: workout.activeSession!.id!,
      type: s.type,
      setNumber: s.setNumber,
      weight,
      reps,
      isAmrap: (s as MainSet).isAmrap ?? false,
    }
    const prevAllSets = allSets()
    logSet(setData)
    advanceSet()

    if (isSupplementalType(s.type) && weight !== s.weight) {
      setAllSets(prev => prev.map((ps, idx) =>
        ps.type === s.type && idx > setIndex ? { ...ps, weight } : ps
      ))
    }
    if (s.type === 'main' && s.setNumber === 1 && weight !== s.weight) {
      setAllSets(prev => applyMainCascadeToSupplemental(prev, supplementalTemplate(), weight))
    }

    try {
      const dbId = await db.sets.add(setData)
      editSet(setIndex, { id: dbId })
    } catch (err) {
      deleteLastSet()
      setAllSets(prevAllSets)
      showToast(`Failed to save set: ${err instanceof Error ? err.message : 'unknown error'}`)
      return
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

  const handleEdit = async (setIndex: number, reps: number, weight: number) => {
    const prev = workout.loggedSets[setIndex]
    if (!prev) return
    editSet(setIndex, { reps, weight })
    if (!prev.id) return
    try {
      await db.sets.update(prev.id, { reps, weight })
    } catch (err) {
      editSet(setIndex, { reps: prev.reps, weight: prev.weight })
      showToast(`Failed to save edit: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  const handleAddJoker = () => {
    const sets = allSets()
    const amrapSet = sets.find(s => s.type === 'main' && (s as MainSet).isAmrap) as MainSet | undefined
    const amrapIdx = amrapSet ? sets.indexOf(amrapSet) : -1
    const loggedAmrapReps = amrapIdx >= 0 ? (workout.loggedSets[amrapIdx]?.reps ?? 0) : 0
    const weekGoalReps = JOKER_MIN_REPS[workout.activeSession!.week] ?? 1
    const increment = calcJokerIncrement(loggedAmrapReps, weekGoalReps)
    const jk = sets.filter(s => s.type === 'joker') as JokerSet[]
    const lastWeight = jk.length > 0 ? jk[jk.length - 1].weight : (amrapSet?.weight ?? 0)
    const jokerReps = JOKER_MIN_REPS[workout.activeSession!.week] ?? 5
    const newJoker = calcJokerSet(lastWeight, jk.length + 1, jokerReps, increment)
    const updatedJokers = [...jk, newJoker]
    setAllSets(prev => {
      const w = prev.filter(s => s.type === 'warmup') as WarmupSet[]
      const m = prev.filter(s => s.type === 'main') as MainSet[]
      const f = prev.filter(s => isSupplementalType(s.type)) as FslSet[]
      return [...w, ...m, ...updatedJokers, ...f]
    })
  }

  const finishSession = async () => {
    const { advanced, newTms } = await advanceCycleIfComplete(db)
    if (advanced) setCycleCompleteData({ newTms })
    else { clearSession(); navigate('/today') }
  }

  const handleComplete = async () => {
    const session = workout.activeSession
    if (!session?.id) return
    const sessionId = session.id
    const toSave = workout.activeAccessories.flatMap(acc =>
      acc.loggedSets
        .filter(s => s.setNumber != null)
        .map(s => ({
          sessionId,
          exerciseId: acc.exerciseId,
          setNumber: s.setNumber!,
          weight: s.weight ?? null,
          reps: s.reps ?? null,
          duration: s.duration ?? null,
          distance: s.distance ?? null,
        }))
    )
    await db.transaction(async () => {
      await db.sessions.update(sessionId, { status: 'completed', notes: workout.notes, date: new Date() })
      if (toSave.length > 0) await db.accessorySets.bulkAdd(toSave)
    })
    await finishSession()
  }

  const handleExit = async () => {
    if (!await confirm('Discard this attempt?', { destructive: true, confirmLabel: 'EXIT' })) return
    const session = workout.activeSession
    if (!session?.id) return
    const sessionId = session.id
    await db.transaction(async () => {
      await db.sets.where('sessionId').equals(sessionId).delete()
      await db.accessorySets.where('sessionId').equals(sessionId).delete()
    })
    clearSession()
    navigate('/today')
  }

  const handleSkip = async () => {
    if (!await confirm('Skip this lift?', { destructive: true, confirmLabel: 'SKIP' })) return
    const session = workout.activeSession
    if (!session?.id) return
    await db.sessions.update(session.id, { status: 'skipped' })
    await finishSession()
  }

  const handleCycleCompleteDismiss = () => {
    setCycleCompleteData(null)
    clearSession()
    navigate('/today')
  }

  const handleCycleDeload = async () => {
    await deloadTms(db)
    handleCycleCompleteDismiss()
  }

  const warmupSets = () => allSets().filter(s => s.type === 'warmup') as WarmupSet[]
  const mainSets = () => allSets().filter(s => s.type === 'main') as MainSet[]
  const jokerSetsRendered = () => allSets().filter(s => s.type === 'joker') as JokerSet[]
  const fslSets = () => allSets().filter(s => isSupplementalType(s.type)) as FslSet[]
  const warmupCount = () => warmupSets().length
  const mainCount = () => mainSets().length
  const jokerCount = () => jokerSetsRendered().length
  const setOffset = (section: 'main' | 'joker' | 'fsl') => ({
    main:  warmupCount(),
    joker: warmupCount() + mainCount(),
    fsl:   warmupCount() + mainCount() + jokerCount(),
  }[section])

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

  const supplementalLabel = () =>
    getSupplementalLabel(supplementalTemplate(), fslSets(), workout.activeSession?.week ?? 1)

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
            <SetSection
              sets={warmupSets}
              offset={() => 0}
              forceAmrapFalse
              onLog={handleLog}
              onEdit={handleEdit}
              onDelete={handleDeleteSet}
            />
          </div>

          <div class="mb-6 md:mb-0">
            <div class="text-muted uppercase text-xs tracking-widest mb-2">MAIN</div>
            <SetSection
              sets={mainSets}
              offset={() => setOffset('main')}
              amrapTargets={amrapTargets}
              onWeightChange={handleAmrapWeightChange}
              onLog={handleLog}
              onEdit={handleEdit}
              onDelete={handleDeleteSet}
            />
            <Show when={jokerSetsRendered().length > 0}>
              <div class="mt-4">
                <div class="text-muted uppercase text-xs tracking-widest mb-2">JOKER SETS</div>
                <SetSection
                  sets={jokerSetsRendered}
                  offset={() => setOffset('joker')}
                  onLog={handleLog}
                  onEdit={handleEdit}
                  onDelete={handleDeleteSet}
                />
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

          <Show when={supplementalLabel() !== null}>
            <div class="mb-6 md:mb-0">
              <div class="text-muted uppercase text-xs tracking-widest mb-2">{supplementalLabel()}</div>
              <SetSection
                sets={fslSets}
                offset={() => setOffset('fsl')}
                forceAmrapFalse
                onLog={handleLog}
                onEdit={handleEdit}
                onDelete={handleDeleteSet}
              />
              <Show when={workout.loggedSets.filter(s => isSupplementalType(s.type)).length >= fslSets().length}>
                <button
                  onClick={() => {
                    const last = fslSets()[fslSets().length - 1]
                    setAllSets(prev => [
                      ...prev,
                      { type: supplementalTemplate() as Exclude<SupplementalTemplate, 'none'>, setNumber: fslSets().length + 1, weight: last.weight, reps: last.reps },
                    ])
                  }}
                  class="w-full border border-border text-muted py-2 font-mono text-xs tracking-widest hover:border-accent hover:text-accent mt-2"
                >
                  + ADD SET
                </button>
              </Show>
            </div>
          </Show>
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
          <button
            onClick={() => void handleSkip()}
            class="border border-danger text-danger px-5 py-4 font-mono text-sm"
          >
            SKIP LIFT
          </button>
        </div>

        <div class="flex justify-end mt-3">
          <button
            onClick={() => void handleExit()}
            class="text-muted hover:text-text-dim font-mono text-xs tracking-widest"
          >
            EXIT WITHOUT SAVING
          </button>
        </div>

        <Show when={showPicker() && lift()}>
          <AccessoryPicker
            liftId={lift()!.id!}
            onClose={() => { setShowPicker(false); void loadData() }}
          />
        </Show>

        <CycleCompleteModal
          data={cycleCompleteData()}
          onDismiss={handleCycleCompleteDismiss}
          onDeload={handleCycleDeload}
        />

        <RestTimer />
      </div>
    </Show>
  )
}
