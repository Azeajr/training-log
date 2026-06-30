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

  return (
    <Show when={result() !== null}>
      <div class="text-faint text-xs font-mono mt-1">
        <Show when={items()!.length > 0} fallback={emptyLabel()}>
          {`${label()}: ${items()!.join(' · ')}`}
        </Show>
      </div>
    </Show>
  )
}
