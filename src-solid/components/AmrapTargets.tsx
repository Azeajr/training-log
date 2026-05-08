import { For, Show } from 'solid-js'
import type { AmrapTarget } from '../../src/lib/calc'

interface Props {
  targets: AmrapTarget[]
}

export default function AmrapTargets(props: Props) {
  return (
    <Show when={props.targets.length > 0}>
      <div class="mt-1 space-y-0.5">
        <For each={props.targets}>
          {t => (
            <div class="text-xs text-warn font-mono">
              -&gt; {t.label.toUpperCase().padEnd(14)} {t.reps} reps{' '}
              <span class="text-muted">({t.est1RM}lb est. 1RM)</span>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}
