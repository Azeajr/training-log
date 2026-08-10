// System notifications for rest-timer thresholds and stalled sessions.
//
// In-app cues (audio-cues.ts) are silent when the tab is backgrounded or the
// screen locks, and the tick worker loses CPU. These schedule through the
// service worker so alerts fire even when the page isn't visible; when no SW is
// registered (dev preview server), they fall back to an in-page timer.
//
// Protocol spoken to the SW (see src/service-worker.ts):
//   { type: 'schedule', tag, fireAt, title, body }   — arm a one-shot
//   { type: 'cancel',   tag }                        — drop a pending one
//
// `tag` is the coalescing key: a new rest nudge replaces a stale one rather than
// stacking. Rest-phase and stalled-session notifications use distinct tags.

import {
  REST_FAIL_MAX,
  REST_FAIL_NUDGE,
  REST_NORMAL_THRESHOLD,
  REST_TRANSITION_THRESHOLD,
  restStatus,
} from './calc'
import type { RestPhase } from './calc'

const REST_TAG = 'rest-timer'
const STALLED_TAG = 'stalled-session'
const STALLED_BODY = 'Did you finish your session?'
export const STALLED_DELAY_MS = 120 * 60 * 1000

// Mixed-case bodies (the in-app restStatus().message is uppercase).
const PHASE_BODY: Record<Exclude<RestPhase, 'idle'>, string> = {
  nudge: 'Time for your next set',
  warning: 'Time for your next set',
  critical: 'Rest up — take your time',
}

// Phase thresholds (seconds) where restStatus flips idle→active for each type.
// A 'fail' rest crosses two cues (warning @180s, critical @300s); normal and
// transition each have a single nudge.
function thresholds(restType: 'normal' | 'transition' | 'fail'): number[] {
  if (restType === 'fail') return [REST_FAIL_NUDGE, REST_FAIL_MAX]
  if (restType === 'transition') return [REST_TRANSITION_THRESHOLD]
  return [REST_NORMAL_THRESHOLD]
}

export interface NotifyTarget {
  readonly fireAt: number   // absolute timestamp (ms)
  readonly title: string
  readonly body: string
  readonly tag: string
}

// Pure: the notification targets for one rest period. Testable without a DOM/SW.
export function restNotificationTargets(
  restStartedAt: number,
  restType: 'normal' | 'transition' | 'fail',
): NotifyTarget[] {
  return thresholds(restType)
    .map((at) => {
      const phase = restStatus(at, restType).phase
      const body = phase === 'idle' ? null : PHASE_BODY[phase]
      return body === null
        ? null
        : { fireAt: restStartedAt + at * 1000, title: 'Rest complete', body, tag: REST_TAG }
    })
    .filter((t): t is NotifyTarget => t !== null)
}

// Pure: the stalled-session target.
export function stalledSessionTarget(sessionStartedAt: number): NotifyTarget {
  return {
    fireAt: sessionStartedAt + STALLED_DELAY_MS,
    title: 'Session idle',
    body: STALLED_BODY,
    tag: STALLED_TAG,
  }
}

// ── side-effecting scheduler ──────────────────────────────────────────────

// In-page fallback timers keyed by tag (separate so a rest re-schedule doesn't
// drop the stalled-session timer and vice-versa).
const pageTimers = new Map<string, Set<ReturnType<typeof setTimeout>>>()

function swController(): ServiceWorker | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.controller
}

function firePage(title: string, body: string, tag: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  new Notification(title, { body, tag, requireInteraction: false })
}

function scheduleSw(targets: NotifyTarget[]): void {
  const ctrl = swController()
  if (!ctrl) return
  for (const t of targets) {
    ctrl.postMessage({ type: 'schedule', tag: t.tag, fireAt: t.fireAt, title: t.title, body: t.body })
  }
}

function cancelSw(tag: string): void {
  const ctrl = swController()
  ctrl?.postMessage({ type: 'cancel', tag })
}

function schedulePage(key: string, targets: NotifyTarget[]): void {
  clearPage(key)
  if (targets.length === 0) return
  const now = Date.now()
  const set = new Set<ReturnType<typeof setTimeout>>()
  for (const { fireAt, title, body, tag } of targets) {
    const delay = fireAt - now
    if (delay <= 0) {
      firePage(title, body, tag)
      continue
    }
    set.add(setTimeout(() => firePage(title, body, tag), delay))
  }
  pageTimers.set(key, set)
}

function clearPage(key: string): void {
  pageTimers.get(key)?.forEach(clearTimeout)
  pageTimers.delete(key)
}

export function scheduleRest(restStartedAt: number, restType: 'normal' | 'transition' | 'fail'): void {
  cancelRest()
  const targets = restNotificationTargets(restStartedAt, restType)
  if (targets.length === 0) return
  if (swController()) scheduleSw(targets)
  else schedulePage(REST_TAG, targets)
}

export function scheduleStalledSession(sessionStartedAt: number): void {
  cancelStalled()
  const targets = [stalledSessionTarget(sessionStartedAt)]
  if (swController()) scheduleSw(targets)
  else schedulePage(STALLED_TAG, targets)
}

export function cancelRest(): void {
  cancelSw(REST_TAG)
  clearPage(REST_TAG)
}

export function cancelStalled(): void {
  cancelSw(STALLED_TAG)
  clearPage(STALLED_TAG)
}

export function cancelAll(): void {
  cancelRest()
  cancelStalled()
}
