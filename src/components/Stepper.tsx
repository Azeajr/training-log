import { useState } from 'react'

interface Props {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}

const fmt = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1)
const safeAdd = (a: number, b: number) => Math.round((a + b) * 10) / 10

export default function Stepper({ value, onChange, step = 1, min = 0, max = Infinity }: Props) {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  const commit = () => {
    const n = parseFloat(raw)
    if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
    setEditing(false)
  }

  return (
    <div className="flex items-center font-mono">
      <button
        type="button"
        onClick={() => onChange(safeAdd(value, -step))}
        disabled={value <= min}
        className="border border-border text-muted px-2 py-3 hover:text-text active:bg-surface disabled:opacity-30"
      >
        −
      </button>
      {editing ? (
        <input
          type="number"
          value={raw}
          autoFocus
          onChange={e => setRaw(e.target.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
          className="bg-surface border-y border-accent text-text font-mono px-2 py-3 w-16 text-center focus:outline-none text-base"
        />
      ) : (
        <button
          type="button"
          onClick={() => { setRaw(fmt(value)); setEditing(true) }}
          className="bg-surface border-y border-border text-text font-mono px-3 py-3 min-w-[2.5rem] text-center"
        >
          {fmt(value)}
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange(safeAdd(value, step))}
        disabled={value >= max}
        className="border border-border text-muted px-2 py-3 hover:text-text active:bg-surface disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}
