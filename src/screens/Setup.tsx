import { useState } from 'react'
import { db } from '../db/db'

interface Props {
  onComplete: () => void
}

const LIFTS = ['OHP', 'Bench', 'Squat', 'Deadlift'] as const

export default function Setup({ onComplete }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [tms, setTms] = useState<Record<string, string>>({
    OHP: '', Bench: '', Squat: '', Deadlift: '',
  })

  const allValid = LIFTS.every(l => {
    const v = Number(tms[l])
    return Number.isFinite(v) && v > 0
  })

  const handleComplete = async () => {
    const now = new Date()
    const lifts = await db.lifts.toArray()
    for (const lift of lifts) {
      await db.trainingMaxes.add({
        liftId: lift.id!,
        weight: Number(tms[lift.name]),
        setAt: now,
      })
    }
    await db.cycles.add({ number: 1, startDate: now, endDate: null })
    onComplete()
  }

  if (step === 1) {
    return (
      <div className="p-4 max-w-sm mx-auto pt-12">
        <div className="text-zinc-500 uppercase text-xs tracking-widest mb-6">
          --- SETUP . STEP 1/2 ---------------------
        </div>
        <div className="text-zinc-100 mb-6">Enter your training maxes (lbs):</div>
        <div className="space-y-4">
          {LIFTS.map(lift => (
            <div key={lift} className="flex items-center gap-4">
              <label className="text-zinc-500 w-20 text-sm uppercase tracking-widest">{lift}</label>
              <input
                type="number"
                min={1}
                value={tms[lift]}
                onChange={e => setTms(prev => ({ ...prev, [lift]: e.target.value }))}
                className="bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono px-3 py-2 w-32 focus:outline-none focus:border-green-400"
                placeholder="0"
              />
              <span className="text-zinc-500 text-sm">lb</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setStep(2)}
          disabled={!allValid}
          className="mt-8 border border-green-400 text-green-400 px-6 py-2 font-mono disabled:border-zinc-700 disabled:text-zinc-500"
        >
          NEXT
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-sm mx-auto pt-12">
      <div className="text-zinc-500 uppercase text-xs tracking-widest mb-6">
        --- SETUP . STEP 2/2 ---------------------
      </div>
      <div className="text-zinc-100 mb-4">Confirm training maxes:</div>
      <div className="border border-zinc-700 p-4 space-y-2 mb-8">
        {LIFTS.map(lift => (
          <div key={lift} className="flex justify-between">
            <span className="text-zinc-500 uppercase text-sm tracking-widest">{lift}</span>
            <span className="text-zinc-100">{tms[lift]} lb</span>
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <button
          onClick={() => setStep(1)}
          className="border border-zinc-700 px-4 py-2 font-mono text-zinc-100 hover:border-green-400 hover:text-green-400"
        >
          BACK
        </button>
        <button
          onClick={handleComplete}
          className="border border-green-400 text-green-400 px-6 py-2 font-mono"
        >
          START TRAINING
        </button>
      </div>
    </div>
  )
}
