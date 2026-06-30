import { createSignal, createEffect, on, For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import type { Lift, Exercise } from '../types/domain'
import { workout, logSet, editSet, advanceSet, deleteLastSet, logCrossSet, editCrossSet, deleteLastCrossSetFor, startRest, clearSession, setNotes } from '../store/workout-store'
import {
  calcMainSets, calcWarmup, calcAmrapTarget, calcSupplementalSets, getSupplementalLabel,
  calcJokerSet, calcJokerIncrement, calcNextJokerWeight, shouldShowJokerButton,
  targetReps, JOKER_MIN_REPS, est1RMFromTm, isSupplementalType, jokerChainBaseWeight,
  applyMainCascadeToSupplemental, applySupplementalOverride, supplementalSourceSetNumber, roundToNearest5,
  calcCrossSets, getCrossLabel, effectiveSupplementalWeek,
} from '../lib/calc'
import type { AmrapTarget, MainSet, FslSet, WarmupSet, JokerSet, CrossSet } from '../lib/calc'
import type { SupplementalTemplate } from '../types/domain'
import type { RestType } from '../store/workout-store'
import { advanceCycleIfComplete, getRecentAmraps, deloadTms } from '../lib/cycle'
import { detectAmrapPRs } from '../lib/pr'
import { getCurrentTm, setTm } from '../lib/training-max'
import { settings } from '../store/settings-store'
import { useConfirmation } from '../hooks/use-confirmation'
import { showToast } from '../store/toast-store'
import SetRow from '../components/workout/SetRow'
import AccessoryPicker from '../components/workout/AccessoryPicker'
import AccessoryLog from '../components/workout/AccessoryLog'
import CrossBlockLog from '../components/workout/CrossBlockLog'
import { resolveLiftLoading, type PlateLoading } from '../lib/plate-loading'
import RestTimer from '../components/workout/RestTimer'
import CycleCompleteModal from '../components/modals/CycleCompleteModal'
import type { CycleCompleteData } from '../components/modals/CycleCompleteModal'
import TmRecommendationModal from '../components/modals/TmRecommendationModal'
import { getSessionTmRecommendation } from '../lib/tm-recommendations'
import type { SessionTmRecommendation } from '../lib/tm-recommendations'
import Rule from '../components/layout/Rule'
import { ASSISTANCE_SECTIONS, SECTION_LABEL, type AssistanceSlot } from '../lib/assistance'

interface LoadedCrossBlock {
  movementLiftId: number
  movementName: string
  movementLoading: PlateLoading | null
  weightMode: 'fsl' | 'percent'
  percent: number | null
  sets: number
  reps: number
  computed: CrossSet[]
}

function SetSection(props: {
  sets: () => (WarmupSet | MainSet | JokerSet | FslSet | CrossSet)[]
  offset: () => number
  forceAmrapFalse?: boolean
  amrapTargets?: () => AmrapTarget[]
  onWeightChange?: (weight: number) => void
  onLog: (idx: number, reps: number, weight: number) => void
  onEdit: (idx: number, reps: number, weight: number) => void
  onDelete: () => void
  loading?: PlateLoading | null
  // Reports the active row's element up to the page so Workout can scroll to it.
  onActiveRef?: (el: HTMLDivElement) => void
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
            loading={props.loading}
            activeRef={props.onActiveRef}
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
  const [crossSets, setCrossSets] = createSignal<CrossSet[]>([])
  const [crossBlocks, setCrossBlocks] = createSignal<LoadedCrossBlock[]>([])
  const [amrapTargets, setAmrapTargets] = createSignal<AmrapTarget[]>([])
  const [pickerSlot, setPickerSlot] = createSignal<AssistanceSlot | null>(null)
  // Extras = anything not in one of the three fixed slots. Catches 'extra',
  // missing slots, and any legacy/renamed slot value (e.g. a pre-rename
  // 'single_leg_core' left in an in-progress session) so nothing is orphaned.
  const extraAccessories = () => workout.activeAccessories.filter(
    a => !ASSISTANCE_SECTIONS.includes(a.slot as typeof ASSISTANCE_SECTIONS[number])
  )
  const [exercises, setExercises] = createSignal<Exercise[]>([])
  const [cycleCompleteData, setCycleCompleteData] = createSignal<CycleCompleteData | null>(null)
  const [tmRecommendation, setTmRecommendation] = createSignal<SessionTmRecommendation | null>(null)

  const [recentAmraps, setRecentAmraps] = createSignal<Array<{ weight: number; reps: number }>>([])
  const [tmWeight, setTmWeight] = createSignal(0)

  // The page owns scroll-to-active: there is one current set on the page (the
  // linear cursor), and the active SetRow reports its element here. Centering it
  // whenever it changes follows the cursor as you log. Independent sections
  // (cross, accessories) don't report, so they never pull focus.
  const [activeRowEl, setActiveRowEl] = createSignal<HTMLDivElement>()
  createEffect(on(activeRowEl, el => {
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }))

  // Plate-loading for the session's own lift (warmup/main/joker/supplemental).
  const ownLoading = (): PlateLoading | null => {
    const l = lift()
    return l ? resolveLiftLoading(l, settings.barWeight) : null
  }

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

    // Supplemental runs at the effective week (deload may remap or skip it).
    const eff = effectiveSupplementalWeek(week, settings.deloadSupplemental)
    const suppMain = eff === null ? [] : calcMainSets(tm, eff, settings.barWeight)
    let fsl = eff === null ? [] : calcSupplementalSets(template, suppMain, tm, eff, settings.barWeight)
    const sourceSetNumber = supplementalSourceSetNumber(template)
    const loggedSource = sourceSetNumber === null
      ? undefined
      : loggedSets.find(s => s.type === 'main' && s.setNumber === sourceSetNumber)
    // Cascade the logged top set into supplemental only when supplemental tracks
    // this week's main sets. On a remapped deload (eff !== week) the supplemental
    // weight is decoupled from the lighter deload top set, so skip the cascade.
    if (loggedSource && eff === week) fsl = applyMainCascadeToSupplemental(fsl, template, loggedSource.weight)
    fsl = applySupplementalOverride(fsl, loggedSets, template)
    const extraFsl: FslSet[] = template === 'none' ? [] : loggedSets
      .filter(s => s.type === template)
      .slice(fsl.length)
      .map((s, i) => ({ setNumber: fsl.length + i + 1, weight: s.weight, reps: s.reps, type: template }))

    const restoredJokers: JokerSet[] = loggedSets
      .filter(s => s.type === 'joker')
      .map((s, i) => ({ type: 'joker' as const, setNumber: i + 1, weight: s.weight, reps: s.reps, isAmrap: false as const }))

    // Cross blocks are independent of the linear list — each computed from its
    // movement lift's TM and restored from its own logged store. Like the
    // supplemental tail, a logged set's weight overrides the remaining planned
    // sets of the same block (matched by movement liftId), and extra logged
    // sets beyond the plan are restored.
    const cross: CrossSet[] = crossBlocks().flatMap(block => {
      const logged = workout.loggedCrossSets.filter(s => s.liftId === block.movementLiftId)
      let sets: CrossSet[] = block.computed
      if (logged.length > 0) {
        const override = logged[logged.length - 1].weight
        sets = sets.map((s, i) => i >= logged.length ? { ...s, weight: override } : s)
      }
      const extra: CrossSet[] = logged.slice(sets.length).map((s, i) => ({
        setNumber: sets.length + i + 1, weight: s.weight, reps: s.reps, type: 'cross' as const, liftId: block.movementLiftId,
      }))
      return [...sets, ...extra]
    })

    return { all: [...warmup, ...main, ...restoredJokers, ...fsl, ...extraFsl], cross, main }
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

    // Load cross-lift supplemental blocks for this day before composing — the
    // composition reads crossBlocks(). Cross work follows the same effective
    // week as self-supplemental (deload may remap or skip it).
    const crossWeek = effectiveSupplementalWeek(session.week, settings.deloadSupplemental)
    if (crossWeek === null) {
      setCrossBlocks([])
    } else {
      const blocks = (await db.liftSupplementals.where('liftId').equals(session.liftId).toArray())
        .sort((a, b) => a.order - b.order)
      const allLifts = await db.lifts.toArray()
      const loaded: LoadedCrossBlock[] = []
      for (const b of blocks) {
        const mLift = allLifts.find(l => l.id === b.movementLiftId)
        if (!mLift) continue
        const mTm = await getCurrentTm(db, b.movementLiftId)
        loaded.push({
          movementLiftId: b.movementLiftId,
          movementName: mLift.name,
          movementLoading: resolveLiftLoading(mLift, settings.barWeight),
          weightMode: b.weightMode,
          percent: b.percent,
          sets: b.sets,
          reps: b.reps,
          computed: calcCrossSets(b, mTm, crossWeek, settings.barWeight),
        })
      }
      setCrossBlocks(loaded)
    }

    const { all, cross, main } = composeAllSets(tm, session.week, template)
    setAllSets(all)
    setCrossSets(cross)

    if (session.week !== 4) {
      const amrapSet = main.find(s => s.isAmrap)
      if (amrapSet) {
        setRecentAmraps(await getRecentAmraps(db, session.liftId))
        setAmrapTargets(amrapTargetsFor(amrapSet.weight))
      }
    }

    setExercises(await db.exercises.toArray())
  }

  const rebuildAllSets = () => {
    const session = workout.activeSession
    if (!session) return
    const { all, cross } = composeAllSets(tmWeight(), session.week, supplementalTemplate())
    setAllSets(all)
    setCrossSets(cross)
  }

  // Targets for today's AMRAP at a given weight: beat the matching previous
  // AMRAP sets when history exists, otherwise the e1RM implied by the TM.
  const amrapTargetsFor = (weight: number): AmrapTarget[] => {
    const target = calcAmrapTarget(recentAmraps(), weight)
    if (target) return [target]
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
    // Editing a main or joker set re-derives the pending (un-logged) joker's
    // prescription — its chain base and increment both come from logged state.
    if (type === 'main' || type === 'joker') {
      const loggedJokerCount = workout.loggedSets.filter(s => s.type === 'joker').length
      const pendingJokerWeight = nextJokerWeight()
      setAllSets(sets => sets.map(s =>
        s.type === 'joker' && s.setNumber > loggedJokerCount ? { ...s, weight: pendingJokerWeight } : s,
      ))
    }
  }

  // Cross-lift supplemental logs independently of the linear set cursor: it
  // writes to its own store array and the same db.sets table (type 'cross'),
  // never touching currentSetIndex. Mirrors handleLog's optimistic add + rollback.
  const handleLogCross = async (
    section: { block: LoadedCrossBlock; sets: CrossSet[] },
    localIdx: number, reps: number, weight: number,
  ) => {
    const s = section.sets[localIdx]
    const setData = {
      sessionId: workout.activeSession!.id!,
      type: 'cross' as const,
      setNumber: s.setNumber,
      weight,
      reps,
      isAmrap: false,
      liftId: section.block.movementLiftId,
    }
    const prevCross = crossSets()
    logCrossSet(setData)
    rebuildAllSets()
    const idx = workout.loggedCrossSets.length - 1
    try {
      const dbId = await db.sets.add(setData)
      editCrossSet(idx, { id: dbId })
    } catch (err) {
      deleteLastCrossSetFor(section.block.movementLiftId)
      setCrossSets(prevCross)
      showToast(`Failed to save set: ${err instanceof Error ? err.message : 'unknown error'}`)
      return
    }
    const nextS = section.sets[localIdx + 1]
    startRest(reps < s.reps ? 'fail' : !nextS ? 'transition' : 'normal')
  }

  const handleEditCross = async (
    section: { block: LoadedCrossBlock }, localIdx: number, reps: number, weight: number,
  ) => {
    const liftId = section.block.movementLiftId
    const matches: number[] = []
    workout.loggedCrossSets.forEach((s, i) => { if (s.liftId === liftId) matches.push(i) })
    const absIdx = matches[localIdx]
    if (absIdx == null) return
    const { id, reps: prevReps, weight: prevWeight } = workout.loggedCrossSets[absIdx]
    editCrossSet(absIdx, { reps, weight })
    rebuildAllSets()
    if (!id) return
    try {
      await db.sets.update(id, { reps, weight })
    } catch (err) {
      editCrossSet(absIdx, { reps: prevReps, weight: prevWeight })
      rebuildAllSets()
      showToast(`Failed to save edit: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  const handleDeleteCross = async (section: { block: LoadedCrossBlock }) => {
    const liftId = section.block.movementLiftId
    const logged = workout.loggedCrossSets.filter(s => s.liftId === liftId)
    const last = logged[logged.length - 1]
    if (!last) return
    if (last.id) await db.sets.delete(last.id)
    deleteLastCrossSetFor(liftId)
    rebuildAllSets()
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
  // Each cross block rendered as its own section with its own cursor, keyed by
  // its (unique) movement liftId. Independent of the linear currentSetIndex —
  // a block's next set is just how many of its sets are already logged.
  const crossSections = () => crossBlocks().map(block => {
    const sets = crossSets().filter(s => s.liftId === block.movementLiftId)
    const logged = workout.loggedCrossSets.filter(s => s.liftId === block.movementLiftId)
    return { block, sets, logged, cursor: logged.length }
  })
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
    getSupplementalLabel(
      supplementalTemplate(),
      fslSets(),
      effectiveSupplementalWeek(workout.activeSession?.week ?? 1, settings.deloadSupplemental) ?? 1,
    )

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
              loading={ownLoading()}
              forceAmrapFalse
              onLog={handleLog}
              onEdit={handleEdit}
              onDelete={handleDeleteSet}
              onActiveRef={el => setActiveRowEl(el)}
            />
          </div>

          <div class="mb-6 md:mb-0">
            <div class="text-muted uppercase text-xs tracking-widest mb-2">MAIN</div>
            <SetSection
              sets={mainSets}
              offset={() => setOffset('main')}
              loading={ownLoading()}
              amrapTargets={amrapTargets}
              onWeightChange={handleAmrapWeightChange}
              onLog={handleLog}
              onEdit={handleEdit}
              onDelete={handleDeleteSet}
              onActiveRef={el => setActiveRowEl(el)}
            />
            <Show when={jokerSetsRendered().length > 0}>
              <div class="mt-4">
                <div class="text-muted uppercase text-xs tracking-widest mb-2">JOKER SETS</div>
                <SetSection
                  sets={jokerSetsRendered}
                  offset={() => setOffset('joker')}
                  loading={ownLoading()}
                  onLog={handleLog}
                  onEdit={handleEdit}
                  onDelete={handleDeleteSet}
                  onActiveRef={el => setActiveRowEl(el)}
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
                loading={ownLoading()}
                forceAmrapFalse
                onLog={handleLog}
                onEdit={handleEdit}
                onDelete={handleDeleteSet}
                onActiveRef={el => setActiveRowEl(el)}
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

        <Show when={crossSections().length > 0}>
          <div class="mb-6">
            <Rule label="CROSS-LIFT SUPPLEMENTAL" class="text-muted mb-4" />
            <div class="md:grid md:grid-cols-3 md:gap-8 md:items-start">
              <For each={crossSections()}>
                {section => (
                  <CrossBlockLog
                    label={getCrossLabel(section.block, section.block.movementName)}
                    loading={section.block.movementLoading}
                    sets={section.sets}
                    cursor={section.cursor}
                    logged={section.logged}
                    onLog={(li, reps, weight) => void handleLogCross(section, li, reps, weight)}
                    onEdit={(li, reps, weight) => void handleEditCross(section, li, reps, weight)}
                    onDelete={() => void handleDeleteCross(section)}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="mb-6">
          <Rule label="ASSISTANCE" class="text-muted mb-2" />
          <For each={ASSISTANCE_SECTIONS}>
            {section => {
              const acc = () => workout.activeAccessories.find(a => a.slot === section)
              return (
                <div class="mb-3">
                  <div class="text-muted text-xs uppercase tracking-widest mb-1">{SECTION_LABEL[section]}</div>
                  <Show
                    when={acc()}
                    fallback={
                      <button
                        onClick={() => setPickerSlot(section)}
                        class="w-full border border-border py-2 text-muted text-xs tracking-widest hover:border-accent hover:text-accent"
                      >
                        + CHOOSE {SECTION_LABEL[section]}
                      </button>
                    }
                  >
                    <AccessoryLog accessory={acc()!} exercise={exercises().find(e => e.id === acc()!.exerciseId)} />
                    <button
                      onClick={() => setPickerSlot(section)}
                      class="text-faint text-xs font-mono hover:text-accent tracking-widest pl-2"
                    >
                      swap
                    </button>
                  </Show>
                </div>
              )
            }}
          </For>

          <Show when={extraAccessories().length > 0}>
            <div class="mb-2">
              <div class="text-faint text-xs uppercase tracking-widest mb-1">EXTRA</div>
              <For each={extraAccessories()}>
                {acc => <AccessoryLog accessory={acc} exercise={exercises().find(e => e.id === acc.exerciseId)} />}
              </For>
            </div>
          </Show>
          <button
            onClick={() => setPickerSlot('extra')}
            class="w-full border border-border py-2 text-muted text-xs tracking-widest hover:border-accent hover:text-accent"
          >
            + ADD EXTRA ASSISTANCE
          </button>
        </div>

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

        <Show when={pickerSlot() !== null && lift()}>
          <AccessoryPicker
            slot={pickerSlot()!}
            liftId={lift()!.id!}
            onClose={() => { setPickerSlot(null); void loadData() }}
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
