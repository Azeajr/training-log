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
// `tag` is the coalescing key: a new rest checkpoint replaces a stale one rather
// than stacking. Rest-phase and stalled-session notifications use distinct
// tags.

import { DEFAULT_REST_THRESHOLDS } from './calc'
import type { RestPhase, RestThresholds } from './calc'
import { createNotifyTimers, type NotifyTarget } from './notify-timers'

const REST_TAG = 'rest-timer'
const STALLED_TAG = 'stalled-session'
const STALLED_BODY = 'Did you finish your session?'
export const STALLED_DELAY_MS = 120 * 60 * 1000

// Mixed-case bodies (the in-app restStatus().message is uppercase).
const PHASE_BODY: Record<Exclude<RestPhase, 'idle'>, string> = {
  nudge: 'First bell — go if ready',
  warning: 'Second bell — go if ready',
  critical: 'Failed-set rest complete',
}

// Bell thresholds (seconds). A completed set always arms both checkpoints; a
// failed set arms only its longer recovery checkpoint. Lengths come from the
// user's settings so notifications cannot drift from the on-screen timer.
function checkpoints(
  restType: 'normal' | 'fail',
  t: RestThresholds,
): Array<{ at: number; phase: Exclude<RestPhase, 'idle'> }> {
  return restType === 'fail'
    ? [{ at: t.failedBell, phase: 'critical' }]
    : [
        { at: t.firstBell, phase: 'nudge' },
        { at: t.secondBell, phase: 'warning' },
      ]
}

export { type NotifyTarget }

// Pure: the notification targets for one rest period. Testable without a DOM/SW.
export function restNotificationTargets(
  restStartedAt: number,
  restType: 'normal' | 'fail',
  t: RestThresholds = DEFAULT_REST_THRESHOLDS,
): NotifyTarget[] {
  return checkpoints(restType, t).map(({ at, phase }) => ({
    fireAt: restStartedAt + at * 1000,
    title: 'Rest complete',
    body: PHASE_BODY[phase],
    tag: REST_TAG,
  }))
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

export function scheduleRest(
  restStartedAt: number,
  restType: 'normal' | 'fail',
  t: RestThresholds = DEFAULT_REST_THRESHOLDS,
): void {
  cancelRest()
  const targets = restNotificationTargets(restStartedAt, restType, t)
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
