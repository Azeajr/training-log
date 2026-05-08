import { createSignal, Show } from 'solid-js'

interface Props {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}

const fmt = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1)
const safeAdd = (a: number, b: number) => Math.round((a + b) * 10) / 10

export default function Stepper(props: Props) {
  const step = () => props.step ?? 1
  const min = () => props.min ?? 0
  const max = () => props.max ?? Infinity

  const [editing, setEditing] = createSignal(false)
  const [raw, setRaw] = createSignal('')

  const commit = () => {
    const n = parseFloat(raw())
    if (!isNaN(n)) props.onChange(Math.min(max(), Math.max(min(), n)))
    setEditing(false)
  }

  return (
    <div class="flex items-center font-mono">
      <button
        type="button"
        onClick={() => props.onChange(safeAdd(props.value, -step()))}
        disabled={props.value <= min()}
        class="border border-border text-muted px-2 py-3 hover:text-text active:bg-surface disabled:opacity-30"
      >
        −
      </button>
      <Show
        when={editing()}
        fallback={
          <button
            type="button"
            onClick={() => { setRaw(fmt(props.value)); setEditing(true) }}
            class="bg-surface border-y border-border text-text font-mono px-3 py-3 min-w-[2.5rem] text-center"
          >
            {fmt(props.value)}
          </button>
        }
      >
        <input
          type="number"
          value={raw()}
          autofocus
          onInput={e => setRaw(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
          class="bg-surface border-y border-accent text-text font-mono px-2 py-3 w-16 text-center focus:outline-none text-base"
        />
      </Show>
      <button
        type="button"
        onClick={() => props.onChange(safeAdd(props.value, step()))}
        disabled={props.value >= max()}
        class="border border-border text-muted px-2 py-3 hover:text-text active:bg-surface disabled:opacity-30"
      >
        +
      </button>
    </div>
  )
}
