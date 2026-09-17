// One readable artefact out of the page's trace.
//
// The environment goes at the top because the questions this is meant to answer
// all begin "on which device, in what mode, with what permission".
//
// There was a second sink once, inside the service worker, writing to
// IndexedDB. It recorded nothing in any capture taken from a real device, and a
// zero that means "the sink never worked" reads exactly like a zero that means
// "the worker did nothing" — so it was removed rather than left to mislead.
// `docs/verification/2026-09-17-keepalive-and-audio-clock.md` has the detail.

import { readTrace, traceStats, type TraceEvent } from './trace'

export interface TraceExport {
  v: 1
  generatedAt: number
  env: Record<string, unknown>
  stats: { page: number; first: number | null; last: number | null; degraded: boolean }
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
  const events = readTrace()
  const stats = traceStats()
  return {
    v: 1,
    generatedAt: Date.now(),
    env: { ...environment(), storage: await storageEstimate(), ...(extra ?? {}) },
    stats: {
      page: events.length,
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
