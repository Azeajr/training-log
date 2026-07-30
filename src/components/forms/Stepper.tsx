import { createSignal, Show, onCleanup } from 'solid-js'

interface Props {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  // Test hook only — feeds `data-testid`, never announced.
  label?: string
  // What this stepper adjusts, in the user's words ("weight", "reps",
  // "bar weight"). Names the −/+ buttons and the value announcement; without it
  // a screen reader gets "minus, button" with no indication of what it changes.
  fieldLabel?: string
}

const fmt = (v: number) => v % 1 === 0 ? String(v) : v.toFixed(1)
const safeAdd = (a: number, b: number) => Math.round((a + b) * 10) / 10

export default function Stepper(props: Props) {
  const step = () => props.step ?? 1
  const min = () => props.min ?? 0
  const max = () => props.max ?? Infinity

  const [editing, setEditing] = createSignal(false)
  const [raw, setRaw] = createSignal('')
  // Announcements are pushed here explicitly rather than mirroring props.value
  // through a live region: a repeating long-press fires every 80ms and would
  // flood the queue with values the user is scrubbing past. Discrete taps
  // announce immediately; a long-press announces once, on release.
  const [announced, setAnnounced] = createSignal('')
  const announce = (v: number) =>
    setAnnounced(`${props.fieldLabel ? `${props.fieldLabel} ` : ''}${fmt(v)}`)

  const LONG_PRESS_MS = 400
  const REPEAT_MS = 80
  let pressTimer: ReturnType<typeof setTimeout> | null = null
  let pressInterval: ReturnType<typeof setInterval> | null = null
  let pressStart = 0

  const clearPress = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null }
    // Only a press that actually reached the repeat phase owes an announcement;
    // a short tap is announced by applyStep on click instead.
    if (pressInterval) { clearInterval(pressInterval); pressInterval = null; announce(props.value) }
  }

  onCleanup(clearPress)

  const startPress = (delta: number) => {
    pressStart = Date.now()
    pressTimer = setTimeout(() => {
      pressInterval = setInterval(() => {
        const next = Math.min(max(), Math.max(min(), safeAdd(props.value, delta)))
        props.onChange(next)
      }, REPEAT_MS)
    }, LONG_PRESS_MS)
  }

  const wasLongPress = () => pressStart > 0 && Date.now() - pressStart >= LONG_PRESS_MS

  const applyStep = (delta: number) => {
    if (wasLongPress()) { pressStart = 0; return }
    pressStart = 0
    const v = Math.min(max(), Math.max(min(), safeAdd(props.value, delta)))
    props.onChange(v)
    announce(v)
    if (editing()) setRaw(fmt(v))
  }

  const commit = () => {
    const n = parseFloat(raw())
    if (!isNaN(n)) {
      const v = Math.min(max(), Math.max(min(), n))
      props.onChange(v)
      announce(v)
    }
    setEditing(false)
  }

  return (
    <div class="flex items-center font-mono" data-testid={props.label ? `stepper-${props.label}` : 'stepper'}>
      <button
        type="button"
        onClick={() => applyStep(-step())}
        onPointerDown={() => startPress(-step())}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        disabled={props.value <= min()}
        aria-label={props.fieldLabel ? `Decrease ${props.fieldLabel}` : 'Decrease'}
        class="border border-border text-muted px-2 py-3 hover:text-text active:bg-surface disabled:opacity-30 select-none touch-manipulation"
      >
        −
      </button>
      <Show
        when={editing()}
        fallback={
          <button
            type="button"
            data-testid="stepper-value"
            onClick={() => { setRaw(fmt(props.value)); setEditing(true) }}
            aria-label={props.fieldLabel ? `Edit ${props.fieldLabel}, currently ${fmt(props.value)}` : undefined}
            class="bg-surface border-y border-border text-text font-mono px-3 py-3 min-w-[2.5rem] text-center select-none touch-manipulation [-webkit-touch-callout:none]"
          >
            {fmt(props.value)}
          </button>
        }
      >
        <input
          type="number"
          data-testid="stepper-input"
          value={raw()}
          autofocus
          aria-label={props.fieldLabel}
          onInput={e => setRaw(e.currentTarget.value)}
          onBlur={commit}
          onKeyDown={e => e.key === 'Enter' && commit()}
          class="bg-surface border-y border-accent text-text font-mono px-2 py-3 w-16 text-center focus:outline-none text-base"
        />
      </Show>
      <button
        type="button"
        onClick={() => applyStep(step())}
        onPointerDown={() => startPress(step())}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        disabled={props.value >= max()}
        aria-label={props.fieldLabel ? `Increase ${props.fieldLabel}` : 'Increase'}
        class="border border-border text-muted px-2 py-3 hover:text-text active:bg-surface disabled:opacity-30 select-none touch-manipulation"
      >
        +
      </button>
      <span class="sr-only" role="status" aria-live="polite">{announced()}</span>
    </div>
  )
}
