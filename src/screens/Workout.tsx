import { createSignal, createEffect, on, For, Index, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { db } from '../db/index'
import type { Lift, Exercise, Session } from '../types/domain'
import { workout, logSet, editSet, advanceSet, deleteLastSet, logCrossSet, editCrossSet, deleteLastCrossSetFor, startRest, clearSession, setNotes } from '../store/workout-store'
import {
  getSupplementalLabel, calcJokerSet, calcJokerIncrement, calcNextJokerWeight,
  shouldShowJokerButton, JOKER_MIN_REPS, isSupplementalType, jokerChainBaseWeight,
  applyMainCascadeToSupplemental, supplementalSourceSetNumber,
  calcCrossSets, getCrossLabel, effectiveSupplementalWeek,
} from '../lib/calc'
import { composeAllSets, amrapTargetsFor } from '../lib/workout-compose'
import type { AmrapTarget, MainSet, FslSet, WarmupSet, JokerSet, CrossSet } from '../lib/calc'
import type { SupplementalTemplate } from '../types/domain'
import type { RestType } from '../store/workout-store'
import { advanceCycleIfComplete, getRecentWorkingSets, deloadTms, applyCycleDoubling } from '../lib/cycle'
import { discardPendingSession } from '../lib/session'
import { detectAmrapPRs } from '../lib/pr'
import { getCurrentTm, setTm } from '../lib/training-max'
import { settings } from '../store/settings-store'
import { useConfirmation } from '../hooks/use-confirmation'
import { showToast } from '../store/toast-store'
import { recordSaveFailure } from '../store/save-failure-store'
import SaveFailureBanner from '../components/workout/SaveFailureBanner'
import CollapsibleSection from '../components/workout/CollapsibleSection'
import SetRow from '../components/workout/SetRow'
import AccessoryPicker from '../components/workout/AccessoryPicker'
import AccessoryLog from '../components/workout/AccessoryLog'
import CrossBlockLog from '../components/workout/CrossBlockLog'
import { resolveLiftLoading, type PlateLoading } from '../lib/plate-loading'
import RestTimer from '../components/workout/RestTimer'
import NotesField from '../components/forms/NotesField'
import CycleCompleteModal from '../components/modals/CycleCompleteModal'
import type { CycleCompleteData } from '../components/modals/CycleCompleteModal'
import TmRecommendationModal from '../components/modals/TmRecommendationModal'
import { getSessionTmRecommendation } from '../lib/tm-recommendations'
import type { SessionTmRecommendation } from '../lib/tm-recommendations'
import Rule from '../components/layout/Rule'
import SectionLabel from '../components/layout/SectionLabel'
import ExerciseHistoryModal from '../components/modals/ExerciseHistoryModal'
import LiftHistoryModal from '../components/modals/LiftHistoryModal'
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
  // Index, not For: these lists are keyed by position (a set's slot in the
  // linear flow), and a rebuild with fresh object refs must update rows in place
  // rather than remount them. For remounts every row on a fresh-ref rebuild,
  // which re-fires the active row's activeRef and yanks the page scroll back to
  // the linear cursor — even when the rebuild was triggered by unrelated
  // (cross-lift) logging. Index reuses the row per position, so only a genuine
  // isActive/isCompleted transition mounts/unmounts the active-set form.
  return (
    <Index each={props.sets()}>
      {(s, i) => {
        const globalIdx = () => props.offset() + i
        return (
          <SetRow
            set={{ ...s(), isAmrap: props.forceAmrapFalse ? false : !!(s() as MainSet).isAmrap }}
            isActive={workout.currentSetIndex === globalIdx()}
            isCompleted={globalIdx() < workout.currentSetIndex}
            loggedReps={workout.loggedSets[globalIdx()]?.reps}
            loggedWeight={workout.loggedSets[globalIdx()]?.weight}
            amrapTargets={(s() as MainSet).isAmrap && props.amrapTargets ? props.amrapTargets() : undefined}
            onLog={(reps, weight) => props.onLog(globalIdx(), reps, weight)}
            onEdit={(reps, weight) => props.onEdit(globalIdx(), reps, weight)}
            onWeightChange={(s() as MainSet).isAmrap ? props.onWeightChange : undefined}
            onDelete={globalIdx() === workout.currentSetIndex - 1 ? props.onDelete : undefined}
            loading={props.loading}
            activeRef={props.onActiveRef}
          />
        )
      }}
    </Index>
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
  const [historyExerciseId, setHistoryExerciseId] = createSignal<number | null>(null)
  const [liftHistoryId, setLiftHistoryId] = createSignal<number | null>(null)
  const liftHistoryName = () => {
    const id = liftHistoryId()
    if (id == null) return ''
    if (id === workout.activeSession?.liftId) return lift()?.name ?? ''
    const block = crossBlocks().find(b => b.movementLiftId === id)
    return block?.movementName ?? ''
  }
  const historyExercise = () => {
    const id = historyExerciseId()
    if (id == null) return null
    const acc = workout.activeAccessories.find(a => a.exerciseId === id)
    return acc ? { id, name: acc.exerciseName } : null
  }
  // Extras = anything not in one of the three fixed slots. Catches 'extra',
  // missing slots, and any legacy/renamed slot value (e.g. a pre-rename
  // 'single_leg_core' left in an in-progress session) so nothing is orphaned.
  const extraAccessories = () => workout.activeAccessories.filter(
    a => !ASSISTANCE_SECTIONS.includes(a.slot as typeof ASSISTANCE_SECTIONS[number])
  )
  const [exercises, setExercises] = createSignal<Exercise[]>([])
  const [cycleCompleteData, setCycleCompleteData] = createSignal<CycleCompleteData | null>(null)
  const [tmRecommendation, setTmRecommendation] = createSignal<SessionTmRecommendation | null>(null)

  const [recentWorkingSets, setRecentWorkingSets] = createSignal<Array<{ weight: number; reps: number }>>([])
  const [tmWeight, setTmWeight] = createSignal(0)
  // In-flight guard for the session-ending handlers. A double-tap on COMPLETE
  // would run the accessory bulkAdds twice; SKIP/EXIT racing COMPLETE could
  // discard a session mid-finalize.
  const [finishing, setFinishing] = createSignal(false)

  // The page owns scroll-to-active: there is one current set on the page (the
  // linear cursor), and the active SetRow reports its element here. Centering it
  // whenever it changes follows the cursor as you log. Independent sections
  // (cross, accessories) don't report, so they never pull focus.
  const [activeRowEl, setActiveRowEl] = createSignal<HTMLDivElement>()
  createEffect(on(activeRowEl, el => {
    // Honor reduce-motion: the CSS scroll-behavior override can't reach an
    // explicit JS 'smooth', so gate the scroll-to-active-set here too.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
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

  // Thin wrapper over the pure derivation in lib/workout-compose: read the
  // reactive inputs here, hand plain values across.
  const composeSets = (tm: number, week: 1 | 2 | 3 | 4, template: SupplementalTemplate) =>
    composeAllSets({
      tm, week, template,
      barWeight: settings.barWeight,
      deloadSupplemental: settings.deloadSupplemental,
      loggedSets: workout.loggedSets,
      crossBlocks: crossBlocks(),
      loggedCrossSets: workout.loggedCrossSets,
    })

  const loadData = async () => {
    const session = workout.activeSession
    if (!session) return
    // Guard the dangling-row case: an exit that deleted the session but crashed
    // before clearSession ran leaves the store pointing at a gone id. Logging
    // into it would insert child rows with no parent (no FK), silently orphaned.
    // A completed-but-present row is left alone — the EXIT/COMPLETE handlers
    // already guard it, and the post-complete modal flow legitimately still
    // holds it. Fetched in parallel with the lift so the check adds no latency
    // before setLift (the action bar is live before loadData finishes).
    const [sessionRow, l] = await Promise.all([
      session.id ? db.sessions.get(session.id) : Promise.resolve(undefined),
      db.lifts.get(session.liftId),
    ])
    if (session.id && !sessionRow) {
      clearSession()
      navigate('/today')
      return
    }
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

    const { all, cross, main } = composeSets(tm, session.week, template)
    setAllSets(all)
    setCrossSets(cross)

    if (session.week !== 4) {
      const amrapSet = main.find(s => s.isAmrap)
      if (amrapSet) {
        setRecentWorkingSets(await getRecentWorkingSets(db, session.liftId, settings.highRepDiscount))
        setAmrapTargets(targetsFor(amrapSet.weight))
      }
    }

    setExercises(await db.exercises.toArray())
  }

  // One rebuild for every mutation, cross-lift included. The linear <Index>
  // lists update in place on a fresh-ref rebuild (no remount), so cross-only
  // logging no longer needs a separate narrower rebuild to avoid the scroll yank.
  const rebuildAllSets = () => {
    const session = workout.activeSession
    if (!session) return
    const { all, cross } = composeSets(tmWeight(), session.week, supplementalTemplate())
    setAllSets(all)
    setCrossSets(cross)
  }

  const targetsFor = (weight: number): AmrapTarget[] =>
    amrapTargetsFor(weight, recentWorkingSets(), tmWeight(), settings.highRepDiscount)

  const handleAmrapWeightChange = (weight: number) => setAmrapTargets(targetsFor(weight))

  // Human-readable set type for the failure banner: 'fsl+bbb' means nothing to
  // a lifter, "supplemental" does.
  const setLabel = (type: string) =>
    type === 'main' ? 'Main'
      : type === 'warmup' ? 'Warmup'
      : type === 'joker' ? 'Joker'
      : isSupplementalType(type) ? 'Supplemental'
      : type

  // Both channels for one failure: the toast catches the user who is looking,
  // the banner (and the persisted session gap behind it) catches the one who
  // isn't. The old code had only the first, which vanished after 2.5s.
  const reportSaveFailure = (
    err: unknown,
    noun: 'set' | 'edit',
    describe: string,
    retry: () => Promise<void>,
  ) => {
    const message = err instanceof Error ? err.message : 'unknown error'
    showToast(`Failed to save ${noun}: ${message}`)
    const sessionId = workout.activeSession?.id
    if (sessionId == null) return
    recordSaveFailure({ sessionId, describe, message, retry })
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
      // Toast for the glance, banner for the record. Retry replays the same
      // handler, so a success walks the full path (advance, PR check, rest)
      // exactly as if the first attempt had worked.
      reportSaveFailure(err, 'set', `${setLabel(s.type)} set ${s.setNumber} · ${weight}lb × ${reps}`,
        () => handleLog(setIndex, reps, weight))
      return
    }

    if (setData.isAmrap && lift()) {
      try {
        const prs = await detectAmrapPRs(db, lift()!.id!, weight, reps, dbId, settings.highRepDiscount)
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
      reportSaveFailure(err, 'edit', `Edit to ${setLabel(type)} set ${setNumber} · ${weight}lb × ${reps}`,
        () => handleEdit(setIndex, reps, weight))
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
      reportSaveFailure(err, 'set', `${section.block.movementName} set ${s.setNumber} · ${weight}lb × ${reps}`,
        () => handleLogCross(section, localIdx, reps, weight))
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
      reportSaveFailure(err, 'edit', `Edit to ${section.block.movementName} set ${localIdx + 1} · ${weight}lb × ${reps}`,
        () => handleEditCross(section, localIdx, reps, weight))
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
    const { advanced, doublingCandidates, newTms } = await advanceCycleIfComplete(db, settings.highRepDiscount)
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

  // Mutual exclusion for the three session-ending actions. Holding the guard
  // across the whole handler (confirm included) is what stops EXIT/SKIP from
  // racing a COMPLETE that's mid-finalize — each disables the others' buttons
  // for its duration.
  const runFinishing = async (fn: () => Promise<void>) => {
    if (finishing()) return
    setFinishing(true)
    try {
      await fn()
    } finally {
      setFinishing(false)
    }
  }

  const handleComplete = () => runFinishing(async () => {
    const session = workout.activeSession
    if (!session?.id) return
    await completeSession(session, session.id)
  })

  const completeSession = async (session: Session, sessionId: number) => {
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
    // Independent of toSave — a note with no logged sets is still meaningful
    // ("wanted to try this, ran out of time").
    const notesToSave = workout.activeAccessories
      .filter(acc => acc.notes?.trim())
      .map(acc => ({ sessionId, exerciseId: acc.exerciseId, notes: acc.notes!.trim() }))
    await db.transaction(async () => {
      await db.sessions.update(sessionId, { status: 'completed', notes: workout.notes, date: new Date() })
      if (toSave.length > 0) await db.accessorySets.bulkAdd(toSave)
      if (notesToSave.length > 0) await db.accessoryNotes.bulkAdd(notesToSave)
    })
    if (session.week !== 4) {
      const l = lift()
      if (l) {
        const rec = await getSessionTmRecommendation(db, sessionId, session.liftId, l.name, settings.highRepDiscount)
        if (rec) { setTmRecommendation(rec); return }
      }
    }
    await proceedAfterSession()
  }

  const handleExit = () => runFinishing(async () => {
    if (!await confirm('Discard this attempt?', { destructive: true, confirmLabel: 'EXIT' })) return
    const session = workout.activeSession
    // Delete the pending session row too, not just its child rows — a leftover
    // empty pending session holds the week open (weekComplete) and shows the
    // lift as not done. discardPendingSession no-ops on a completed session.
    if (session?.id) await discardPendingSession(db, session.id)
    clearSession()
    navigate('/today')
  })

  const handleSkip = () => runFinishing(async () => {
    if (!await confirm('Skip this lift?', { destructive: true, confirmLabel: 'SKIP' })) return
    const session = workout.activeSession
    if (!session?.id) return
    await db.sessions.update(session.id, { status: 'skipped' })
    await finishSession()
  })

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
    setCycleCompleteData(await applyCycleDoubling(db, cycleCompleteData(), liftId, progressionIncrement))
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

  // A linear section is finished when the cursor has moved past its last set.
  // Only a finished section may collapse — the active row is then guaranteed to
  // be somewhere else on the page, so folding one can never hide the row the
  // scroll-to-active effect is tracking.
  const sectionComplete = (count: number, offset: number) =>
    count > 0 && workout.currentSetIndex >= offset + count

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
        <button
          onClick={() => setLiftHistoryId(workout.activeSession!.liftId)}
          class="w-full text-left cursor-pointer mb-6"
          aria-label={`View history for ${liftName()}`}
        >
          <Rule
            label={`${liftName()} . WEEK ${workout.activeSession!.week}${workout.activeSession!.week === 4 ? ' . DELOAD' : ''}`}
            class={`${workout.activeSession!.week === 4 ? 'text-info hover:text-info/70' : 'text-muted hover:text-text-dim'}`}
          />
        </button>

        <SaveFailureBanner />

        <div class="md:grid md:grid-cols-3 md:gap-8 md:items-start mb-6">
          <CollapsibleSection
            label="WARM UP"
            complete={sectionComplete(warmupCount(), 0)}
            summary={`${warmupCount()} sets`}
            class="mb-6 md:mb-0"
          >
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
          </CollapsibleSection>

          <div class="mb-6 md:mb-0">
            <CollapsibleSection
              label="MAIN"
              complete={sectionComplete(mainCount(), setOffset('main'))}
              summary={`${mainCount()} sets`}
            >
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
            </CollapsibleSection>
            <Show when={jokerSetsRendered().length > 0}>
              <CollapsibleSection
                label="JOKER SETS"
                complete={sectionComplete(jokerCount(), setOffset('joker'))}
                summary={`${jokerCount()} sets`}
                class="mt-4"
              >
                <SetSection
                  sets={jokerSetsRendered}
                  offset={() => setOffset('joker')}
                  loading={ownLoading()}
                  onLog={handleLog}
                  onEdit={handleEdit}
                  onDelete={handleDeleteSet}
                  onActiveRef={el => setActiveRowEl(el)}
                />
              </CollapsibleSection>
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
              {/* The rows fold, "+ ADD SET" stays: adding another supplemental
                  set is the one thing still worth doing to a finished block. */}
              <CollapsibleSection
                label={supplementalLabel()!}
                complete={sectionComplete(fslSets().length, setOffset('fsl'))}
                summary={`${fslSets().length} sets`}
              >
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
              </CollapsibleSection>
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
                    onLabelClick={() => setLiftHistoryId(section.block.movementLiftId)}
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
                  <SectionLabel class="mb-1">{SECTION_LABEL[section]}</SectionLabel>
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
                    <AccessoryLog accessory={acc()!} exercise={exercises().find(e => e.id === acc()!.exerciseId)} onExerciseClick={id => setHistoryExerciseId(id)} />
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
              <SectionLabel tone="text-faint" class="mb-1">EXTRA</SectionLabel>
              <For each={extraAccessories()}>
                {acc => <AccessoryLog accessory={acc} exercise={exercises().find(e => e.id === acc.exerciseId)} onExerciseClick={id => setHistoryExerciseId(id)} />}
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
          <NotesField
            value={workout.notes}
            onInput={setNotes}
            rows={3}
            placeholder="session notes..."
            textareaClass="w-full bg-surface border border-border text-text font-mono px-3 py-3 text-sm focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div class="flex gap-3">
          <button
            onClick={() => void handleComplete()}
            disabled={finishing()}
            class="flex-1 border border-accent text-accent py-4 font-mono text-sm tracking-widest disabled:opacity-40"
          >
            COMPLETE SESSION
          </button>
          <button
            onClick={() => void handleSkip()}
            disabled={finishing()}
            class="border border-danger text-danger px-5 py-4 font-mono text-sm disabled:opacity-40"
          >
            SKIP LIFT
          </button>
        </div>

        <div class="flex justify-end mt-3">
          <button
            onClick={() => void handleExit()}
            disabled={finishing()}
            class="text-muted hover:text-text-dim font-mono text-xs tracking-widest disabled:opacity-40"
          >
            EXIT WITHOUT SAVING
          </button>
        </div>

        <Show when={pickerSlot() !== null && lift()}>
          <AccessoryPicker
            slot={pickerSlot()!}
            liftId={lift()!.id!}
            onClose={() => setPickerSlot(null)}
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

        <Show when={liftHistoryId() != null}>
          <LiftHistoryModal
            liftName={liftHistoryName()}
            liftId={liftHistoryId()!}
            onClose={() => setLiftHistoryId(null)}
          />
        </Show>

        <Show when={historyExercise()}>
          {ex => (
            <ExerciseHistoryModal
              exerciseName={ex().name}
              exerciseId={ex().id}
              onClose={() => setHistoryExerciseId(null)}
            />
          )}
        </Show>
      </div>
    </Show>
  )
}
