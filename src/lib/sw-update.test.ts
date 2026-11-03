import { describe, it, expect, vi } from 'vitest'
import { createSwUpdater, SW_URL } from './sw-update'

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installing'
  postMessage = vi.fn()
  moveTo(state: ServiceWorkerState) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null
  waiting: FakeWorker | null = null
  update = vi.fn(() => Promise.resolve())
  /** The browser found a new SW script and started installing it. */
  find(worker: FakeWorker) {
    this.installing = worker
    this.dispatchEvent(new Event('updatefound'))
  }
}

class FakeContainer extends EventTarget {
  controller: object | null
  registration = new FakeRegistration()
  constructor(controller: object | null) {
    super()
    this.controller = controller
  }
  register = vi.fn(() => Promise.resolve(this.registration))
}

class FakeDoc extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible'
}

function setup(controller: object | null = {}) {
  const container = new FakeContainer(controller)
  const doc = new FakeDoc()
  const reload = vi.fn()
  const updater = createSwUpdater({
    container: container as unknown as ServiceWorkerContainer,
    doc: doc as unknown as Document,
    reload,
  })
  return { container, registration: container.registration, doc, reload, updater }
}

describe('createSwUpdater', () => {
  it('registers the worker at the root scope', async () => {
    const { container, updater } = setup()
    await updater.start()
    expect(container.register).toHaveBeenCalledWith(SW_URL, { scope: '/' })
  })

  it('offers a worker that finishes installing while another one controls the page', async () => {
    const { registration, updater } = setup()
    await updater.start()
    const next = new FakeWorker()
    registration.find(next)
    expect(updater.updateReady()).toBe(false) // still installing
    next.moveTo('installed')
    expect(updater.updateReady()).toBe(true)
  })

  it('does not offer the first install: there is nothing to update from', async () => {
    const { registration, updater } = setup(null)
    await updater.start()
    const first = new FakeWorker()
    registration.find(first)
    first.moveTo('installed')
    expect(updater.updateReady()).toBe(false)
  })

  it('offers a worker that was already waiting when the page loaded', async () => {
    const { registration, updater } = setup()
    registration.waiting = new FakeWorker()
    registration.waiting.state = 'installed'
    await updater.start()
    expect(updater.updateReady()).toBe(true)
  })

  it('watches a worker that was mid-install when the page loaded', async () => {
    const { registration, updater } = setup()
    const next = new FakeWorker()
    registration.installing = next
    await updater.start()
    next.moveTo('installed')
    expect(updater.updateReady()).toBe(true)
  })

  it('withdraws the offer when a newer deploy replaces the waiting worker', async () => {
    const { registration, updater } = setup()
    await updater.start()
    const next = new FakeWorker()
    registration.find(next)
    next.moveTo('installed')
    next.moveTo('redundant')
    expect(updater.updateReady()).toBe(false)
  })

  it('keeps the newer offer when an older waiting worker goes redundant after it', async () => {
    const { registration, updater } = setup()
    await updater.start()
    const older = new FakeWorker()
    registration.find(older)
    older.moveTo('installed')
    const newer = new FakeWorker()
    registration.find(newer)
    newer.moveTo('installed')
    older.moveTo('redundant')
    expect(updater.updateReady()).toBe(true)
    updater.apply()
    expect(newer.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(older.postMessage).not.toHaveBeenCalled()
  })

  it('taking the update tells the waiting worker to activate', async () => {
    const { registration, updater } = setup()
    await updater.start()
    const next = new FakeWorker()
    registration.find(next)
    next.moveTo('installed')
    updater.apply()
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('does nothing when asked to apply with no update waiting', async () => {
    const { updater } = setup()
    await updater.start()
    expect(() => updater.apply()).not.toThrow()
  })

  it('reloads once when the controller changes, however many times it fires', async () => {
    const { container, reload, updater } = setup()
    await updater.start()
    container.dispatchEvent(new Event('controllerchange'))
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('checks for a new deploy when the app comes back to the foreground', async () => {
    const { doc, registration, updater } = setup()
    await updater.start()
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).not.toHaveBeenCalled()
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('swallows a failed update check (offline)', async () => {
    const { doc, registration, updater } = setup()
    registration.update.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')))
    await updater.start()
    doc.dispatchEvent(new Event('visibilitychange'))
    await Promise.resolve()
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('survives a registration that fails', async () => {
    const { container, updater } = setup()
    container.register.mockImplementation(() => Promise.reject(new DOMException('denied', 'SecurityError')))
    await expect(updater.start()).resolves.toBeUndefined()
    expect(updater.updateReady()).toBe(false)
  })

  it('is inert where service workers are unsupported', async () => {
    const updater = createSwUpdater({ container: undefined, doc: new FakeDoc() as unknown as Document, reload: vi.fn() })
    await expect(updater.start()).resolves.toBeUndefined()
    expect(updater.updateReady()).toBe(false)
    expect(() => updater.apply()).not.toThrow()
  })
})
