import { createSignal, onMount, For, Show } from 'solid-js'
import { db } from '../../db/index'
import type { Exercise } from '../../types/domain'
import { workout, addAccessory } from '../../store/workout-store'
import { roundToNearest5, ACCESSORY_PERCENTAGE, ACCESSORY_SETS, ACCESSORY_REPS, DEFAULT_ACCESSORY_INCREMENT_LB } from '../../lib/calc'
import { groupByAssistanceSection, sectionForCategory, accessoryRecencyRanks, ASSISTANCE_SECTIONS, ASSISTANCE_SUGGESTION_SESSIONS, SECTION_LABEL, type AssistanceSlot } from '../../lib/assistance'
import Rule from '../layout/Rule'
import Stepper from '../forms/Stepper'

interface Props {
  // The slot being filled. A fixed section ('push'|'pull'|'legs_core')
  // shows only that section's exercises; 'extra' shows the whole library
  // grouped into sections.
  slot: AssistanceSlot
  // The session's main lift — used to rank exercises previously run for this
  // lift to the top of a slot picker.
  liftId: number
  onClose: () => void
}

interface PickerRow {
  exercise: Exercise
  tm: number | null
  calculatedWeight: number | null
  alreadyAdded: boolean
  // 0-based recency rank among accessories previously logged for this main
  // lift (0 = most recent). null = never used here.
  usedRank: number | null
}

