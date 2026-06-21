import { createSignal, onMount, For, Show } from 'solid-js'
import { db } from '../db/index'
import type { Lift, Exercise, LiftAccessory, SupplementalTemplate } from '../types/domain'
import { settings, updateSettings, loadSettings, THEMES, DEFAULT_PLATES } from '../store/settings-store'
import { exportJson, importJson, exportCsv } from '../lib/export-import'
import { deloadTms, advanceCycleIfComplete, computeClosedThroughWeek } from '../lib/cycle'
import { buildCleanupPlan } from '../lib/cleanup'
import { createExercise, renameExercise, archiveExercise, unarchiveExercise, addExerciseToLift, removeExerciseFromLift } from '../lib/exercise'
import { updateLift, archiveLift, unarchiveLift, moveLift } from '../lib/lift'
import { setTm, getCurrentTm } from '../lib/training-max'
import { useConfirmation } from '../hooks/use-confirmation'
import { showToast } from '../store/toast-store'
import { calcMainSets, formatDuration, DEFAULT_ACCESSORY_INCREMENT_LB } from '../lib/calc'
import CycleCompleteModal from '../components/modals/CycleCompleteModal'
import type { CycleCompleteData } from '../components/modals/CycleCompleteModal'
import LiftSetupModal, { type DraftLiftFields } from '../components/modals/LiftSetupModal'
import Rule from '../components/layout/Rule'
import Stepper from '../components/forms/Stepper'
import ExerciseEditor from '../components/forms/ExerciseEditor'

