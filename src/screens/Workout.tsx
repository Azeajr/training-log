import { createSignal, createEffect, on, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import type { Lift, Exercise } from '../types/domain'
import { workout, logSet, editSet, advanceSet, deleteLastSet, startRest, clearSession, setNotes } from '../store/workout-store'
import {
  calcMainSets, calcWarmup, calcAmrapTargets, calcSupplementalSets, getSupplementalLabel,
  calcJokerSet, calcJokerIncrement, calcNextJokerWeight, shouldShowJokerButton,
  targetReps, JOKER_MIN_REPS, est1RMFromTm, isSupplementalType, jokerChainBaseWeight,
  applyMainCascadeToSupplemental, applySupplementalOverride, supplementalSourceSetNumber, roundToNearest5,
} from '../lib/calc'
import type { AmrapTarget, MainSet, FslSet, WarmupSet, JokerSet } from '../lib/calc'
import type { SupplementalTemplate } from '../types/domain'
import type { RestType } from '../store/workout-store'
import { advanceCycleIfComplete, getAmrapTargets, deloadTms } from '../lib/cycle'
import { detectAmrapPRs } from '../lib/pr'
import { getCurrentTm, setTm } from '../lib/training-max'
import { settings } from '../store/settings-store'
import { useConfirmation } from '../hooks/use-confirmation'
import { showToast } from '../store/toast-store'
import SetRow from '../components/workout/SetRow'
import AccessoryPicker from '../components/workout/AccessoryPicker'
import AccessoryLog from '../components/workout/AccessoryLog'
import RestTimer from '../components/workout/RestTimer'
import CycleCompleteModal from '../components/modals/CycleCompleteModal'
import type { CycleCompleteData } from '../components/modals/CycleCompleteModal'
import TmRecommendationModal from '../components/modals/TmRecommendationModal'
import { getSessionTmRecommendation } from '../lib/tm-recommendations'
import type { SessionTmRecommendation } from '../lib/tm-recommendations'
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
  const [tmRecommendation, setTmRecommendation] = createSignal<SessionTmRecommendation | null>(null)

  const [prevAmrapSets, setPrevAmrapSets] = createSignal<Array<{ weight: number; reps: number; label: string }>>([])
  const [tmWeight, setTmWeight] = createSignal(0)

  createEffect(on(() => workout.activeSession, (session) => {
    if (!session) return
    void loadData()
  }))

  // The single derivation of the rendered set list. Planned sets come from the
  // TM; everything the user actually did — an overridden source-set weight, a
  // supplemental override, jokers, extra added sets — is restored from
  // loggedSets, so the result is identical after a rebuild or a mid-session reload.
  const composeAllSets = (tm: number, week: 1 | 2 | 3 | 4, template: SupplementalTemplate) => {
    const loggedSets = workout.loggedSets
    const main = calcMainSets(tm, week, settings.barWeight)
    const warmup = calcWarmup(tm, main[0].weight, settings.barWeight)

    let fsl = calcSupplementalSets(template, main, tm, week, settings.barWeight)
    const sourceSetNumber = supplementalSourceSetNumber(template)
    const loggedSource = sourceSetNumber === null
      ? undefined
      : loggedSets.find(s => s.type === 'main' && s.setNumber === sourceSetNumber)
    if (loggedSource) fsl = applyMainCascadeToSupplemental(fsl, template, loggedSource.weight)
    fsl = applySupplementalOverride(fsl, loggedSets, template)
    const extraFsl: FslSet[] = template === 'none' ? [] : loggedSets
      .filter(s => s.type === template)
      .slice(fsl.length)
      .map((s, i) => ({ setNumber: fsl.length + i + 1, weight: s.weight, reps: s.reps, type: template }))

    const restoredJokers: JokerSet[] = loggedSets
      .filter(s => s.type === 'joker')
      .map((s, i) => ({ type: 'joker' as const, setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false as const }))

    return { all: [...warmup, ...main, ...restoredJokers, ...fsl, ...extraFsl], main }
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
        setPrevAmrapSets(await getAmrapTargets(db, session.liftId, session.week, session.cycleId))
        setAmrapTargets(amrapTargetsFor(amrapSet.weight))
      }
    }

    setExercises(await db.exercises.toArray())
  }

  const rebuildAllSets = () => {
    const session = workout.activeSession
    if (!session) return
    const { all } = composeAllSets(tmWeight(), session.week, supplementalTemplate())
    setAllSets(all)
  }

  // Targets for today's AMRAP at a given weight: beat the matching previous
  // AMRAP sets when history exists, otherwise the e1RM implied by the TM.
  const amrapTargetsFor = (weight: number): AmrapTarget[] => {
    const prev = prevAmrapSets()
    if (prev.length > 0) return calcAmrapTargets(prev, weight)
    const tm = tmWeight()
    if (tm <= 0) return []
    const est1RM = est1RMFromTm(tm)
    return [{ label: 'goal', reps: targetReps(est1RM, weight), est1RM: Math.round(est1RM) }]
  }

  const handleAmrapWeightChange = (weight: number) => setAmrapTargets(amrapTargetsFor(weight))

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
    // Re-derive the planned tail from the new logged state — this is what
    // cascades an overridden weight into the not-yet-logged sets after it.
    rebuildAllSets()

    let dbId: number
    try {
      dbId = await db.sets.add(setData)
      editSet(setIndex, { id: dbId })
    } catch (err) {
      deleteLastSet()
      setAllSets(prevAllSets)
      showToast(`Failed to save set: ${err instanceof Error ? err.message : 'unknown error'}`)
      return
    }

    if (setData.isAmrap && lift()) {
      try {
        const prs = await detectAmrapPRs(db, lift()!.id!, weight, reps, dbId)
        if (prs.repPr || prs.e1RmPr) {
          const msgs: string[] = []
          if (prs.repPr) msgs.push(`REP PR ${weight}×${reps}`)
          if (prs.e1RmPr) msgs.push(`e1RM ${Math.round(prs.newE1Rm)}lb`)
          showToast(`${lift()!.name.toUpperCase()} — ${msgs.join(' · ')}`, 5000)
        }
      } catch {
        // PR detection is best-effort; do not block the workout flow.
      }
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
    // Snapshot before editSet: `prev` is a store proxy, so it reflects the
    // edit once applied — reading it in the catch would "revert" to the new values.
    const { id, type, setNumber, reps: prevReps, weight: prevWeight } = prev
    editSet(setIndex, { reps, weight })
    if (!id) return
    try {
      await db.sets.update(id, { reps, weight })
    } catch (err) {
      editSet(setIndex, { reps: prevReps, weight: prevWeight })
      showToast(`Failed to save edit: ${err instanceof Error ? err.message : 'unknown error'}`)
      return
    }
    // Editing the supplemental source set's weight re-cascades the pending
    // supplemental sets; once one is logged, its override wins instead.
    const template = supplementalTemplate()
    if (type === 'main' && setNumber === supplementalSourceSetNumber(template)
      && !workout.loggedSets.some(s => isSupplementalType(s.type))) {
      setAllSets(sets => applyMainCascadeToSupplemental(sets, template, weight))
    }
  }

  const handleAddJoker = () => {
    const jokerReps = JOKER_MIN_REPS[workout.activeSession!.week] ?? 5
    const newJoker = calcJokerSet(jokerBaseWeight(), jokerCount() + 1, jokerReps, jokerIncrement())
    setAllSets(prev => {
      const insertAt = prev.findIndex(s => isSupplementalType(s.type))
      const next = [...prev]
      next.splice(insertAt === -1 ? next.length : insertAt, 0, newJoker)
      return next
    })
  }

  const handleAddSupplementalSet = () => {
    const fsl = fslSets()
    const last = fsl[fsl.length - 1]
    if (!last) return
    setAllSets(prev => [
      ...prev,
      { type: supplementalTemplate() as Exclude<SupplementalTemplate, 'none'>, setNumber: fsl.length + 1, weight: last.weight, reps: last.reps },
    ])
  }

  const proceedAfterSession = async () => {
    const { advanced, doublingCandidates, newTms } = await advanceCycleIfComplete(db)
    if (advanced) setCycleCompleteData({ newTms, doublingCandidates })
    else { clearSession(); navigate('/today') }
  }

  const finishSession = async () => {
    await proceedAfterSession()
  }

  const handleTmRecommendationAccept = async (newTm: number) => {
    const rec = tmRecommendation()
    if (rec) await setTm(db, rec.liftId, newTm)
    setTmRecommendation(null)
    await proceedAfterSession()
  }

  const handleTmRecommendationDismiss = async () => {
    setTmRecommendation(null)
    await proceedAfterSession()
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
    if (session.week !== 4) {
      const l = lift()
      if (l) {
        const rec = await getSessionTmRecommendation(db, sessionId, session.liftId, l.name)
        if (rec) { setTmRecommendation(rec); return }
      }
    }
    await proceedAfterSession()
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

  const handleDoubleIncrement = async (liftId: number, progressionIncrement: number) => {
    const currentTm = await getCurrentTm(db, liftId)
    const newTm = roundToNearest5(currentTm + progressionIncrement)
    await setTm(db, liftId, newTm)
    setCycleCompleteData(prev => {
      if (!prev) return null
      const liftName = prev.doublingCandidates.find(c => c.liftId === liftId)?.liftName
      return {
        ...prev,
        newTms: prev.newTms.map(t => t.liftName === liftName ? { ...t, weight: newTm } : t),
        doublingCandidates: prev.doublingCandidates.filter(c => c.liftId !== liftId),
      }
    })
  }

  const warmupSets = () => allSets().filter(s => s.type === 'warmup') as WarmupSet[]
  const mainSets = () => allSets().filter(s => s.type === 'main') as MainSet[]
  const jokerSetsRendered = () => allSets().filter(s => s.type === 'joker') as JokerSet[]
  const fslSets = () => allSets().filter(s => isSupplementalType(s.type)) as FslSet[]
  const warmupCount = () => warmupSets().length
  const mainCount = () => mainSets().length
  const jokerCount = () => jokerSetsRendered().length
  const setOffset = (section: 'main' | 'joker' | 'fsl') => {
    if (section === 'main') return warmupCount()
    if (section === 'joker') return warmupCount() + mainCount()
    return warmupCount() + mainCount() + jokerCount()
  }

  const showJokerButton = () => workout.activeSession ? shouldShowJokerButton({
    week: workout.activeSession.week,
    loggedSets: workout.loggedSets,
    warmupCount: warmupCount(),
    mainCount: mainCount(),
    jokerCount: jokerCount(),
  }) : false

  const amrapSet = () => mainSets().find(s => s.isAmrap)
  const loggedAmrapReps = () => workout.loggedSets.find(s => s.isAmrap)?.reps ?? 0
  const jokerIncrement = () => calcJokerIncrement(loggedAmrapReps(), JOKER_MIN_REPS[workout.activeSession?.week ?? 1] ?? 1)
  const jokerBaseWeight = () => jokerChainBaseWeight(workout.loggedSets, amrapSet()?.weight ?? 0)
  const nextJokerWeight = () => calcNextJokerWeight(jokerBaseWeight(), jokerIncrement())
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
                  onClick={handleAddSupplementalSet}
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
          onDoubleIncrement={handleDoubleIncrement}
        />

        <Show when={tmRecommendation()}>
          {rec => (
            <TmRecommendationModal
              liftName={rec().liftName}
              currentTm={rec().currentTm}
              suggestedTm={rec().suggestedTm}
              onAccept={handleTmRecommendationAccept}
              onDismiss={handleTmRecommendationDismiss}
            />
          )}
        </Show>

        <RestTimer />
      </div>
    </Show>
  )
}
