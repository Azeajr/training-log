import { useState } from 'react'
import { toSeconds, fromSeconds } from '../lib/calc'
import Stepper from './Stepper'

interface Props {
  value: number | null
  onChange: (seconds: number) => void
}

export default function DurationInput({ value, onChange }: Props) {
  const initial = value != null ? fromSeconds(value) : { mm: 0, ss: 0 }
  const [mm, setMm] = useState(initial.mm)
  const [ss, setSs] = useState(initial.ss)

  const update = (newMm: number, newSs: number) => {
    onChange(toSeconds(newMm, newSs))
  }

  return (
    <div className="flex items-center gap-1 font-mono">
      <Stepper
        value={mm}
        onChange={v => { setMm(v); update(v, ss) }}
        step={1}
        min={0}
      />
      <span className="text-muted px-1">:</span>
      <Stepper
        value={ss}
        onChange={v => { setSs(v); update(mm, v) }}
        step={1}
        min={0}
        max={59}
      />
    </div>
  )
}