export default function Settings() {
  const { confirm } = useConfirmation()

  const [lifts, setLifts] = createSignal<Lift[]>([])
  const [tms, setTms] = createSignal<Record<number, number>>({})
  const [editingTm, setEditingTm] = createSignal<number | null>(null)
  const [tmInput, setTmInput] = createSignal(0)
  const [exercises, setExercises] = createSignal<Exercise[]>([])
  const [liftAccessories, setLiftAccessories] = createSignal<LiftAccessory[]>([])
  const [newExName, setNewExName] = createSignal('')
  const [newExType, setNewExType] = createSignal<'reps' | 'timed' | 'distance'>('reps')
  const [showAddEx, setShowAddEx] = createSignal(false)
  const [editingEx, setEditingEx] = createSignal<number | null>(null)
  const [editExName, setEditExName] = createSignal('')
  const [editExIncrement, setEditExIncrement] = createSignal(5)
  const [accessoryIncrements, setAccessoryIncrements] = createSignal<Record<number, { tmId: number; incrementLb: number }>>({})
  const [currentCycleWeek, setCurrentCycleWeek] = createSignal<1 | 2 | 3 | 4 | null>(null)
  const [currentCycleId, setCurrentCycleId] = createSignal<number | null>(null)
  const [cycleCompleteData, setCycleCompleteData] = createSignal<CycleCompleteData | null>(null)

  const [addToLift, setAddToLift] = createSignal<number | null>(null)
  const [addToLiftExId, setAddToLiftExId] = createSignal<number | null>(null)
  const [importError, setImportError] = createSignal<string | null>(null)

  const activeLifts = () => lifts().filter(l => !l.archived)
  const archivedLifts = () => lifts().filter(l => l.archived)

  const [setupLiftId, setSetupLiftId] = createSignal<number | null>(null)
  const [draftLift, setDraftLift] = createSignal<DraftLiftFields | null>(null)
  const [showAddLift, setShowAddLift] = createSignal(false)
  const [newLiftName, setNewLiftName] = createSignal('')
  const [newLiftIncrement, setNewLiftIncrement] = createSignal(5)
  const [newLiftBase, setNewLiftBase] = createSignal(95)
  const [newLiftType, setNewLiftType] = createSignal<'upper' | 'lower'>('upper')
  const [editingLift, setEditingLift] = createSignal<number | null>(null)
  const [editLiftName, setEditLiftName] = createSignal('')
  const [editLiftIncrement, setEditLiftIncrement] = createSignal(5)
  // eslint-disable-next-line no-unassigned-vars -- Solid `ref={fileInputRef}` reassigns at runtime
  let fileInputRef!: HTMLInputElement

  onMount(load)

  async function load() {
    const allLifts = await db.lifts.orderBy('order').toArray()
    setLifts(allLifts)
    const tmMap: Record<number, number> = {}
    await Promise.all(allLifts.map(async l => {
      const weight = await getCurrentTm(db, l.id!)
      if (weight > 0) tmMap[l.id!] = weight
    }))
    setTms(tmMap)
    setExercises(await db.exercises.toArray())
    setLiftAccessories(await db.liftAccessories.toArray())
    const allAtms = await db.accessoryTrainingMaxes.toArray()
    const increments: Record<number, { tmId: number; incrementLb: number }> = {}
    for (const atm of [...allAtms].sort((a, b) => b.setAt.getTime() - a.setAt.getTime())) {
      if (!(atm.exerciseId in increments)) {
        increments[atm.exerciseId] = { tmId: atm.id!, incrementLb: atm.incrementLb }
      }
    }
    setAccessoryIncrements(increments)

    const latestCycle = await db.cycles.orderBy('number').last()
    if (latestCycle?.id) {
      // Mirror getNextSessionAdvancingIfDone: derive the current week from the
      // closedThroughWeek high-water mark, not a from-scratch session scan. A raw
      // scan reopens finished weeks whenever the lift roster changes mid-cycle
      // (issue #52) and ignores skip/reopen actions that move the mark.
      const cycleSessions = await db.sessions.where('cycleId').equals(latestCycle.id).toArray()
      const activeIds = allLifts.filter(l => !l.archived).map(l => l.id!)
      const closed = computeClosedThroughWeek(cycleSessions, activeIds, latestCycle.closedThroughWeek ?? 0)
      setCurrentCycleWeek(Math.min(4, closed + 1) as 1 | 2 | 3 | 4)
      setCurrentCycleId(latestCycle.id)
    }
  }

  const handleSaveTm = async (liftId: number) => {
    if (tmInput() <= 0) return
    await setTm(db, liftId, tmInput())
    setEditingTm(null)
    setTmInput(0)
    await load()
  }

  const resetAddForm = () => {
    setNewLiftName('')
    setNewLiftIncrement(5)
    setNewLiftBase(95)
    setNewLiftType('upper')
  }

  // Defer creation: open setup against a draft and persist the lift (with its
  // training max) only on commit. Cancel returns to the add form, fields intact.
  const handleAddLift = () => {
    if (!newLiftName().trim()) return
    setDraftLift({
      name: newLiftName().trim(),
      progressionIncrement: newLiftIncrement(),
      baseWeight: newLiftBase(),
      liftType: newLiftType(),
    })
    setShowAddLift(false)
  }

  const handleSaveLiftEdit = async (id: number) => {
    const name = editLiftName().trim()
    if (!name) return
    await updateLift(db, id, { name, progressionIncrement: editLiftIncrement() })
    setEditingLift(null)
    await load()
  }

  const handleArchiveLift = async (id: number) => {
    if (activeLifts().length <= 1) {
      showToast('Keep at least one active lift')
      return
    }
    if (!await confirm('Archive this lift? History is kept; it leaves the active roster next.', { destructive: true, confirmLabel: 'ARCHIVE' })) return
    await archiveLift(db, id)
    await load()
  }

  const handleUnarchiveLift = async (id: number) => {
    await unarchiveLift(db, id)
    await load()
  }

  const handleMoveLift = async (id: number, direction: 'up' | 'down') => {
    await moveLift(db, id, direction)
    await load()
  }

  const handleAddExercise = async () => {
    if (!newExName().trim()) return
    await createExercise(db, newExName().trim(), newExType())
    setNewExName('')
    setShowAddEx(false)
    await load()
  }

  const handleRenameExercise = async (id: number) => {
    if (!editExName().trim()) return
    await renameExercise(db, id, editExName().trim())
    const tmEntry = accessoryIncrements()[id]
    if (tmEntry && editExIncrement() !== tmEntry.incrementLb) {
      await db.accessoryTrainingMaxes.update(tmEntry.tmId, { incrementLb: editExIncrement() })
    }
    setEditingEx(null)
    setEditExName('')
    await load()
  }

  const handleArchiveExercise = async (id: number) => {
    if (!await confirm('Archive this exercise?', { destructive: true, confirmLabel: 'ARCHIVE' })) return
    await archiveExercise(db, id)
    await load()
  }

  const handleUnarchiveExercise = async (id: number) => {
    await unarchiveExercise(db, id)
    await load()
  }

  const handleAddToLift = async (liftId: number, exerciseId: number) => {
    await addExerciseToLift(db, liftId, exerciseId)
    setAddToLift(null)
    setAddToLiftExId(null)
    await load()
  }

  const handleRemoveFromLift = async (laId: number) => {
    await removeExerciseFromLift(db, laId)
    await load()
  }

  const handleCleanupAccessoryData = async () => {
    if (!await confirm(
      'Delete orphan accessory rows and archive unused exercises? This cannot be undone.',
      { destructive: true, confirmLabel: 'CLEANUP' }
    )) return

    const [allExercises, allLas, allAtms, allSets, allSessions] = await Promise.all([
      db.exercises.toArray(),
      db.liftAccessories.toArray(),
      db.accessoryTrainingMaxes.toArray(),
      db.accessorySets.toArray(),
      db.sessions.toArray(),
    ])

    const plan = buildCleanupPlan(
      allExercises.map(ex => ({ id: ex.id!, archived: ex.archived })),
      allLas.map(la => ({ id: la.id!, exerciseId: la.exerciseId })),
      allAtms.map(atm => ({ id: atm.id!, exerciseId: atm.exerciseId })),
      allSets.map(s => ({ id: s.id!, sessionId: s.sessionId, exerciseId: s.exerciseId })),
      allSessions.map(s => ({ id: s.id! })),
    )

    await db.transaction(async () => {
      if (plan.orphanLaIds.length > 0) await db.liftAccessories.where('id').anyOf(plan.orphanLaIds).delete()
      if (plan.orphanAtmIds.length > 0) await db.accessoryTrainingMaxes.where('id').anyOf(plan.orphanAtmIds).delete()
      if (plan.orphanSetIds.length > 0) await db.accessorySets.where('id').anyOf(plan.orphanSetIds).delete()
      for (const id of plan.exercisesToArchive) await archiveExercise(db, id)
    })

    const orphanCount = plan.orphanLaIds.length + plan.orphanAtmIds.length + plan.orphanSetIds.length
    await load()
    showToast(
      orphanCount === 0 && plan.exercisesToArchive.length === 0
        ? 'No orphan data found'
        : `Removed ${orphanCount} orphan rows, archived ${plan.exercisesToArchive.length} exercises`
    )
  }

  const handleSaveTemplate = async (template: SupplementalTemplate) => {
    await updateSettings({ supplementalTemplate: template })
  }

  const handleSkipToWeek = async (targetWeek: 1 | 2 | 3 | 4) => {
    const week = currentCycleWeek()
    const cycleId = currentCycleId()
    if (!week || !cycleId || targetWeek <= week) return
    if (!await confirm(
      `Skip to week ${targetWeek}? Lifts in week${targetWeek - week > 1 ? `s ${week}–${targetWeek - 1}` : ` ${week}`} will be marked skipped.`,
      { destructive: true, confirmLabel: 'SKIP' }
    )) return

    const allLifts = (await db.lifts.orderBy('order').toArray()).filter(l => !l.archived)
    await db.transaction(async () => {
      for (let w = week; w < targetWeek; w++) {
        const wk = w as 1 | 2 | 3 | 4
        const weekSessions = await db.sessions.where('cycleId').equals(cycleId).filter(s => s.week === wk).toArray()
        for (const lift of allLifts) {
          const existing = weekSessions.find(s => s.liftId === lift.id)
          if (existing) {
            if (existing.status === 'pending') await db.sessions.update(existing.id!, { status: 'skipped' })
          } else {
            await db.sessions.add({ cycleId, liftId: lift.id!, week: wk, date: new Date(), notes: null, status: 'skipped' })
          }
        }
      }
    })
    await load()
    showToast(`Advanced to week ${targetWeek}`)
  }

  // Backward nav: reopen a finished week so it can be redone, without rewriting
  // history. The old completed sessions stay untouched; a fresh pending session
  // is added per active lift so the redo records new entries alongside the old
  // ones. Lowering the high-water mark reopens the week, and weekComplete keeps
  // it open until every active lift has a non-pending row again. Mid-cycle only
  // (week < current ≤ 4), so no TM progression has fired.
  const handleReopenWeek = async (targetWeek: 1 | 2 | 3 | 4) => {
    const week = currentCycleWeek()
    const cycleId = currentCycleId()
    if (!week || !cycleId || targetWeek >= week) return
    if (!await confirm(
      `Reopen week ${targetWeek}? Past entries are kept; you'll redo it as new sessions.`,
      { confirmLabel: 'REOPEN' }
    )) return

    const activeIds = (await db.lifts.toArray()).filter(l => !l.archived).map(l => l.id!)
    await db.transaction(async () => {
      const weekSessions = await db.sessions.where('cycleId').equals(cycleId)
        .filter(s => s.week === targetWeek && activeIds.includes(s.liftId)).toArray()
      for (const liftId of activeIds) {
        const hasPending = weekSessions.some(s => s.liftId === liftId && s.status === 'pending')
        if (!hasPending) {
          await db.sessions.add({ cycleId, liftId, week: targetWeek, date: new Date(), notes: null, status: 'pending' })
        }
      }
      await db.cycles.update(cycleId, { closedThroughWeek: targetWeek - 1 })
    })
    await load()
    showToast(`Reopened week ${targetWeek}`)
  }

  const handleSkipDeload = async () => {
    const week = currentCycleWeek()
    const cycleId = currentCycleId()
    if (!week || !cycleId) return
    if (!await confirm('Skip deload week? Remaining sessions will be marked skipped and TMs will progress.', { destructive: true, confirmLabel: 'SKIP DELOAD' })) return

    const allLifts = (await db.lifts.orderBy('order').toArray()).filter(l => !l.archived)
    await db.transaction(async () => {
      for (let w = week; w <= 4; w++) {
        const wk = w as 1 | 2 | 3 | 4
        const weekSessions = await db.sessions.where('cycleId').equals(cycleId).filter(s => s.week === wk).toArray()
        for (const lift of allLifts) {
          const existing = weekSessions.find(s => s.liftId === lift.id)
          if (existing) {
            if (existing.status === 'pending') await db.sessions.update(existing.id!, { status: 'skipped' })
          } else {
            await db.sessions.add({ cycleId, liftId: lift.id!, week: wk, date: new Date(), notes: null, status: 'skipped' })
          }
        }
      }
    })

    const { advanced, doublingCandidates, newTms } = await advanceCycleIfComplete(db)
    if (advanced) {
      setCycleCompleteData({ newTms, doublingCandidates })
    } else {
      await load()
    }
  }

  const handleDeload = async () => {
    if (!await confirm('Drop all TMs by 10%?', { destructive: true, confirmLabel: 'DELOAD' })) return
    await deloadTms(db)
    await load()
    showToast('TMs deloaded −10%')
  }

  const handleFileSelected = (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0]
    if (!file) return
    setImportError(null)
    e.currentTarget.value = ''
    void handleImport(file)
  }

  const handleImport = async (file: File) => {
    if (!await confirm(`Overwrite all data with ${file.name}? This cannot be undone.`, { destructive: true, confirmLabel: 'IMPORT' })) return
    try {
      await importJson(db, file)
      await loadSettings()
      await load()
      showToast('Import complete')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const timerStep = (field: 'restTimer1' | 'restTimer2' | 'restTimerFail', delta: number) => {
    const next = Math.max(30, settings[field] + delta)
    void updateSettings({ [field]: next })
  }


  return (
    <div class="p-4 font-mono text-sm">

      <div class="mb-6">
        <Rule label="MAIN LIFTS" class="text-muted mb-2" />
        <For each={activeLifts()}>{(l, i) => (
          <div class="py-1 border-b border-border-dim">
            <Show when={editingLift() === l.id} fallback={
              <div class="flex items-center gap-2">
                <div class="flex flex-col">
                  <button
                    onClick={() => void handleMoveLift(l.id!, 'up')}
                    disabled={i() === 0}
                    class="text-faint text-xs leading-none hover:text-accent disabled:opacity-30"
                    aria-label="Move up"
                  >▲</button>
                  <button
                    onClick={() => void handleMoveLift(l.id!, 'down')}
                    disabled={i() === activeLifts().length - 1}
                    class="text-faint text-xs leading-none hover:text-accent disabled:opacity-30"
                    aria-label="Move down"
                  >▼</button>
                </div>
                <span class="text-text uppercase tracking-widest text-xs flex-1">{l.name}</span>
                <span class="text-faint text-xs">+{l.progressionIncrement}</span>
                <button onClick={() => setSetupLiftId(l.id!)} class="text-muted text-xs hover:text-accent">setup</button>
                <button
                  onClick={() => { setEditingLift(l.id!); setEditLiftName(l.name); setEditLiftIncrement(l.progressionIncrement) }}
                  class="text-muted text-xs hover:text-accent"
                >rename</button>
                <button onClick={() => void handleArchiveLift(l.id!)} class="text-muted text-xs hover:text-danger">archive</button>
              </div>
            }>
              <div class="flex flex-col gap-2">
                <input
                  type="text"
                  value={editLiftName()}
                  onInput={e => setEditLiftName(e.currentTarget.value)}
                  class="bg-surface border border-border text-text px-2 py-1 focus:outline-none focus:border-accent"
                />
                <div class="flex items-center gap-2">
                  <span class="text-muted text-xs w-20">increment</span>
                  <Stepper value={editLiftIncrement()} onChange={setEditLiftIncrement} step={5} min={0} max={50} />
                  <span class="text-muted text-xs">lb</span>
                </div>
                <div class="flex gap-3">
                  <button onClick={() => void handleSaveLiftEdit(l.id!)} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl">SAVE</button>
                  <button onClick={() => setEditingLift(null)} class="text-muted text-lg sm:text-xl">cancel</button>
                </div>
              </div>
            </Show>
          </div>
        )}</For>

        <Show when={showAddLift()} fallback={
          <button
            onClick={() => setShowAddLift(true)}
            class="mt-2 border border-border text-muted px-3 py-1 text-lg sm:text-xl hover:border-accent hover:text-accent"
          >
            + ADD LIFT
          </button>
        }>
          <div class="flex flex-col gap-2 mt-2">
            <input
              type="text"
              value={newLiftName()}
              onInput={e => setNewLiftName(e.currentTarget.value)}
              placeholder="Lift name"
              class="bg-surface border border-border text-text px-2 py-1 focus:outline-none focus:border-accent"
            />
            <div class="flex items-center gap-2">
              <span class="text-muted text-xs w-20">increment</span>
              <Stepper value={newLiftIncrement()} onChange={setNewLiftIncrement} step={5} min={0} max={50} />
              <span class="text-muted text-xs">lb</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-muted text-xs w-20">base wt</span>
              <Stepper value={newLiftBase()} onChange={setNewLiftBase} step={5} min={0} max={500} />
              <span class="text-muted text-xs">lb</span>
            </div>
            <div class="flex gap-2">
              <For each={(['upper', 'lower'] as const)}>{type => (
                <button
                  onClick={() => setNewLiftType(type)}
                  class={`px-2 py-1 text-xs border ${newLiftType() === type ? 'border-accent text-accent' : 'border-border text-muted'}`}
                >{type}</button>
              )}</For>
            </div>
            <div class="flex gap-3">
              <button onClick={handleAddLift} disabled={!newLiftName().trim()} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl disabled:border-border disabled:text-muted">ADD</button>
              <button onClick={() => setShowAddLift(false)} class="text-muted text-lg sm:text-xl">cancel</button>
            </div>
          </div>
        </Show>

        <Show when={archivedLifts().length > 0}>
          <Rule label="ARCHIVED LIFTS" class="text-faint mt-4 mb-2" />
          <For each={archivedLifts()}>{(l) => (
            <div class="py-1 border-b border-border-dim flex items-center justify-between">
              <span class="text-faint text-sm uppercase tracking-widest">{l.name}</span>
              <button onClick={() => void handleUnarchiveLift(l.id!)} class="text-muted text-xs hover:text-accent">unarchive</button>
            </div>
          )}</For>
        </Show>
      </div>

      <div class="mb-6">
        <Rule label="TRAINING MAXES" class="text-muted mb-2" />
        <For each={activeLifts()}>{(l) => (
          <div class="py-1 border-b border-border-dim">
            <div class="flex items-center gap-3">
              <span class="text-muted w-20 uppercase tracking-widest text-xs">{l.name}</span>
              <Show when={editingTm() === l.id} fallback={
                <>
                  <span class="text-text">{tms()[l.id!] ?? '—'} lb</span>
                  <button
                    onClick={() => { setEditingTm(l.id!); setTmInput(tms()[l.id!] ?? 0) }}
                    class="text-muted text-xs hover:text-accent"
                  >
                    edit
                  </button>
                </>
              }>
                <div class="flex flex-col gap-2 flex-1">
                  <div class="flex items-center gap-2">
                    <Stepper value={tmInput()} onChange={setTmInput} step={5} min={0} />
                    <span class="text-muted text-xs">lb</span>
                  </div>
                  <div class="flex gap-3">
                    <button onClick={() => handleSaveTm(l.id!)} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl font-mono tracking-widest">SAVE</button>
                    <button onClick={() => setEditingTm(null)} class="text-muted text-lg sm:text-xl">cancel</button>
                  </div>
                </div>
              </Show>
            </div>
            <Show when={editingTm() === l.id && tmInput() > 0}>
              <div class="text-faint text-xs font-mono mt-1 ml-24">
                {'W1: ' + calcMainSets(tmInput(), 1, settings.barWeight).map(s => s.weight).join(' · ') + ' lb'}
              </div>
            </Show>
          </div>
        )}</For>
        <div class="mt-3">
          <button
            onClick={() => void handleDeload()}
            class="border border-border text-muted px-3 py-1.5 text-xs font-mono tracking-widest hover:border-danger hover:text-danger"
          >
            DELOAD ALL  −10%
          </button>
        </div>
      </div>

      <div class="mb-6">
        <Rule label="SUPPLEMENTAL" class="text-muted mb-2" />
        <div class="flex gap-1 flex-wrap">
          <For each={(['fsl', 'ssl', 'bbb', 'fsl+bbb', 'ssl+bbb', 'bbs', 'none'] as const)}>{(t) => (
            <button
              class={`px-2 py-1 text-xs font-mono tracking-widest border ${
                (settings.supplementalTemplate ?? 'fsl+bbb') === t
                  ? 'border-accent text-accent'
                  : 'border-border text-muted hover:border-accent hover:text-accent'
              }`}
              onClick={() => void handleSaveTemplate(t)}
            >
              {t.toUpperCase()}
            </button>
          )}</For>
        </div>

        <div class="text-muted text-xs uppercase tracking-widest mt-3 mb-1">Deload week</div>
        <div class="flex gap-1 flex-wrap">
          <For each={([['skip', 'SKIP IT'], ['deload', 'DELOAD %'], ['normal', 'NORMAL']] as const)}>{([m, label]) => (
            <button
              class={`px-2 py-1 text-xs font-mono tracking-widest border ${
                (settings.deloadSupplemental ?? 'normal') === m
                  ? 'border-accent text-accent'
                  : 'border-border text-muted hover:border-accent hover:text-accent'
              }`}
              onClick={() => void updateSettings({ deloadSupplemental: m })}
            >
              {label}
            </button>
          )}</For>
        </div>
        <p class="text-faint text-xs mt-1">
          Supplemental + cross-lift work on the week-4 deload: skip it, run it at deload %, or at normal (~65%) weights.
        </p>
      </div>

      <Show when={currentCycleWeek() !== null}>
        <div class="mb-6">
          <Rule label="CYCLE" class="text-muted mb-2" />
          <div class="flex items-center gap-4 py-1">
            <span class="text-muted text-xs uppercase tracking-widest w-20">Week</span>
            <div class="flex gap-2">
              <For each={[1, 2, 3, 4] as Array<1 | 2 | 3 | 4>}>{(w) => (
                <button
                  aria-label={`Week ${w}`}
                  onClick={() => {
                    const cur = currentCycleWeek()
                    if (cur && w < cur) void handleReopenWeek(w)
                    else void handleSkipToWeek(w)
                  }}
                  disabled={w === currentCycleWeek()}
                  class={`w-8 h-8 border font-mono text-sm ${
                    w === currentCycleWeek()
                      ? 'border-accent text-accent'
                      : w < (currentCycleWeek() ?? 5)
                        ? 'border-border-dim text-muted hover:border-warn hover:text-warn'
                        : 'border-border text-muted hover:border-warn hover:text-warn'
                  }`}
                >
                  {w}
                </button>
              )}</For>
            </div>
          </div>
          <Show when={currentCycleWeek() === 4}>
            <div class="flex items-center gap-4 py-1">
              <span class="w-20" />
              <button
                onClick={() => void handleSkipDeload()}
                class="border border-border text-muted text-xs tracking-widest px-3 py-1.5 hover:border-danger hover:text-danger"
              >
                SKIP DELOAD
              </button>
            </div>
          </Show>
        </div>
      </Show>

      <div class="mb-6">
        <Rule label="REST TIMERS" class="text-muted mb-2" />
        <For each={[
          { label: 'First',  field: 'restTimer1'   as const, value: settings.restTimer1 },
          { label: 'Second', field: 'restTimer2'   as const, value: settings.restTimer2 },
          { label: 'Failed', field: 'restTimerFail' as const, value: settings.restTimerFail },
        ]}>{({ label, field, value }) => (
          <div class="flex items-center gap-3 py-1 border-b border-border-dim">
            <span class="text-muted w-16 text-xs uppercase tracking-widest">{label}</span>
            <button onClick={() => timerStep(field, -30)} class="border border-border px-2 py-0.5 text-muted hover:text-text">-</button>
            <span class="text-text w-12 text-center">{formatDuration(value)}</span>
            <button onClick={() => timerStep(field, 30)} class="border border-border px-2 py-0.5 text-muted hover:text-text">+</button>
          </div>
        )}</For>
      </div>

      <div class="mb-6">
        <Rule label="THEME" class="text-muted mb-3" />
        <div class="flex gap-4">
          <For each={Object.entries(THEMES) as [string, typeof THEMES[keyof typeof THEMES]][]}>{([key, t]) => (
            <button onClick={() => updateSettings({ theme: key })} class="flex flex-col items-center gap-1.5">
              <div
                class="w-14 h-10 p-1 rounded-sm border-2 flex flex-col gap-1 transition-all"
                style={{
                  'background-color': t.vars['--color-bg'],
                  'border-color': settings.theme === key ? t.vars['--color-accent'] : 'transparent',
                }}
              >
                <div class="flex-1 rounded-sm" style={{ 'background-color': t.vars['--color-surface'] }} />
                <div class="h-1 w-1/2 rounded-full" style={{ 'background-color': t.vars['--color-accent'] }} />
              </div>
              <span
                class="text-xs uppercase tracking-widest"
                style={{ color: settings.theme === key ? 'var(--color-accent)' : 'var(--color-muted)' }}
              >
                {t.label}
              </span>
            </button>
          )}</For>
        </div>
      </div>

      <div class="mb-6">
        <Rule label="EXERCISES" class="text-muted mb-2" />

        <For each={activeLifts()}>{(lift) => {
          const assigned = () => liftAccessories()
            .filter(la => la.liftId === lift.id)
            .sort((a, b) => a.order - b.order)
          const assignedIds = () => new Set(assigned().map(la => la.exerciseId))
          const available = () => exercises().filter(ex => !assignedIds().has(ex.id!) && !ex.archived)
          return (
            <div class="mb-3">
              <div class="text-muted text-xs uppercase tracking-widest mb-1">{lift.name}</div>
              <Show when={assigned().length === 0}>
                <div class="text-faint text-xs pl-2 py-1">no exercises</div>
              </Show>
              <For each={assigned()}>{(la) => {
                const ex = () => exercises().find(e => e.id === la.exerciseId)
                return (
                  <Show when={ex()}>
                    <div class="flex items-center justify-between py-0.5 pl-2 border-b border-border-dim">
                      <Show when={editingEx() === ex()!.id} fallback={
                        <>
                          <span class="text-text text-xs">{ex()!.name}</span>
                          <div class="flex items-center gap-4">
                            <button onClick={() => { setEditingEx(ex()!.id!); setEditExName(ex()!.name); setEditExIncrement(accessoryIncrements()[ex()!.id!]?.incrementLb ?? DEFAULT_ACCESSORY_INCREMENT_LB) }} class="text-muted text-xs hover:text-accent">edit</button>
                            <button onClick={() => handleRemoveFromLift(la.id!)} class="text-muted text-xs hover:text-danger">del</button>
                          </div>
                        </>
                      }>
                        <ExerciseEditor
                          fullWidth
                          name={editExName()}
                          onNameChange={setEditExName}
                          increment={accessoryIncrements()[ex()!.id!] ? editExIncrement() : null}
                          onIncrementChange={setEditExIncrement}
                          onSave={() => handleRenameExercise(ex()!.id!)}
                          onCancel={() => setEditingEx(null)}
                        />
                      </Show>
                    </div>
                  </Show>
                )
              }}</For>
              <Show when={addToLift() === lift.id} fallback={
                <Show when={available().length > 0}>
                  <button
                    onClick={() => { setAddToLift(lift.id!); setAddToLiftExId(null) }}
                    class="mt-1 pl-2 text-faint text-lg sm:text-xl hover:text-accent"
                  >
                    + assign
                  </button>
                </Show>
              }>
                <div class="flex flex-col gap-2 mt-1 pl-2">
                  <select
                    value={addToLiftExId() ?? ''}
                    onChange={e => setAddToLiftExId(Number(e.currentTarget.value) || null)}
                    class="bg-surface border border-border text-text px-2 py-0.5 text-xs focus:outline-none w-full"
                  >
                    <option value="">pick exercise</option>
                    <For each={available()}>{(ex) => (
                      <option value={ex.id}>{ex.name}</option>
                    )}</For>
                  </select>
                  <div class="flex gap-3">
                    <button
                      onClick={() => { const id = addToLiftExId(); if (id) void handleAddToLift(lift.id!, id) }}
                      disabled={!addToLiftExId()}
                      class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl disabled:border-border disabled:text-muted"
                    >
                      ADD
                    </button>
                    <button onClick={() => { setAddToLift(null); setAddToLiftExId(null) }} class="text-muted text-lg sm:text-xl">cancel</button>
                  </div>
                </div>
              </Show>
            </div>
          )
        }}</For>

        <Rule label="ALL EXERCISES" class="text-muted mt-4 mb-2" />
        <For each={exercises().filter(ex => !ex.archived)}>{(ex) => (
          <div class="py-1 border-b border-border-dim">
            <Show when={editingEx() === ex.id} fallback={
              <div class="flex items-center justify-between">
                <span class="text-text">{ex.name}</span>
                <div class="flex items-center gap-4">
                  <button onClick={() => { setEditingEx(ex.id!); setEditExName(ex.name); setEditExIncrement(accessoryIncrements()[ex.id!]?.incrementLb ?? DEFAULT_ACCESSORY_INCREMENT_LB) }} class="text-muted text-xs hover:text-accent">edit</button>
                  <button onClick={() => void handleArchiveExercise(ex.id!)} class="text-muted text-xs hover:text-danger">archive</button>
                </div>
              </div>
            }>
              <ExerciseEditor
                name={editExName()}
                onNameChange={setEditExName}
                increment={accessoryIncrements()[ex.id!] ? editExIncrement() : null}
                onIncrementChange={setEditExIncrement}
                onSave={() => handleRenameExercise(ex.id!)}
                onCancel={() => setEditingEx(null)}
              />
            </Show>
          </div>
        )}</For>

        <Show when={exercises().some(ex => ex.archived)}>
          <>
            <Rule label="ARCHIVED" class="text-faint mt-4 mb-2" />
            <For each={exercises().filter(ex => ex.archived)}>{(ex) => (
              <div class="py-1 border-b border-border-dim flex items-center justify-between">
                <span class="text-faint text-sm">{ex.name}</span>
                <button onClick={() => handleUnarchiveExercise(ex.id!)} class="text-muted text-xs hover:text-accent">unarchive</button>
              </div>
            )}</For>
          </>
        </Show>

        <Show when={showAddEx()} fallback={
          <button
            onClick={() => setShowAddEx(true)}
            class="mt-2 border border-border text-muted px-3 py-1 text-lg sm:text-xl hover:border-accent hover:text-accent"
          >
            + ADD EXERCISE
          </button>
        }>
          <div class="flex flex-col gap-2 mt-2">
            <div class="flex gap-2">
              <input
                type="text"
                value={newExName()}
                onInput={e => setNewExName(e.currentTarget.value)}
                placeholder="Exercise name"
                class="bg-surface border border-border text-text px-2 py-1 flex-1 focus:outline-none focus:border-accent"
              />
              <select
                value={newExType()}
                onChange={e => setNewExType(e.currentTarget.value as 'reps' | 'timed' | 'distance')}
                class="bg-surface border border-border text-text px-2 py-1 focus:outline-none"
              >
                <option value="reps">reps</option>
                <option value="timed">timed</option>
                <option value="distance">distance</option>
              </select>
            </div>
            <div class="flex gap-3">
              <button onClick={handleAddExercise} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl">ADD</button>
              <button onClick={() => setShowAddEx(false)} class="text-muted text-lg sm:text-xl">cancel</button>
            </div>
          </div>
        </Show>
      </div>

      <div class="mb-6">
        <Rule label="PLATES" class="text-muted mb-2" />
        <div class="flex items-center gap-3 py-1 border-b border-border-dim">
          <span class="text-muted w-20 uppercase tracking-widest text-xs">Bar</span>
          <Stepper value={settings.barWeight} onChange={v => updateSettings({ barWeight: v })} step={2.5} min={10} max={100} />
          <span class="text-muted text-xs">lb</span>
        </div>
        <For each={DEFAULT_PLATES}>{({ weight }) => {
          const plate = () => settings.plates.find(p => p.weight === weight) ?? { weight, count: 0 }
          return (
            <div class="flex items-center gap-3 py-1 border-b border-border-dim">
              <span class="text-muted w-20 text-right font-mono text-xs">{weight} lb</span>
              <Stepper
                value={plate().count}
                onChange={v => {
                  const next = settings.plates.some(p => p.weight === weight)
                    ? settings.plates.map(p => p.weight === weight ? { ...p, count: v } : p)
                    : [...settings.plates, { weight, count: v }]
                  void updateSettings({ plates: next })
                }}
                step={1}
                min={0}
              />
            </div>
          )
        }}</For>
      </div>

      <div>
        <Rule label="DATA" class="text-muted mb-3" />
        <div class="flex flex-wrap gap-3 mb-4">
          <button onClick={() => void exportJson(db)} class="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent">
            EXPORT JSON
          </button>
          <button onClick={() => void exportCsv(db)} class="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent">
            EXPORT CSV
          </button>
          <button
            onClick={() => fileInputRef.click()}
            class="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-warn hover:text-warn"
          >
            IMPORT JSON
          </button>
          <button
            onClick={() => void handleCleanupAccessoryData()}
            class="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-danger hover:text-danger"
          >
            CLEANUP ORPHANS
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            class="hidden"
            onChange={handleFileSelected}
          />
        </div>

        <Show when={importError()}>
          <div class="text-danger text-xs mb-3">{importError()}</div>
        </Show>

        <div class="text-faint text-xs leading-relaxed">
          JSON backup restores all history. CSV exports completed sessions for spreadsheets.
        </div>
      </div>

      <CycleCompleteModal
        data={cycleCompleteData()}
        onDismiss={async () => { setCycleCompleteData(null); await load() }}
        onDeload={async () => { await deloadTms(db); setCycleCompleteData(null); await load() }}
        onDoubleIncrement={async (liftId, progressionIncrement) => {
          const currentTm = await getCurrentTm(db, liftId)
          const newTm = Math.round((currentTm + progressionIncrement) / 5) * 5
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
        }}
      />

      <Show when={setupLiftId() !== null || draftLift() !== null}>
        <LiftSetupModal
          liftId={setupLiftId() ?? undefined}
          draftLift={draftLift() ?? undefined}
          collectTm={draftLift() !== null}
          onCommit={() => { setSetupLiftId(null); setDraftLift(null); resetAddForm(); void load() }}
          onCancel={() => {
            const d = draftLift()
            if (d) {
              setNewLiftName(d.name)
              setNewLiftIncrement(d.progressionIncrement)
              setNewLiftBase(d.baseWeight)
              setNewLiftType(d.liftType)
              setShowAddLift(true)
              setDraftLift(null)
            } else {
              setSetupLiftId(null)
            }
          }}
        />
      </Show>
    </div>
  )
}
