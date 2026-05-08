import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Components start async DB chains in useEffect. Test assertions can pass
// mid-chain, leaving pending awaits that hit db.delete() in the next
// beforeEach. One setTimeout(0) drains all pending fake-indexeddb microtasks
// before the DB is torn down.
afterEach(async () => {
  cleanup()
  await new Promise(r => setTimeout(r, 0))
})

// Vitest's jsdom doesn't always expose a functional localStorage.
// Provide a working in-memory implementation so Zustand's persist middleware works.
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

// recharts uses ResizeObserver internally
window.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