export default function AccessoryPicker(props: Props) {
  const [rows, setRows] = createSignal<PickerRow[]>([])
  const [settingTm, setSettingTm] = createSignal<Exercise | null>(null)
  const [tmWeight, setTmWeight] = createSignal(0)
  const [tmIncrement, setTmIncrement] = createSignal(DEFAULT_ACCESSORY_INCREMENT_LB)

  onMount(() => { void load() })

  // Draws from the whole exercise library (not per-lift) so any session can
  // pick a push/pull/single-leg/core. Alphabetical; grouped into sections below.
  // Accessories previously logged for this main lift are ranked by recency so
  // the slot picker can float them above the alphabetical rest.
  const load = async () => {
    const exercises = (await db.exercises.toArray())
      .filter(e => !e.archived)
      .sort((a, b) => a.name.localeCompare(b.name))

    const allAtms = await db.accessoryTrainingMaxes.where('exerciseId').anyOf(exercises.map(e => e.id!)).sortBy('setAt')
    const latestAtmByExercise = new Map<number, number>()
    for (const atm of allAtms) latestAtmByExercise.set(atm.exerciseId, atm.weight)

    // Recency of accessory use for this main lift, limited to the last few
    // sessions so suggestions reflect the current rotation. Only completed
    // sessions have persisted accessory rows — the in-progress (pending)
    // session and any skipped ones are dropped first, so they can't burn a
    // window slot and shrink the effective history below the cap. Sessions
    // newest first; rank by the most recent session each accessory appears in.
    const liftSessions = (await db.sessions.where('liftId').equals(props.liftId).toArray())
      .filter(s => s.status === 'completed')
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, ASSISTANCE_SUGGESTION_SESSIONS)
    const accSets = liftSessions.length > 0
      ? await db.accessorySets.where('sessionId').anyOf(liftSessions.map(s => s.id!)).toArray()
      : []
    const bestRecency = accessoryRecencyRanks(liftSessions, accSets as Array<{ sessionId: number; exerciseId: number }>)

    setRows(exercises.map(ex => {
      const tmWeight = latestAtmByExercise.get(ex.id!) ?? null
      return {
        exercise: ex,
        tm: tmWeight,
        calculatedWeight: tmWeight != null ? roundToNearest5(tmWeight * ACCESSORY_PERCENTAGE) : null,
        alreadyAdded: workout.activeAccessories.some(a => a.exerciseId === ex.id),
        usedRank: bestRecency.get(ex.id!) ?? null,
      }
    }))
  }

  const grouped = () => groupByAssistanceSection(rows())
  // For a fixed-slot pick, only that section's exercises are offered. Previously
  // used ones float to the top by recency; the rest stay alphabetical.
  const slotRows = () => props.slot === 'extra' ? [] : rows().filter(r => sectionForCategory(r.exercise.category) === props.slot)
  const usedSlotRows = () => slotRows().filter(r => r.usedRank != null).sort((a, b) => a.usedRank! - b.usedRank!)
  const restSlotRows = () => slotRows().filter(r => r.usedRank == null)

  const renderRow = (row: PickerRow) => (
    <button
      onClick={() => handleSelect(row)}
      disabled={row.alreadyAdded}
      class={`w-full text-left px-3 py-2 border font-mono text-sm flex justify-between ${
        row.alreadyAdded
          ? 'border-border-dim text-muted'
          : 'border-border text-text hover:border-accent hover:text-accent'
      }`}
    >
      <span>{row.exercise.name}{row.alreadyAdded ? ' ✓' : ''}</span>
      <span class="text-muted">
        {row.calculatedWeight != null ? `${ACCESSORY_SETS}x${ACCESSORY_REPS} @ ${row.calculatedWeight}lb` : 'NOT SET'}
      </span>
    </button>
  )

  const handleSelect = (row: PickerRow) => {
    if (row.alreadyAdded) return
    if (row.tm == null) {
      setSettingTm(row.exercise)
      return
    }
    addAccessory({
      exerciseId: row.exercise.id!,
      exerciseName: row.exercise.name,
      tm: row.tm,
      calculatedWeight: row.calculatedWeight!,
      loggedSets: [],
      slot: props.slot,
    })
    props.onClose()
  }

  const handleSaveTm = async () => {
    const ex = settingTm()
    if (!ex || tmWeight() < 0) return
    await db.accessoryTrainingMaxes.add({
      exerciseId: ex.id!,
      weight: tmWeight(),
      incrementLb: tmIncrement(),
      setAt: new Date(),
    })
    addAccessory({
      exerciseId: ex.id!,
      exerciseName: ex.name,
      tm: tmWeight(),
      calculatedWeight: roundToNearest5(tmWeight() * ACCESSORY_PERCENTAGE),
      loggedSets: [],
      slot: props.slot,
    })
    props.onClose()
  }

  return (
    <Show
      when={settingTm()}
      fallback={
        <div class="fixed inset-0 bg-bg z-50 px-4 pb-4 overflow-y-auto" style={{ 'padding-top': 'max(1rem, env(safe-area-inset-top, 0px))' }}>
          <div class="flex items-center justify-between mb-4">
            <button onClick={props.onClose} class="text-muted hover:text-text text-xs tracking-widest">← BACK</button>
            <Rule label={props.slot === 'extra' ? 'SELECT ASSISTANCE EXERCISE' : `CHOOSE ${SECTION_LABEL[props.slot]}`} class="text-muted" />
            <div class="w-14" />
          </div>
          <Show
            when={props.slot === 'extra'}
            fallback={
              <div class="space-y-1">
                <Show when={slotRows().length === 0}>
                  <div class="text-faint text-xs py-2">No {SECTION_LABEL[props.slot as Exclude<AssistanceSlot, 'extra'>]} exercises. Tag one in Settings.</div>
                </Show>
                <Show when={usedSlotRows().length > 0}>
                  <div class="text-faint text-[10px] uppercase tracking-widest pb-0.5">Used for this lift</div>
                  <For each={usedSlotRows()}>{row => renderRow(row)}</For>
                  <Show when={restSlotRows().length > 0}>
                    <div class="flex items-center gap-2 py-2">
                      <div class="flex-1 border-t border-border-dim" />
                      <span class="text-faint text-[10px] uppercase tracking-widest">all</span>
                      <div class="flex-1 border-t border-border-dim" />
                    </div>
                  </Show>
                </Show>
                <For each={restSlotRows()}>{row => renderRow(row)}</For>
              </div>
            }
          >
            <div class="space-y-4">
              <For each={ASSISTANCE_SECTIONS}>
                {section => (
                  <Show when={grouped()[section].length > 0}>
                    <div class="space-y-1">
                      <div class="text-muted text-xs uppercase tracking-widest">{SECTION_LABEL[section]}</div>
                      <For each={grouped()[section]}>{row => renderRow(row)}</For>
                    </div>
                  </Show>
                )}
              </For>
              <Show when={grouped().uncategorized.length > 0}>
                <div class="space-y-1">
                  <div class="text-faint text-xs uppercase tracking-widest">UNCATEGORIZED</div>
                  <For each={grouped().uncategorized}>{row => renderRow(row)}</For>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      }
    >
      {ex => (
        <div class="fixed inset-0 bg-bg z-50 px-4 pb-4" style={{ 'padding-top': 'max(1rem, env(safe-area-inset-top, 0px))' }}>
          <Rule label="SET TRAINING MAX" class="text-muted mb-4" />
          <div class="text-text mb-6 uppercase tracking-widest">{ex().name}</div>
          <div class="space-y-5">
            <div class="flex items-center gap-4">
              <label class="text-muted text-sm uppercase tracking-widest w-32">TM</label>
              <Stepper value={tmWeight()} onChange={setTmWeight} step={5} min={0} />
              <span class="text-muted text-sm">lb</span>
            </div>
            <Show when={tmWeight() >= 0}>
              <div class="flex items-center gap-4">
                <span class="text-muted text-sm uppercase tracking-widest w-32">{ACCESSORY_SETS}×{ACCESSORY_REPS} weight</span>
                <span class="text-accent font-mono text-lg">{roundToNearest5(tmWeight() * ACCESSORY_PERCENTAGE)} lb</span>
              </div>
            </Show>
            <div class="flex items-center gap-4">
              <label class="text-muted text-sm uppercase tracking-widest w-32">Increment</label>
              <Stepper value={tmIncrement()} onChange={setTmIncrement} step={2.5} min={0} />
              <span class="text-muted text-sm">lb</span>
            </div>
          </div>
          <div class="flex gap-4 mt-8">
            <button
              onClick={() => setSettingTm(null)}
              class="border border-border px-4 py-2 font-mono text-text"
            >
              BACK
            </button>
            <button
              onClick={handleSaveTm}
              disabled={tmWeight() < 0}
              class="border border-accent text-accent px-6 py-2 font-mono disabled:opacity-40"
            >
              SAVE
            </button>
          </div>
        </div>
      )}
    </Show>
  )
}
