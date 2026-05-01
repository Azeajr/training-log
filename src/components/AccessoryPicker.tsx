import { useEffect, useState } from 'react'
import { db } from '../db/db'
import type { Exercise, LiftAccessory } from '../db/db'
import { useWorkoutStore } from '../store/workoutStore'
import { roundToNearest5 } from '../lib/calc'

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
  const [tmWeight, setTmWeight] = useState('')
  const [tmIncrement, setTmIncrement] = useState('5')

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
    if (!settingTm) return
    const weight = parseFloat(tmWeight)
    const increment = parseFloat(tmIncrement)
    if (!weight || weight <= 0) return
    await db.accessoryTrainingMaxes.add({
      exerciseId: settingTm.id!,
      weight,
      incrementLb: increment || 5,
      setAt: new Date(),
    })
    const calcW = roundToNearest5(weight * 0.75)
    addAccessory({
      exerciseId: settingTm.id!,
      exerciseName: settingTm.name,
      tm: weight,
      calculatedWeight: calcW,
      loggedSets: [],
    })
    onClose()
  }

  if (settingTm) {
    return (
      <div className="fixed inset-0 bg-zinc-950 z-50 p-4">
        <div className="text-zinc-500 uppercase text-xs tracking-widest mb-4">
          --- SET TRAINING MAX -----------------------------
        </div>
        <div className="text-zinc-100 mb-6 uppercase tracking-widest">{settingTm.name}</div>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-zinc-500 text-sm uppercase tracking-widest w-32">Weight</label>
            <input
              type="number"
              min={1}
              value={tmWeight}
              onChange={e => setTmWeight(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-3 py-2 w-28 focus:outline-none focus:border-green-400"
              placeholder="0"
            />
            <span className="text-zinc-500">lb</span>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-zinc-500 text-sm uppercase tracking-widest w-32">Increment</label>
            <input
              type="number"
              min={1}
              value={tmIncrement}
              onChange={e => setTmIncrement(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-3 py-2 w-28 focus:outline-none focus:border-green-400"
            />
            <span className="text-zinc-500">lb</span>
          </div>
        </div>
        <div className="flex gap-4 mt-8">
          <button
            onClick={() => setSettingTm(null)}
            className="border border-zinc-700 px-4 py-2 font-mono text-zinc-100"
          >
            BACK
          </button>
          <button
            onClick={handleSaveTm}
            className="border border-green-400 text-green-400 px-6 py-2 font-mono"
          >
            SAVE
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-zinc-950 z-50 p-4 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="text-zinc-500 uppercase text-xs tracking-widest">
          --- SELECT ASSISTANCE EXERCISE ---------------
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100 font-mono">✕</button>
      </div>
      <div className="space-y-1">
        {rows.map(row => (
          <button
            key={row.exercise.id}
            onClick={() => handleSelect(row)}
            disabled={row.alreadyAdded}
            className={`w-full text-left px-3 py-2 border font-mono text-sm flex justify-between ${
              row.alreadyAdded
                ? 'border-zinc-800 text-zinc-600'
                : 'border-zinc-700 text-zinc-100 hover:border-green-400 hover:text-green-400'
            }`}
          >
            <span>{row.exercise.name}{row.alreadyAdded ? ' ✓' : ''}</span>
            <span className="text-zinc-500">
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
