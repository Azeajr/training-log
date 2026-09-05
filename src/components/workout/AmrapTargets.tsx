import { For, Show } from 'solid-js'
import type { AmrapTarget } from '../../lib/calc'

interface Props {
  targets: AmrapTarget[]
  /** Fills the reps field with a target. Omit for a read-only readout. */
  onPick?: (reps: number) => void
}

// The rep goals for this AMRAP. They used to be inert text sitting directly
// above a stepper the user then tapped nine times to reach one of them — so
// when a picker is wired, each target is the fastest way to enter its own number.
export default function AmrapTargets(props: Props) {
  return (
    <Show when={props.targets.length > 0}>
      <div class="mt-1 space-y-0.5">
        <For each={props.targets}>
          {t => (
            <Show
              when={props.onPick}
              fallback={
                <div class="text-xs text-warn font-mono">
                  -&gt; {t.label.toUpperCase().padEnd(14)} {t.reps} reps{' '}
                  <span class="text-muted">({t.est1RM}lb est. 1RM)</span>
                </div>
              }
            >
              <button
                onClick={() => props.onPick!(t.reps)}
                aria-label={`Set reps to ${t.reps} — ${t.label}`}
                class="block w-full text-left text-xs text-warn font-mono hover:text-accent"
              >
                -&gt; {t.label.toUpperCase().padEnd(14)}{' '}
                <span class="underline underline-offset-2 decoration-faint">{t.reps} reps</span>{' '}
                <span class="text-muted">({t.est1RM}lb est. 1RM)</span>
              </button>
            </Show>
          )}
        </For>
      </div>
    </Show>
  )
}
