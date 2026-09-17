// Diagnostic trace — a durable, synchronous event log for the rest-timer,
// audio-cue and notification paths.
//
// Why it exists: every failure in that area is SILENT. `playTone` ends in
// `catch { /* audio not available */ }`, a notification that never fires leaves
// nothing behind, and a service worker the browser reaped reports nothing at
// all. None of it reproduces on this desktop, so the only instrument to date has
// been asking the user one scenario at a time — four rounds, one of them
// misread badly enough to nearly ship false UI copy.
//
// Three constraints, each forced by the failure modes being measured:
//
//   SYNCHRONOUS. iOS can suspend or kill the process between an `await` and its
//   continuation, so an async sink loses precisely the write that mattered.
//   `localStorage` is the only durable synchronous store a page has.
//
//   NOT the app's own database. OPFS/SQLite goes through a Worker, and a frozen
//   worker is one of the things under investigation. A probe must not depend on
//   its own subject.
//
//   ABSENCE IS DATA. Nothing runs while the process is suspended, so this can
//   never cover that window — no instrument can. What it can do is stamp both
//   sides of it: a heartbeat while alive, wall clock on every record, and boot
//   markers. The gap between two records is the measurement.
//
// Off by default; when off, `trace()` costs one boolean read and returns.

export type TraceSource = 'page' | 'worker' | 'sw'

export interface TraceEvent {
  /** Monotonic within a page session; gaps mean records were dropped. */
  seq: number
  /** Wall clock when recorded — receipt time for relayed worker/SW events. */
  t: number
  /** ms since this page's time origin: survives a wall-clock jump, and does
   *  not advance meaningfully differently from `t` across a suspend, so the
   *  pair together distinguish a clock change from a real gap. */
  p: number
  src: TraceSource
  ev: string
  d?: Record<string, unknown>
}

const EVENTS_KEY = 'notif-trace'
const ENABLED_KEY = 'notif-trace-on'
const STORAGE_VERSION = 1

// Bounded twice over. The count bound keeps the whole-array rewrite on every
// event cheap (localStorage has no append, so each record re-serialises the
// buffer); the byte bound is the backstop for events carrying fat payloads.
// A 1 Hz heartbeat fills 1200 records in 20 minutes of rest, which is longer
// than any rest this app schedules.
const MAX_EVENTS = 1200
const MAX_BYTES = 192 * 1024

let events: TraceEvent[] = []
let enabled = false
let seq = 0
// Set when localStorage has refused a write twice. The buffer stays in memory
// so an export from the live page still works; only durability is lost, and
// the marker below says so rather than leaving a silent hole.
let writesFailed = false

function readEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

function readEvents(): TraceEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { v?: number; e?: unknown }
    if (parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.e)) return []
    return (parsed.e as unknown[]).filter(isTraceEvent)
  } catch {
    // Corrupt or unavailable: an unreadable trace must not take the app down,
    // and a partial history is worth less than a clean start.
    return []
  }
}

function isTraceEvent(x: unknown): x is TraceEvent {
  if (x == null || typeof x !== 'object' || Array.isArray(x)) return false
  const e = x as TraceEvent
  return typeof e.seq === 'number' && typeof e.t === 'number'
    && typeof e.p === 'number' && typeof e.ev === 'string'
    && (e.src === 'page' || e.src === 'worker' || e.src === 'sw')
}

function persist(): void {
  if (writesFailed) return
  try {
    localStorage.setItem(EVENTS_KEY, JSON.stringify({ v: STORAGE_VERSION, e: events }))
  } catch {
    // Quota, private mode, or a browser that refuses the write. Drop the oldest
    // half and try once — a trace that keeps its recent half is worth more than
    // one that stops recording at the moment it filled up.
    events = events.slice(Math.floor(events.length / 2))
    try {
      localStorage.setItem(EVENTS_KEY, JSON.stringify({ v: STORAGE_VERSION, e: events }))
    } catch {
      writesFailed = true
    }
  }
}

function init(): void {
  enabled = readEnabled()
  events = readEvents()
  seq = events.length > 0 ? Math.max(...events.map(e => e.seq)) + 1 : 0
  writesFailed = false
}

init()

/** Re-read the flag and the buffer from storage. Test seam, and used by the
 *  Settings panel after it clears the log. */
export function reloadTrace(): void {
  init()
}

export function isTraceEnabled(): boolean {
  return enabled
}

export function setTraceEnabled(on: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0')
  } catch {
    // The flag failing to persist costs a session's worth of tracing, not the
    // app; the in-memory flag below still takes effect for this run.
  }
  // Written with tracing forced on, so a log always opens AND closes with an
  // explicit marker — otherwise "it just stops here" is ambiguous between the
  // user switching it off and the app dying.
  enabled = true
  trace(on ? 'trace.on' : 'trace.off', { max: MAX_EVENTS })
  enabled = on
}

/**
 * Record one event. No-op when tracing is off.
 *
 * `d` should be small and already serialisable: it is JSON-stringified on every
 * write, and anything that cannot survive that (a DOM node, a cyclic object) is
 * dropped rather than allowed to throw inside an instrumentation call — a probe
 * that breaks its subject is worse than no probe.
 */
export function trace(ev: string, d?: Record<string, unknown>, src: TraceSource = 'page'): void {
  if (!enabled) return
  const rec: TraceEvent = {
    seq: seq++,
    t: Date.now(),
    p: Math.round(typeof performance !== 'undefined' ? performance.now() : 0),
    src,
    ev,
  }
  if (d !== undefined) {
    try {
      // Round-tripped so a payload that cannot be serialised fails HERE, where
      // it costs one event, rather than inside persist(), where it would cost
      // every later write too.
      rec.d = JSON.parse(JSON.stringify(d)) as Record<string, unknown>
    } catch {
      rec.d = { unserialisable: true }
    }
  }
  events.push(rec)
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS)
  persist()
  if (!writesFailed && approxBytes() > MAX_BYTES) {
    events = events.slice(Math.floor(events.length / 2))
    persist()
  }
}

function approxBytes(): number {
  // Cheap upper bound rather than a second stringify of the whole buffer.
  return events.length * 120
}

export function readTrace(): TraceEvent[] {
  return [...events]
}

export function clearTrace(): void {
  events = []
  seq = 0
  writesFailed = false
  try {
    localStorage.removeItem(EVENTS_KEY)
  } catch {
    // Nothing to do: the in-memory buffer is already empty, which is what the
    // caller asked for.
  }
}

export interface TraceStats {
  count: number
  /** Wall clock of the first and last record, or null when empty. */
  first: number | null
  last: number | null
  /** Whether durability has been lost this session (quota, private mode). */
  degraded: boolean
}

export function traceStats(): TraceStats {
  return {
    count: events.length,
    first: events.length > 0 ? events[0].t : null,
    last: events.length > 0 ? events[events.length - 1].t : null,
    degraded: writesFailed,
  }
}
