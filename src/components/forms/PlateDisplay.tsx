import { createMemo, Show } from 'solid-js'
import { settings } from '../../store/settings-store'
import { calcPlates } from '../../lib/calc'
import type { PlateLoading } from '../../lib/plate-loading'

interface Props {
  weight: number
  // Resolved loading for this set. Callers gate rendering on a non-null loading
  // (mode 'none' means no readout), so this is always present here.
  loading: PlateLoading
}

export default function PlateDisplay(props: Props) {
  const result = createMemo(() =>
    calcPlates(props.weight, props.loading.base, props.loading.mode, settings.plates)
  )

  const items = createMemo(() => {
    const r = result()
    if (!r) return null
    const out: number[] = []
    for (const { weight: w, count } of r) {
      for (let i = 0; i < count; i++) out.push(w)
    }
    return out
  })

  const label = () => (props.loading.mode === 'paired' ? 'each side' : 'plates')
  const emptyLabel = () => (props.loading.mode === 'paired' ? 'bar only' : 'no plates')

  // Three outcomes, three readouts. `null` used to render nothing at all, so a
  // load the plate set cannot make was indistinguishable from a set with no
  // plate hint — the line simply disappeared and the lifter was left to work
  // out why (F27). Say it instead.
  return (
    <div class="text-faint text-xs font-mono mt-1">
      <Show when={result() !== null} fallback={<span class="text-warn">not loadable with your plates</span>}>
        <Show when={items()!.length > 0} fallback={emptyLabel()}>
          {`${label()}: ${items()!.join(' · ')}`}
        </Show>
      </Show>
    </div>
  )
}
