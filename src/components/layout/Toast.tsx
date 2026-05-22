import { Show } from 'solid-js'
import { toast } from '../../store/toast-store'
import { workout } from '../../store/workout-store'

export default function Toast() {
  // When the RestTimer card is showing it occupies the strip just above the
  // BottomNav. Raise the toast above the timer card so the text isn't
  // hidden behind it.
  const bottom = () => workout.isResting
    ? 'calc(env(safe-area-inset-bottom, 0px) + 10rem)'
    : 'calc(env(safe-area-inset-bottom, 0px) + 4.25rem)'

  return (
    <Show when={toast()}>
      <div
        class="fixed left-1/2 -translate-x-1/2 z-50 font-mono text-xs tracking-widest uppercase bg-surface border border-accent text-accent px-4 py-2 pointer-events-none"
        style={{ bottom: bottom() }}
      >
        {toast()}
      </div>
    </Show>
  )
}
