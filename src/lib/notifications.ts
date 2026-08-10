// System notifications for rest-timer thresholds and stalled sessions.
//
// In-app cues (audio-cues.ts) are silent when the tab is backgrounded or the
// screen locks, and the tick worker loses CPU. Notifications are scheduled
// page-side by default (see COMMON_MISTAKES #11: a service worker's own
// setTimeout does not keep the worker alive, so the SW path is best-effort),
// with the SW armed in parallel as a bonus background path.
//
// Fire policy:
//   - SW controls the page → the page fires ONLY while the tab is hidden
//     (the SW owns the visible-tab case; the in-app rest UI already alerts
//     the user there).
//   - no SW (dev preview, unsupported engine) → the page always fires.
//
// Catch-up: targets whose fireAt has passed while the page was dead fire
// immediately when the page re-arms them on load (RestTimer mounts with the
// persisted restStartedAt / session date). A fully closed browser can never
// wake the SW on its own — serverless ceiling, documented in ROADMAP.
//
// Protocol spoken to the SW (see src/service-worker.ts):
//   { type: 'schedule', tag, fireAt, title, body }   — arm a one-shot
//   { type: 'cancel',   tag }                        — drop a pending one
//
// `tag` is the coalescing key: a new rest nudge replaces a stale one rather
// than stacking. Rest-phase and stalled-session notifications use distinct
// tags.

import {
  REST_FAIL_MAX,
  REST_FAIL_NUDGE,
  REST_NORMAL_THRESHOLD,
  REST_TRANSITION_THRESHOLD,
  restStatus,
} from './calc'
import type { RestPhase } from './calc'
import { createNotifyTimers, type NotifyTarget } from './notify-timers'

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

export { type NotifyTarget }

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

function swController(): ServiceWorker | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.controller
}

function isPageHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden
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

// Page-side registry: the reliable path while the tab lives. One instance for
// both tags — cancelRest/cancelStalled/cancelAll map onto tag-scoped cancels,
// so re-scheduling a rest never drops the stalled-session timer and vice-versa.
const pageTimers = createNotifyTimers({
  fire: (target) => {
    // SW-present + visible tab: the SW owns the visible case; firing the page
    // notification too would double the nudge.
    if (swController() && !isPageHidden()) return
    firePage(target.title, target.body, target.tag)
  },
})

function schedulePage(key: string, targets: NotifyTarget[]): void {
  pageTimers.cancelTag(key)
  for (const t of targets) pageTimers.arm(t)
}

export function scheduleRest(restStartedAt: number, restType: 'normal' | 'transition' | 'fail'): void {
  cancelRest()
  const targets = restNotificationTargets(restStartedAt, restType)
  if (targets.length === 0) return
  schedulePage(REST_TAG, targets)
  scheduleSw(targets)
}

export function scheduleStalledSession(sessionStartedAt: number): void {
  cancelStalled()
  const targets = [stalledSessionTarget(sessionStartedAt)]
  schedulePage(STALLED_TAG, targets)
  scheduleSw(targets)
}

export function cancelRest(): void {
  cancelSw(REST_TAG)
  pageTimers.cancelTag(REST_TAG)
}

export function cancelStalled(): void {
  cancelSw(STALLED_TAG)
  pageTimers.cancelTag(STALLED_TAG)
}

export function cancelAll(): void {
  cancelRest()
  cancelStalled()
}