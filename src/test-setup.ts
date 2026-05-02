import '@testing-library/jest-dom'

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
