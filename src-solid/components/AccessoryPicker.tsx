import { createSignal, onMount, For, Show } from 'solid-js'
import { db } from '../../src/db/db-v2'
import type { Exercise, LiftAccessory } from '../../src/db/db-v2'
import { workout, addAccessory } from '../store/workoutStore'
import { roundToNearest5 } from '../../src/lib/calc'
import Rule from './Rule'
import Stepper from './Stepper'

interface Props {
  liftId: number
  onClose: () => void
}

interface PickerRow {
  exercise: Exercise
  liftAccessory: LiftAccessory
  tm: number | null
  calculatedWeight: number | null
  alreadyAdded: boolean
}

export default function AccessoryPicker(props: Props) {
  const [rows, setRows] = createSignal<PickerRow[]>([])
  const [settingTm, setSettingTm] = createSignal<Exercise | null>(null)
  const [tmWeight, setTmWeight] = createSignal(0)
  const [tmIncrement, setTmIncrement] = createSignal(5)

  onMount(() => { void load() })

  const load = async () => {
    const accessories = await db.liftAccessories.where('liftId').equals(props.liftId).toArray()
    const exerciseIds = accessories.map(a => a.exerciseId)
    const exercises = await db.exercises.where('id').anyOf(exerciseIds).toArray()

    const result: PickerRow[] = []
    for (const la of accessories.sort((a, b) => a.order - b.order)) {
      const ex = exercises.find(e => e.id === la.exerciseId)
      if (!ex || ex.archived) continue
      const tms = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex.id!).sortBy('setAt')
      const latest = tms[tms.length - 1] ?? null
      result.push({
        exercise: ex,
        liftAccessory: la,
        tm: latest?.weight ?? null,
        calculatedWeight: latest ? roundToNearest5(latest.weight * 0.75) : null,
        alreadyAdded: workout.activeAccessories.some(a => a.exerciseId === ex.id),
      })
    }
    setRows(result)
  }

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
      calculatedWeight: roundToNearest5(tmWeight() * 0.75),
      loggedSets: [],
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
            <Rule label="SELECT ASSISTANCE EXERCISE" class="text-muted" />
            <div class="w-14" />
          </div>
          <div class="space-y-1">
            <For each={rows()}>
              {row => (
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
                    {row.calculatedWeight != null ? `5x10 @ ${row.calculatedWeight}lb` : 'NOT SET'}
                  </span>
                </button>
              )}
            </For>
          </div>
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
                <span class="text-muted text-sm uppercase tracking-widest w-32">5×10 weight</span>
                <span class="text-accent font-mono text-lg">{roundToNearest5(tmWeight() * 0.75)} lb</span>
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
