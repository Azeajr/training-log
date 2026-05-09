import { Show } from 'solid-js'
import { toast } from '../store/toastStore'

export default function Toast() {
  return (
    <Show when={toast()}>
      <div
        class="fixed left-1/2 -translate-x-1/2 z-50 font-mono text-xs tracking-widest uppercase bg-surface border border-accent text-accent px-4 py-2 pointer-events-none"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        {toast()}
      </div>
    </Show>
  )
}
