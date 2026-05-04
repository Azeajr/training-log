import { useState } from 'react'
import { db } from '../db/db'
import { calcMainSets } from '../lib/calc'
import Rule from '../components/Rule'
import Stepper from '../components/Stepper'

interface Props {
  onComplete: () => void
}

const LIFTS = ['OHP', 'Bench', 'Squat', 'Deadlift'] as const

export default function Setup({ onComplete }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [tms, setTms] = useState<Record<string, number>>({
    OHP: 0, Bench: 0, Squat: 0, Deadlift: 0,
  })

  const MIN_TM = 45
  const allValid = LIFTS.every(l => tms[l] >= MIN_TM)

  const handleComplete = async () => {
    const now = new Date()
    const lifts = await db.lifts.toArray()
    for (const lift of lifts) {
      await db.trainingMaxes.add({
        liftId: lift.id!,
        weight: tms[lift.name],
        setAt: now,
      })
    }
    await db.cycles.add({ number: 1, startDate: now, endDate: null })
    onComplete()
  }

  if (step === 1) {
    return (
      <div className="p-4 max-w-sm mx-auto pt-12">
        <Rule label="SETUP . STEP 1/2" className="text-muted mb-6" />
        <div className="text-text mb-6">Enter your training maxes:</div>
        <div className="space-y-4">
          {LIFTS.map(lift => (
            <div key={lift}>
              <div className="flex items-center gap-4">
                <label className="text-muted w-20 text-sm uppercase tracking-widest">{lift}</label>
                <Stepper
                  value={tms[lift]}
                  onChange={v => setTms(prev => ({ ...prev, [lift]: v }))}
                  step={5}
                  min={MIN_TM}
                />
                <span className="text-muted text-sm">lb</span>
              </div>
              {tms[lift] >= MIN_TM && (
                <div className="text-faint text-xs font-mono mt-1 ml-24">
                  {'W1: ' + calcMainSets(tms[lift], 1).map(s => s.weight).join(' · ') + ' lb'}
                </div>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setStep(2)}
          disabled={!allValid}
          className="mt-8 border border-accent text-accent px-6 py-2 font-mono disabled:border-border disabled:text-muted"
        >
          NEXT
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-sm mx-auto pt-12">
      <Rule label="SETUP . STEP 2/2" className="text-muted mb-6" />
      <div className="text-text mb-4">Confirm training maxes:</div>
      <div className="border border-border p-4 space-y-3 mb-8">
        {LIFTS.map(lift => (
          <div key={lift}>
            <div className="flex justify-between">
              <span className="text-muted uppercase text-sm tracking-widest">{lift}</span>
              <span className="text-text font-mono">{tms[lift]} lb</span>
            </div>
            <div className="text-faint text-xs font-mono mt-0.5">
              {'W1: ' + calcMainSets(tms[lift], 1).map(s => s.weight).join(' · ') + ' lb'}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <button
          onClick={() => setStep(1)}
          className="border border-border px-4 py-2 font-mono text-text hover:border-accent hover:text-accent"
        >
          BACK
        </button>
        <button
          onClick={handleComplete}
          className="border border-accent text-accent px-6 py-2 font-mono"
        >
          START TRAINING
        </button>
      </div>
    </div>
  )
}
