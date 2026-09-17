import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { createRestTimer, type RestTimerMessage } from './workers/rest-timer-protocol'

// jsdom has no Worker. The only Worker the app constructs under test is the
// rest timer (workers/timer.worker.ts) — the SQLite worker is aliased away by
// the /sqlite-client$/ → sqlite-test-client swap.
//
// This drives the REAL protocol rather than re-implementing it. It used to be a
// second implementation, and it was the only one any test exercised, so the two
// had silently diverged on `pause` and on `start` without restStartedAt (F87).
// Only message DELIVERY differs now: this calls onmessage synchronously, where
// a real Worker delivers through a port.
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  private timer = createRestTimer(
    (tick) => { this.onmessage?.(new MessageEvent('message', { data: tick })) },
    (beat) => { this.onmessage?.(new MessageEvent('message', { data: beat })) },
  )

  postMessage(data: unknown) {
    this.timer.handle(data as RestTimerMessage)
  }

  terminate() {
    this.timer.terminate()
  }
}

Object.defineProperty(globalThis, 'Worker', { value: MockWorker, writable: true, configurable: true })

// Components start async DB chains on mount. Test assertions can pass
// mid-chain, leaving pending awaits that would hit a cleared table in the next
// beforeEach. One setTimeout(0) drains those pending continuations before the
// DB is reset.
afterEach(async () => {
  await new Promise(r => setTimeout(r, 0))
})

// Vitest's jsdom doesn't always expose a functional localStorage.
const makeLocalStorage = () => {
  const store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value) },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { Object.keys(store).forEach(k => delete store[k]) },
    get length() { return Object.keys(store).length },
    key: (i: number) => Object.keys(store)[i] ?? null,
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: makeLocalStorage(),
  writable: true,
})

// jsdom doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = () => {}
