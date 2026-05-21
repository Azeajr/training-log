import { createSignal, createEffect, on } from 'solid-js'
import { toSeconds, fromSeconds } from '../../lib/calc'
import Stepper from './Stepper'

interface Props {
  value: number | null
  onChange: (seconds: number) => void
}

export default function DurationInput(props: Props) {
  const initial = props.value != null ? fromSeconds(props.value) : { mm: 0, ss: 0 }
  const [mm, setMm] = createSignal(initial.mm)
  const [ss, setSs] = createSignal(initial.ss)

  createEffect(on(() => props.value, v => {
    if (v == null) { setMm(0); setSs(0); return }
    const next = fromSeconds(v)
    if (next.mm !== mm()) setMm(next.mm)
    if (next.ss !== ss()) setSs(next.ss)
  }, { defer: true }))

  return (
    <div class="flex items-center gap-1 font-mono">
      <Stepper
        value={mm()}
        onChange={v => { setMm(v); props.onChange(toSeconds(v, ss())) }}
        step={1}
        min={0}
      />
      <span class="text-muted px-1">:</span>
      <Stepper
        value={ss()}
        onChange={v => { setSs(v); props.onChange(toSeconds(mm(), v)) }}
        step={1}
        min={0}
        max={59}
      />
    </div>
  )
}
