import { For, Show } from 'solid-js'
import type { WarmupSet, MainSet, FslSet } from '../../lib/calc'

interface Props {
  warmup: WarmupSet[]
  main: MainSet[]
  fsl: FslSet[]
}

export default function SessionPreview(props: Props) {
  return (
    <div class="space-y-4 font-mono text-sm">
      <div>
        <div class="text-muted uppercase text-xs tracking-widest mb-1">WARM UP</div>
        <For each={props.warmup}>
          {s => (
            <div class="flex gap-4 text-text-dim pl-2">
              <span class="w-16 text-right">{s.weight}lb</span>
              <span>x {s.reps}</span>
            </div>
          )}
        </For>
      </div>
      <div>
        <div class="text-muted uppercase text-xs tracking-widest mb-1">MAIN</div>
        <For each={props.main}>
          {s => (
            <div class="flex gap-4 text-text pl-2">
              <span class="w-16 text-right">{s.weight}lb</span>
              <span>x {s.reps}{s.isAmrap ? '+' : ''}</span>
              <Show when={s.isAmrap}>
                <span class="text-warn text-xs">AMRAP</span>
              </Show>
            </div>
          )}
        </For>
      </div>
      <div>
        <div class="text-muted uppercase text-xs tracking-widest mb-1">FSL  5 x 10</div>
        <Show when={props.fsl.length > 0}>
          <div class="flex gap-4 text-text-dim pl-2">
            <span class="w-16 text-right">{props.fsl[0].weight}lb</span>
            <span>x {props.fsl[0].reps}</span>
          </div>
        </Show>
      </div>
    </div>
  )
}
