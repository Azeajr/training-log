// The service worker's half of the diagnostic trace.
//
// A service worker cannot reach `localStorage`, so the page's sink
// (src/lib/trace.ts) is unavailable to it — and the SW is exactly where the
// most valuable evidence is. Every script evaluation of this worker is a fresh
// START, which means the previous one was terminated; that single fact turns
// "the SW notification did not arrive" from a guess into a record.
//
// IndexedDB is the store both sides can see: the SW writes, the page reads it
// back at export time and merges it into one timeline. Writes are async and
// fire-and-forget, so a worker killed mid-write loses that record — acceptable,
// because the gap it leaves is itself the finding.
//
// The enable flag also lives here rather than in localStorage, so the SW can
// read its own switch without asking the page.

import type { TraceEvent } from './trace'

const DB_NAME = 'notif-trace-sw'
const DB_VERSION = 1
const EVENTS = 'events'
const META = 'meta'
const ENABLED_KEY = 'enabled'
// Low-frequency by nature — boots, installs, schedules, fires — so this holds
// many SW lifetimes rather than many minutes.
const MAX_EVENTS = 500

interface SwRecord {
  t: number
  ev: string
  d?: Record<string, unknown>
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(EVENTS)) db.createObjectStore(EVENTS, { autoIncrement: true })
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      // A blocked upgrade must not hang a caller that is only trying to log.
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
    tx.onabort = () => resolve()
  })
}

export async function swTraceSetEnabled(on: boolean): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put(on, ENABLED_KEY)
    await done(tx)
  } catch {
    // Diagnostics must never take down the thing they are diagnosing.
  } finally {
    db.close()
  }
}

export async function swTraceIsEnabled(): Promise<boolean> {
  const db = await openDb()
  if (!db) return false
  try {
    const tx = db.transaction(META, 'readonly')
    const req = tx.objectStore(META).get(ENABLED_KEY)
    await done(tx)
    return req.result === true
  } catch {
    return false
  } finally {
    db.close()
  }
}

// Read once per script evaluation and cached for this worker's life. A service
// worker rarely survives 30 s, so the flag propagates within about one bell —
// and paying an IndexedDB read per event would change the timing of the very
// path being measured.
let enabledCache: Promise<boolean> | null = null

export function swTraceResetCache(): void {
  enabledCache = null
}

/** Fire-and-forget: callers in the SW must not await their own instrumentation. */
export function swTrace(ev: string, d?: Record<string, unknown>): void {
  void (async () => {
    enabledCache ??= swTraceIsEnabled()
    if (!(await enabledCache)) return
    const db = await openDb()
    if (!db) return
    try {
      const tx = db.transaction(EVENTS, 'readwrite')
      const store = tx.objectStore(EVENTS)
      store.add({ t: Date.now(), ev, d } satisfies SwRecord)
      await done(tx)
      await trim(db)
    } catch {
      // As above: a failed log is not a failed notification.
    } finally {
      db.close()
    }
  })()
}

async function trim(db: IDBDatabase): Promise<void> {
  try {
    const countTx = db.transaction(EVENTS, 'readonly')
    const countReq = countTx.objectStore(EVENTS).count()
    await done(countTx)
    const over = countReq.result - MAX_EVENTS
    if (over <= 0) return
    const tx = db.transaction(EVENTS, 'readwrite')
    const store = tx.objectStore(EVENTS)
    // Keys are auto-increment, so a forward cursor walks oldest-first.
    let dropped = 0
    const cursorReq = store.openCursor()
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result
      if (!cursor || dropped >= over) return
      cursor.delete()
      dropped++
      cursor.continue()
    }
    await done(tx)
  } catch {
    // An untrimmed log is still a usable log.
  }
}

/** Everything the worker recorded, oldest first, in page-trace shape. */
export async function swTraceRead(): Promise<TraceEvent[]> {
  const db = await openDb()
  if (!db) return []
  try {
    const tx = db.transaction(EVENTS, 'readonly')
    const req = tx.objectStore(EVENTS).getAll()
    await done(tx)
    const rows = (req.result ?? []) as SwRecord[]
    return rows
      .filter(r => r != null && typeof r.t === 'number' && typeof r.ev === 'string')
      .map((r, i) => ({ seq: i, t: r.t, p: 0, src: 'sw' as const, ev: r.ev, d: r.d }))
  } catch {
    return []
  } finally {
    db.close()
  }
}

export async function swTraceClear(): Promise<void> {
  const db = await openDb()
  if (!db) return
  try {
    const tx = db.transaction(EVENTS, 'readwrite')
    tx.objectStore(EVENTS).clear()
    await done(tx)
  } catch {
    // Nothing to do — the caller wanted it gone and it may already be.
  } finally {
    db.close()
  }
}
