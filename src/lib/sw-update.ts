import { createSignal, type Accessor } from 'solid-js'

/**
 * Registers the service worker and hands a new deploy to the page.
 *
 * The SW answers every navigation from its own precache (src/service-worker.ts),
 * so a page always belongs to the same deploy as the worker serving it. The
 * cost is that a deploy reaches the page only once its worker activates, and a
 * waiting worker activates by itself only when every window has closed — for a
 * home-screen app that is suspended rather than quit, that can be days. Two
 * things close the gap:
 *
 *   - `visibilitychange` → `registration.update()`. The browser looks for a new
 *     SW on navigations, and a single-page app resumed from the background
 *     makes none.
 *   - A worker that finishes installing while another one controls the page is
 *     offered as an update. Taking it posts SKIP_WAITING, and the page reloads
 *     when the new worker takes control, so no page runs on under a worker
 *     from another deploy.
 */

export const SW_URL = '/service-worker.js'

export interface SwUpdaterDeps {
  /** `navigator.serviceWorker`; undefined where service workers are unsupported. */
  container: ServiceWorkerContainer | undefined
  doc: Pick<Document, 'visibilityState' | 'addEventListener'>
  reload: () => void
}

export interface SwUpdater {
  /** True while a new deploy's worker is installed and waiting. */
  updateReady: Accessor<boolean>
  /** Activate the waiting worker. The page reloads once it takes control. */
  apply: () => void
  /** Register the SW and start watching for updates. Never rejects. */
  start: () => Promise<void>
}

export function createSwUpdater({ container, doc, reload }: SwUpdaterDeps): SwUpdater {
  const [waiting, setWaiting] = createSignal<ServiceWorker | null>(null)
  let reloading = false

  // Installed while another worker controls this page: that is an update. With
  // no controller it is the first install, which takes effect without asking.
  const offer = (worker: ServiceWorker | null | undefined) => {
    if (!worker || !container?.controller) return
    setWaiting(worker)
    worker.addEventListener('statechange', () => {
      // Replaced by a newer deploy before anyone took it.
      if (worker.state === 'redundant' && waiting() === worker) setWaiting(null)
    })
  }

  const watch = (worker: ServiceWorker | null | undefined) => {
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') offer(worker)
    })
  }

  async function start() {
    if (!container) return
    let registration: ServiceWorkerRegistration
    try {
      registration = await container.register(SW_URL, { scope: '/' })
    } catch {
      return
    }
    offer(registration.waiting)
    watch(registration.installing)
    registration.addEventListener('updatefound', () => watch(registration.installing))

    // Any change of controller means this page now runs under a worker from
    // another deploy, whether this window took the update or another one did.
    container.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      reload()
    })

    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState !== 'visible') return
      registration.update().catch(() => {}) // offline, or the registration is gone
    })
  }

  return {
    updateReady: () => waiting() !== null,
    apply: () => waiting()?.postMessage({ type: 'SKIP_WAITING' }),
    start,
  }
}
