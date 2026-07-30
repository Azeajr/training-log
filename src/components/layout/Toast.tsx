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

  // The live region is always mounted, not swapped in with the toast: a region
  // inserted into the DOM at the same time as its text is inconsistently
  // announced. Keeping the container and mutating only its text is the reliable
  // pattern. `role="status"` implies aria-live="polite"; both are stated so the
  // contract survives a future class/attribute edit.
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      class="fixed left-1/2 -translate-x-1/2 z-50 font-mono text-xs tracking-widest uppercase pointer-events-none"
      style={{ bottom: bottom() }}
    >
      <Show when={toast()}>
        <div class="bg-surface border border-accent text-accent px-4 py-2">
          {toast()}
        </div>
      </Show>
    </div>
  )
}
