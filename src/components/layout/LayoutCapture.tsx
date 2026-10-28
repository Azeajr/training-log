import { createSignal, onCleanup, Show } from 'solid-js'
import { useLocation } from '@solidjs/router'
import { isTraceEnabled, setTraceEnabled, subscribeTraceEnabled } from '../../lib/trace'
import { captureLayout } from '../../lib/layout-trace'
import { showToast } from '../../store/toast-store'

// One tap can reach us as pointerdown and then a click; two captures would
// spend the log's byte budget on the same moment.
const DEDUPE_MS = 500
// Settings hosts the controls; the wizard has no workout layout to diagnose.
const HIDDEN_ON = ['/settings', '/setup']

export default function LayoutCapture() {
  const location = useLocation()
  const [enabled, setEnabled] = createSignal(isTraceEnabled())
  onCleanup(subscribeTraceEnabled(setEnabled))
  let lastCapture = -Infinity
  const capture = () => {
    const now = performance.now()
    if (now - lastCapture < DEDUPE_MS) return
    lastCapture = now
    captureLayout()
    showToast('Issue captured — stop recording, then share the trace in Settings')
  }
  return <Show when={enabled() && !HIDDEN_ON.includes(location.pathname)}>
    <div class="fixed top-[env(safe-area-inset-top,0px)] right-2 z-[90] flex bg-bg border border-accent">
      <button
        data-layout-anchor="capture-control"
        class="text-accent px-3 py-2 text-xs"
        // Pointer capture precedes focus/blur (and possible keyboard dismissal).
        onPointerDown={event => { if (event.isPrimary) capture() }}
        // Keyboard activation has no pointerdown, so capture here instead.
        onClick={event => { if (event.detail === 0) capture() }}
      >Capture issue</button>
      <button class="border-l border-accent text-muted px-3 py-2 text-xs" onClick={() => {
        setTraceEnabled(false)
        showToast('Recording stopped — share the trace in Settings → Diagnostics')
      }}>Stop recording</button>
    </div>
  </Show>
}
