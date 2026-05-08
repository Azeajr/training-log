import { createMemo, Show } from 'solid-js'
import { settings } from '../store/settingsStore'
import { calcPlatesPerSide } from '../../src/lib/calc'

interface Props {
  weight: number
}

export default function PlateDisplay(props: Props) {
  const result = createMemo(() => calcPlatesPerSide(props.weight, settings.barWeight, settings.plates))

  const items = createMemo(() => {
    const r = result()
    if (!r) return null
    const out: number[] = []
    for (const { weight: w, count } of r) {
      for (let i = 0; i < count; i++) out.push(w)
    }
    return out
  })

  return (
    <Show when={result() !== null}>
      <div class="text-faint text-xs font-mono mt-1">
        <Show
          when={items()!.length > 0}
          fallback="bar only"
        >
          {`each side: ${items()!.join(' · ')}`}
        </Show>
      </div>
    </Show>
  )
}
