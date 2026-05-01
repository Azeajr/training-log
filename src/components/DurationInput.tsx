import { useState } from 'react'
import { toSeconds, fromSeconds } from '../lib/calc'

interface Props {
  value: number | null
  onChange: (seconds: number) => void
}

export default function DurationInput({ value, onChange }: Props) {
  const initial = value != null ? fromSeconds(value) : { mm: 0, ss: 0 }
  const [mm, setMm] = useState(String(initial.mm))
  const [ss, setSs] = useState(String(initial.ss).padStart(2, '0'))

  const commit = () => {
    const m = Math.max(0, parseInt(mm) || 0)
    const s = Math.min(59, Math.max(0, parseInt(ss) || 0))
    onChange(toSeconds(m, s))
  }

  return (
    <div className="flex items-center gap-1 font-mono">
      <input
        type="number"
        min={0}
        value={mm}
        onChange={e => setMm(e.target.value)}
        onBlur={commit}
        className="bg-zinc-900 border border-zinc-700 text-zinc-100 px-2 py-1 w-14 text-center focus:outline-none focus:border-green-400"
        placeholder="0"
      />
      <span className="text-zinc-500">:</span>
      <input
        type="number"
        min={0}
        max={59}
        value={ss}
        onChange={e => setSs(e.target.value)}
        onBlur={commit}
        className="bg-zinc-900 border border-zinc-700 text-zinc-100 px-2 py-1 w-14 text-center focus:outline-none focus:border-green-400"
        placeholder="00"
      />
    </div>
  )
}
