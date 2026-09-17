// One readable artefact out of two sinks.
//
// The page writes to localStorage (src/lib/trace.ts) and the service worker to
// IndexedDB (src/lib/trace-sw-store.ts), because those are the stores each side
// can reach. They are halves of one timeline, so the export merges them by wall
// clock and puts the environment at the top — the questions this is meant to
// answer all begin "on which device, in what mode, with what permission".

import { readTrace, traceStats, type TraceEvent } from './trace'
import { swTraceRead } from './trace-sw-store'

export interface TraceExport {
  v: 1
  generatedAt: number
  env: Record<string, unknown>
  stats: { page: number; sw: number; first: number | null; last: number | null; degraded: boolean }
  /** Page and SW records merged, oldest first. */
  events: TraceEvent[]
}

/** Every probe guarded: an export must never fail because one reading is
 *  unavailable, and "absent" is itself worth recording. */
function probe<T>(read: () => T): T | 'unavailable' {
  try {
    return read()
  } catch {
    return 'unavailable'
  }
}

function environment(): Record<string, unknown> {
  return {
    ua: probe(() => navigator.userAgent),
    // The distinction that decides which notification rules apply at all: iOS
    // only permits them in an INSTALLED PWA.
    standalone: probe(() => window.matchMedia('(display-mode: standalone)').matches),
    iosStandalone: probe(() => (navigator as { standalone?: boolean }).standalone ?? false),
    permission: probe(() => (typeof Notification === 'undefined' ? 'no-ctor' : Notification.permission)),
    swSupported: probe(() => 'serviceWorker' in navigator),
    swControlled: probe(() => navigator.serviceWorker?.controller != null),
    visibility: probe(() => document.visibilityState),
    online: probe(() => navigator.onLine),
    language: probe(() => navigator.language),
    tzOffset: probe(() => new Date().getTimezoneOffset()),
    screen: probe(() => `${screen.width}x${screen.height}@${devicePixelRatio}`),
    window: probe(() => `${window.innerWidth}x${window.innerHeight}`),
    cores: probe(() => navigator.hardwareConcurrency),
    vibrate: probe(() => 'vibrate' in navigator),
    wakeLock: probe(() => 'wakeLock' in navigator),
    audioContext: probe(() => typeof AudioContext !== 'undefined'),
    // Wall clock and monotonic origin together: a record's `t` and `p` can only
    // be compared against another device's if the origin is known.
    timeOrigin: probe(() => Math.round(performance.timeOrigin)),
  }
}

async function storageEstimate(): Promise<Record<string, unknown> | 'unavailable'> {
  try {
    if (!navigator.storage?.estimate) return 'unavailable'
    const { usage, quota } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return 'unavailable'
  }
}

export async function buildTraceExport(extra?: Record<string, unknown>): Promise<TraceExport> {
  const page = readTrace()
  const sw = await swTraceRead()
  const events = [...page, ...sw].sort((a, b) => a.t - b.t)
  const stats = traceStats()
  return {
    v: 1,
    generatedAt: Date.now(),
    env: { ...environment(), storage: await storageEstimate(), ...(extra ?? {}) },
    stats: {
      page: page.length,
      sw: sw.length,
      first: events.length > 0 ? events[0].t : stats.first,
      last: events.length > 0 ? events[events.length - 1].t : stats.last,
      degraded: stats.degraded,
    },
    events,
  }
}

/**
 * One line per event under the header, rather than pretty-printed JSON: this
 * gets read in a chat window and pasted out of a phone, where a 4,000-line
 * document with one field per line is unusable.
 */
export function formatTraceExport(x: TraceExport): string {
  const header = JSON.stringify({ v: x.v, generatedAt: x.generatedAt, env: x.env, stats: x.stats }, null, 2)
  const lines = x.events.map(e => JSON.stringify(e))
  return `${header}\n--- events (${x.events.length}) ---\n${lines.join('\n')}\n`
}
