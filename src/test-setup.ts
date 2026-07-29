import '@testing-library/jest-dom'
import { afterEach } from 'vitest'

// jsdom has no Worker. The only Worker the app constructs under test is the
// rest timer (workers/timer.worker.ts) — the SQLite worker is aliased away by
// the /sqlite-client$/ → sqlite-test-client swap. So this stub only needs to
// speak the timer protocol.
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private startTime: number | null = null

  constructor() {}

  postMessage(data: unknown) {
    const msg = data as Record<string, unknown>

    if (msg.type === 'start') {
      this.startTime = (msg.restStartedAt as number) ?? Date.now()
      if (this.intervalId) clearInterval(this.intervalId)
      this.intervalId = setInterval(() => {
        if (this.startTime != null && this.onmessage) {
          this.onmessage(new MessageEvent('message', {
            data: { elapsed: Math.floor((Date.now() - this.startTime!) / 1000) },
          }))
        }
      }, 1000)
    } else if (msg.type === 'stop') {
      if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
      this.startTime = null
    } else if (msg.type === 'pause') {
      if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
    } else if (msg.type === 'resume') {
      if (this.startTime != null && !this.intervalId) {
        this.intervalId = setInterval(() => {
          if (this.startTime != null && this.onmessage) {
            this.onmessage(new MessageEvent('message', {
              data: { elapsed: Math.floor((Date.now() - this.startTime!) / 1000) },
            }))
          }
        }, 1000)
      }
    }
  }

  terminate() {
    if (this.intervalId) clearInterval(this.intervalId)
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
