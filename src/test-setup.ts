import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import * as calcLib from './lib/calc'

// jsdom has no Worker — provide a stub that handles timer and calc worker messages
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  private intervalId: ReturnType<typeof setInterval> | null = null
  private startTime: number | null = null

  constructor(_url: unknown, _opts?: unknown) {}

  postMessage(data: unknown) {
    const msg = data as Record<string, unknown>

    // Timer worker protocol
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
    // Calc worker protocol (id + fn + args)
    } else if (typeof msg.id === 'number' && typeof msg.fn === 'string') {
      const { id, fn, args } = msg as { id: number; fn: string; args: unknown[] }
      queueMicrotask(() => {
        if (!this.onmessage) return
        let result: unknown
        try {
          const calcFn = (calcLib as Record<string, unknown>)[fn]
          result = typeof calcFn === 'function' ? calcFn(...args) : null
        } catch {
          result = []
        }
        this.onmessage!(new MessageEvent('message', { data: { id, result } }))
      })
    }
  }

  terminate() {
    if (this.intervalId) clearInterval(this.intervalId)
  }
}

Object.defineProperty(globalThis, 'Worker', { value: MockWorker, writable: true, configurable: true })

// Components start async DB chains in useEffect. Test assertions can pass
// mid-chain, leaving pending awaits that hit db.delete() in the next
// beforeEach. One setTimeout(0) drains all pending fake-indexeddb microtasks
// before the DB is torn down.
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

// Tanstack Virtual uses ResizeObserver to measure scroll container
window.ResizeObserver = class ResizeObserver {
  private cb: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) { this.cb = cb }
  observe(target: Element) {
    // Report a realistic size so virtual scrollers render items
    this.cb([{
      target,
      contentRect: { height: 600, width: 400, top: 0, left: 0, right: 400, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRectReadOnly,
      borderBoxSize: [{ inlineSize: 400, blockSize: 600 }],
      contentBoxSize: [{ inlineSize: 400, blockSize: 600 }],
      devicePixelContentBoxSize: [{ inlineSize: 400, blockSize: 600 }],
    } as ResizeObserverEntry], this as unknown as ResizeObserver)
  }
  unobserve() {}
  disconnect() {}
}
