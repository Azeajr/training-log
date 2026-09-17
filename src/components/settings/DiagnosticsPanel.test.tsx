import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import DiagnosticsPanel from './DiagnosticsPanel'
import { ConfirmationContext, createConfirmation } from '../../hooks/use-confirmation'
import ConfirmationDialog from '../../components/modals/ConfirmationDialog'
import { trace, readTrace, reloadTrace, isTraceEnabled } from '../../lib/trace'
import { toast } from '../../store/toast-store'

vi.mock('../../lib/audio-cues', () => ({
  playCue: vi.fn(),
}))

vi.mock('../../lib/trace-sw-store', () => ({
  swTraceRead: vi.fn(async () => []),
  swTraceSetEnabled: vi.fn(async () => undefined),
  swTraceClear: vi.fn(async () => undefined),
}))

function renderPanel() {
  const api = createConfirmation()
  return render(() => (
    <ConfirmationContext.Provider value={api}>
      <DiagnosticsPanel />
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  ))
}

const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0)) }

beforeEach(() => {
  localStorage.clear()
  reloadTrace()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  reloadTrace()
})

describe('DiagnosticsPanel', () => {
  it('starts off, and switching it on records from that moment', async () => {
    renderPanel()
    expect(screen.getByText('OFF')).toBeInTheDocument()
    expect(isTraceEnabled()).toBe(false)

    fireEvent.click(screen.getByText('OFF'))
    await waitFor(() => expect(screen.getByText('ON')).toBeInTheDocument())
    expect(isTraceEnabled()).toBe(true)
    // The switch itself is the first record, so a log never opens with an
    // unexplained edge.
    expect(readTrace().map(e => e.ev)).toContain('trace.on')
  })

  it('switches the service worker half on with the same tap', async () => {
    const { swTraceSetEnabled } = await import('../../lib/trace-sw-store')
    renderPanel()
    fireEvent.click(screen.getByText('OFF'))
    await waitFor(() => expect(swTraceSetEnabled).toHaveBeenCalledWith(true))
  })

  it('reports how much has been captured', async () => {
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
    trace('rest.start')
    trace('worker.tick')
    renderPanel()
    expect(screen.getByTestId('trace-stats')).toHaveTextContent('2 events')
  })

  it('copies the export to the clipboard', async () => {
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
    trace('rest.start')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPanel()
    fireEvent.click(screen.getByText('COPY'))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(String(writeText.mock.calls[0][0])).toContain('rest.start')
    await waitFor(() => expect(toast()).toBe('Trace copied'))
  })

  it('falls back to showing the text when the clipboard refuses', async () => {
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
    trace('rest.start')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new DOMException('NotAllowedError')) },
      configurable: true,
    })
    renderPanel()
    fireEvent.click(screen.getByText('COPY'))
    // An installed iOS PWA is exactly where a clipboard write gets refused, so
    // this path is the one that has to work.
    await waitFor(() => expect(screen.getByTestId('trace-text')).toBeInTheDocument())
    expect(screen.getByTestId('trace-text')).toHaveTextContent('rest.start')
  })

  it('shows the raw text on request', async () => {
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
    trace('notify.arm')
    renderPanel()
    fireEvent.click(screen.getByText('SHOW'))
    await waitFor(() => expect(screen.getByTestId('trace-text')).toHaveTextContent('notify.arm'))
  })

  it('asks before discarding, and keeps everything on a cancel', async () => {
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
    trace('rest.start')
    renderPanel()
    fireEvent.click(screen.getByText('CLEAR'))
    await waitFor(() => expect(screen.getByText('Discard the recorded trace?')).toBeInTheDocument())
    fireEvent.click(screen.getByText('CANCEL'))
    await drain()
    expect(readTrace()).toHaveLength(1)
  })

  it('discards both halves on confirm', async () => {
    const { swTraceClear } = await import('../../lib/trace-sw-store')
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
    trace('rest.start')
    renderPanel()
    fireEvent.click(screen.getByText('CLEAR'))
    await waitFor(() => expect(screen.getByText('DISCARD')).toBeInTheDocument())
    fireEvent.click(screen.getByText('DISCARD'))
    await waitFor(() => expect(readTrace()).toHaveLength(0))
    expect(swTraceClear).toHaveBeenCalled()
  })

  it('offers SHARE only where the platform has it', () => {
    renderPanel()
    expect(screen.queryByText('SHARE')).toBeNull()
  })
})

// ── TEST CUE ────────────────────────────────────────────────────────────────
// The bell is otherwise 90 seconds per attempt, and it lands within half a
// second of the system notification sound, which masks a 150 ms tone outright.
// A tap has nothing to confuse it with — and a gesture is the one context where
// iOS reliably lets an AudioContext resume, so a cue inaudible here is
// inaudible for reasons below the app.
describe('TEST CUE', () => {
  it('plays the real cue on a real tap', async () => {
    const { playCue } = await import('../../lib/audio-cues')
    renderPanel()
    fireEvent.click(screen.getByText('TEST CUE'))
    expect(playCue).toHaveBeenCalledWith('nudge')
  })

  it('records the tap when tracing is on, so a capture shows it was requested', async () => {
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
    renderPanel()
    fireEvent.click(screen.getByText('TEST CUE'))
    expect(readTrace().map(e => e.ev)).toContain('cue.test')
  })

  it('works with tracing off — it is a speaker test, not a trace feature', async () => {
    const { playCue } = await import('../../lib/audio-cues')
    renderPanel()
    fireEvent.click(screen.getByText('TEST CUE'))
    expect(playCue).toHaveBeenCalled()
    expect(readTrace()).toHaveLength(0)
  })
})
