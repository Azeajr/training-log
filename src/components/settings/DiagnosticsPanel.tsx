import { createSignal, Show } from 'solid-js'
import { isTraceEnabled, setTraceEnabled, traceStats, clearTrace, trace } from '../../lib/trace'
import { buildTraceExport, formatTraceExport } from '../../lib/trace-export'
import { restThresholds } from '../../lib/calc'
import { playCue } from '../../lib/audio-cues'
import { settings } from '../../store/settings-store'
import { showToast } from '../../store/toast-store'
import { useConfirmation } from '../../hooks/use-confirmation'
import SectionLabel from '../layout/SectionLabel'

/**
 * The read-back end of the diagnostic trace.
 *
 * The failures this exists for are all silent and none of them reproduce on a
 * desktop, so the only way to see one has been to ask the user what they
 * noticed. This turns that into an artefact: switch it on, do the thing that
 * fails, come back and copy the log out.
 *
 * The raw text is offered on screen as well as through the clipboard and the
 * share sheet, because an installed iOS PWA is exactly where a clipboard write
 * is most likely to be refused — and a diagnostic the user cannot get out of
 * the phone is no diagnostic.
 */
export default function DiagnosticsPanel() {
  const { confirm } = useConfirmation()
  const [on, setOn] = createSignal(isTraceEnabled())
  const [stats, setStats] = createSignal(traceStats())
  const [text, setText] = createSignal<string | null>(null)
  const [busy, setBusy] = createSignal(false)

  const refresh = () => setStats(traceStats())

  const toggle = () => {
    const next = !on()
    setTraceEnabled(next)
    setOn(next)
    refresh()
  }

  const build = async (): Promise<string> =>
    formatTraceExport(await buildTraceExport({ thresholds: restThresholds(settings) }))

  const withBusy = async (fn: () => Promise<void>) => {
    if (busy()) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const copy = () => void withBusy(async () => {
    const t = await build()
    try {
      await navigator.clipboard.writeText(t)
      showToast('Trace copied', 2500)
    } catch {
      // Refused (no permission, no secure context, no gesture credit left).
      // Showing it is the fallback that always works.
      setText(t)
      showToast('Copy blocked — select the text below', 3500)
    }
  })

  const share = () => void withBusy(async () => {
    const t = await build()
    try {
      await navigator.share({ title: 'Training log trace', text: t })
    } catch (err) {
      // A cancelled share sheet is not a failure.
      if (err instanceof Error && err.name === 'AbortError') return
      setText(t)
      showToast('Share unavailable — select the text below', 3500)
    }
  })

  const show = () => void withBusy(async () => { setText(await build()) })

  const clear = () => void withBusy(async () => {
    const ok = await confirm('Discard the recorded trace?', {
      confirmLabel: 'DISCARD',
      destructive: true,
    })
    if (!ok) return
    clearTrace()
    setText(null)
    showToast('Trace cleared', 2000)
  })

  // Fires the real cue from a real touch. The bell is otherwise 90 seconds of
  // waiting per attempt, and it lands within half a second of the system
  // notification sound, which masks a 150 ms tone completely. On a tap there is
  // nothing to confuse it with — and a gesture is also the one context where
  // iOS reliably lets an AudioContext resume, so a cue that is inaudible HERE
  // is inaudible for reasons below the app.
  const testCue = () => {
    trace('cue.test', { requested: true })
    playCue('nudge')
    refresh()
  }

  const span = () => {
    const { first, last } = stats()
    if (first == null || last == null) return '—'
    const secs = Math.round((last - first) / 1000)
    return secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`
  }

  return (
    <div class="mb-6">
      <SectionLabel class="mb-2">DIAGNOSTICS</SectionLabel>
      <div class="text-faint text-xs mb-2">
        Start recording, reproduce the problem, then tap ● REC in the top corner
        while it is visible. Stop recording and share the trace here. No screenshot needed.
      </div>
      <button class="border border-accent text-accent px-3 py-2 text-xs uppercase tracking-widest" onClick={toggle}>
        {on() ? 'Stop recording' : 'Start recording'}
      </button>
      <div class="text-faint text-xs py-2" data-testid="trace-stats">
        {on() ? 'Recording' : 'Stopped'} · {stats().count} events · {span()}
        <Show when={stats().degraded}>
          <span class="text-warn"> · storage full, keeping the recent half only</span>
        </Show>
      </div>
      <div class="flex flex-wrap gap-2 mb-2">
        <button
          onClick={copy}
          disabled={busy()}
          class="border border-border px-3 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Copy trace
        </button>
        <Show when={typeof navigator !== 'undefined' && 'share' in navigator}>
          <button
            onClick={share}
            disabled={busy()}
            class="border border-border px-3 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Share trace
          </button>
        </Show>
      </div>
      <details>
        <summary class="text-muted text-xs cursor-pointer py-2">More options</summary>
        <p class="text-faint text-xs mb-2">
          Keeps recent layout, scrolling, viewport and focus changes, plus timer,
          sound and notification events. Notes and form values are excluded.
          Older events roll off the local log; stop recording to preserve it.
        </p>
        <div class="flex flex-wrap gap-2">
        <button
          onClick={testCue}
          class="border border-border px-3 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent"
        >
          Test sound
        </button>
        <button
          onClick={show}
          disabled={busy()}
          class="border border-border px-3 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent disabled:opacity-50"
        >
          Show trace
        </button>
        <button
          onClick={clear}
          disabled={busy()}
          class="border border-border px-3 py-2 text-danger text-xs uppercase tracking-widest hover:border-danger disabled:opacity-50"
        >
          Clear trace
        </button>
      </div>
      </details>
      <Show when={text()}>
        <pre
          data-testid="trace-text"
          class="mt-3 max-h-64 overflow-auto border border-border-dim p-2 text-faint text-[10px] leading-tight whitespace-pre-wrap select-text"
        >
          {text()}
        </pre>
      </Show>
    </div>
  )
}
