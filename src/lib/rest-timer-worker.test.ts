// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom has no Worker; a fake capturing constructor args pins OUR wiring —
// the singleton contract and the worker entry/type — not the platform.
class FakeWorker {
  static instances: FakeWorker[] = []
  readonly url: URL | string
  readonly options?: WorkerOptions
  constructor(url: URL | string, options?: WorkerOptions) {
    this.url = url
    this.options = options
    FakeWorker.instances.push(this)
  }
}

type Mod = typeof import('./rest-timer-worker')
const loadModule = (): Promise<Mod> => import('./rest-timer-worker')

beforeEach(() => {
  vi.resetModules()
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getTimerWorker', () => {
  it('constructs a module worker pointed at timer.worker', async () => {
    const { getTimerWorker } = await loadModule()
    const w = getTimerWorker()
    expect(w).toBeInstanceOf(FakeWorker)
    expect(FakeWorker.instances).toHaveLength(1)
    expect(String(FakeWorker.instances[0].url)).toMatch(/timer\.worker/)
    expect(FakeWorker.instances[0].options).toMatchObject({ type: 'module' })
  })

  it('reuses the same worker across calls (singleton)', async () => {
    const { getTimerWorker } = await loadModule()
    const first = getTimerWorker()
    const second = getTimerWorker()
    expect(second).toBe(first)
    expect(FakeWorker.instances).toHaveLength(1)
  })
})
