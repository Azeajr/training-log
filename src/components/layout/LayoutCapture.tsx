import { createSignal, onCleanup, Show } from 'solid-js'
import { useLocation } from '@solidjs/router'
import { isTraceEnabled, setTraceEnabled, subscribeTraceEnabled } from '../../lib/trace'
import { captureLayout } from '../../lib/layout-trace'
import { showToast } from '../../store/toast-store'

export default function LayoutCapture() {
  const location = useLocation()
  const [enabled, setEnabled] = createSignal(isTraceEnabled())
  onCleanup(subscribeTraceEnabled(setEnabled))
  return <Show when={enabled() && location.pathname !== '/settings'}>
    <div class="fixed top-[env(safe-area-inset-top,0px)] right-2 z-[90] flex bg-bg border border-accent">
      <button
        data-layout-anchor="capture-control"
        class="text-accent px-3 py-2 text-xs"
        onPointerDown={() => captureLayout()}
        onClick={event => {
          // Pointer capture precedes focus/blur (and possible keyboard dismissal).
          // Keyboard activation has no pointerdown, so capture here instead.
          if (event.detail === 0) captureLayout()
          showToast('Issue captured — stop recording, then share the trace in Settings')
        }}
      >Capture issue</button>
      <button class="border-l border-accent text-muted px-3 py-2 text-xs" onClick={() => {
        setTraceEnabled(false)
        showToast('Recording stopped — share the trace in Settings → Diagnostics')
      }}>Stop recording</button>
    </div>
  </Show>
}
