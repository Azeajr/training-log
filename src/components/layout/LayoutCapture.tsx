import { createSignal, onCleanup, onMount, Show } from 'solid-js'
import { useLocation } from '@solidjs/router'
import { isTraceEnabled, subscribeTraceEnabled } from '../../lib/trace'
import { captureLayout } from '../../lib/layout-trace'
import { showToast } from '../../store/toast-store'

// One tap can reach us as pointerdown and then a click; two captures would
// spend the log's byte budget on the same moment.
const DEDUPE_MS = 500
// Settings hosts the controls (stopping included); the wizard has no workout
// layout to diagnose.
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
    showToast(captureLayout()
      ? 'Issue captured — stop and share the trace in Settings → Diagnostics'
      : 'Capture failed — see the trace for layout.unavailable')
  }
  const available = () => enabled() && !HIDDEN_ON.includes(location.pathname)
  onMount(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!available() || event.repeat || event.ctrlKey || event.metaKey || !event.altKey || !event.shiftKey || event.code !== 'KeyC') return
      event.preventDefault()
      capture()
    }
    document.addEventListener('keydown', onKeyDown, true)
    onCleanup(() => document.removeEventListener('keydown', onKeyDown, true))
  })
  // Kept to one narrow button in the corner: every screen's top row sits under
  // it, and at full width it swallowed taps meant for the Workout lift header.
  return <Show when={available()}>
    <button
      data-layout-anchor="capture-control"
      aria-label="Capture issue"
      aria-keyshortcuts="Alt+Shift+C"
      title="Capture issue (Alt+Shift+C), including while a dialog is open"
      class="fixed top-[env(safe-area-inset-top,0px)] right-0 z-[90] bg-bg border border-accent text-accent px-2 py-2 text-xs"
      // Keep focus where it was (e.g. inside a focus-trapped modal): a mouse
      // press would otherwise move it onto this button.
      onMouseDown={event => event.preventDefault()}
      // Pointer capture precedes focus/blur (and possible keyboard dismissal).
      onPointerDown={event => { if (event.isPrimary) capture() }}
      // Keyboard activation has no pointerdown, so capture here instead.
      onClick={event => { if (event.detail === 0) capture() }}
    ><span class="text-danger" aria-hidden="true">●</span> REC</button>
  </Show>
}
