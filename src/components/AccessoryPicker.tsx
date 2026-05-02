import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Exercise, LiftAccessory } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'
import { roundToNearest5 } from '../lib/calc'
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

export default function AccessoryPicker({ liftId, onClose }: Props) {
  const { activeAccessories, addAccessory } = useWorkoutStore()
  const [rows, setRows] = useState<PickerRow[]>([])
  const [settingTm, setSettingTm] = useState<Exercise | null>(null)
  const [tmWeight, setTmWeight] = useState(0)
  const [tmIncrement, setTmIncrement] = useState(5)

  useEffect(() => { load() }, [])

  const load = async () => {
    const accessories = await db.liftAccessories.where('liftId').equals(liftId).toArray()
    const exerciseIds = accessories.map(a => a.exerciseId)
    const exercises = await db.exercises.where('id').anyOf(exerciseIds).toArray()

    const result: PickerRow[] = []
    for (const la of accessories.sort((a, b) => a.order - b.order)) {
      const ex = exercises.find(e => e.id === la.exerciseId)
      if (!ex) continue
      const tms = await db.accessoryTrainingMaxes.where('exerciseId').equals(ex.id!).sortBy('setAt')
      const latest = tms[tms.length - 1] ?? null
      result.push({
        exercise: ex,
        liftAccessory: la,
        tm: latest?.weight ?? null,
        calculatedWeight: latest ? roundToNearest5(latest.weight * 0.75) : null,
        alreadyAdded: activeAccessories.some(a => a.exerciseId === ex.id),
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
    onClose()
  }

  const handleSaveTm = async () => {
    if (!settingTm || tmWeight <= 0) return
    await db.accessoryTrainingMaxes.add({
      exerciseId: settingTm.id!,
      weight: tmWeight,
      incrementLb: tmIncrement,
      setAt: new Date(),
    })
    addAccessory({
      exerciseId: settingTm.id!,
      exerciseName: settingTm.name,
      tm: tmWeight,
      calculatedWeight: roundToNearest5(tmWeight * 0.75),
      loggedSets: [],
    })
    onClose()
  }

  if (settingTm) {
    const workingWeight = tmWeight > 0 ? roundToNearest5(tmWeight * 0.75) : null
    return (
      <div className="fixed inset-0 bg-bg z-50 p-4">
        <Rule label="SET TRAINING MAX" className="text-muted mb-4" />
        <div className="text-text mb-6 uppercase tracking-widest">{settingTm.name}</div>
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <label className="text-muted text-sm uppercase tracking-widest w-32">TM</label>
            <Stepper value={tmWeight} onChange={setTmWeight} step={5} min={0} />
            <span className="text-muted text-sm">lb</span>
          </div>
          {workingWeight != null && (
            <div className="flex items-center gap-4">
              <span className="text-muted text-sm uppercase tracking-widest w-32">5×10 weight</span>
              <span className="text-accent font-mono text-lg">{workingWeight} lb</span>
            </div>
          )}
          <div className="flex items-center gap-4">
            <label className="text-muted text-sm uppercase tracking-widest w-32">Increment</label>
            <Stepper value={tmIncrement} onChange={setTmIncrement} step={2.5} min={0} />
            <span className="text-muted text-sm">lb</span>
          </div>
        </div>
        <div className="flex gap-4 mt-8">
          <button
            onClick={() => setSettingTm(null)}
            className="border border-border px-4 py-2 font-mono text-text"
          >
            BACK
          </button>
          <button
            onClick={handleSaveTm}
            disabled={tmWeight <= 0}
            className="border border-accent text-accent px-6 py-2 font-mono disabled:opacity-40"
          >
            SAVE
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-bg z-50 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <Rule label="SELECT ASSISTANCE EXERCISE" className="text-muted" />
        <button onClick={onClose} className="text-muted hover:text-text font-mono">✕</button>
      </div>
      <div className="space-y-1">
        {rows.map(row => (
          <button
            key={row.exercise.id}
            onClick={() => handleSelect(row)}
            disabled={row.alreadyAdded}
            className={`w-full text-left px-3 py-2 border font-mono text-sm flex justify-between ${
              row.alreadyAdded
                ? 'border-border-dim text-muted'
                : 'border-border text-text hover:border-accent hover:text-accent'
            }`}
          >
            <span>{row.exercise.name}{row.alreadyAdded ? ' ✓' : ''}</span>
            <span className="text-muted">
              {row.calculatedWeight != null
                ? `5x10 @ ${row.calculatedWeight}lb`
                : 'NOT SET'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
