import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  restNotificationTargets,
  stalledSessionTarget,
  scheduleRest,
  scheduleStalledSession,
  cancelRest,
  cancelStalled,
  cancelAll,
  STALLED_DELAY_MS,
} from './notifications'
import {
  REST_FAIL_MAX,
  REST_FAIL_NUDGE,
  REST_NORMAL_THRESHOLD,
  REST_TRANSITION_THRESHOLD,
} from './calc'

const NOW = 1_000_000_000

// ─── pure logic ──────────────────────────────────────────────────────────────

describe('restNotificationTargets', () => {
  const startedAt = 1_000_000

  it('fires once at 90s for normal rest', () => {
    const t = restNotificationTargets(startedAt, 'normal')
    expect(t).toHaveLength(1)
    expect(t[0].fireAt).toBe(startedAt + REST_NORMAL_THRESHOLD * 1000)
    expect(t[0].body).toBe('Time for your next set')
    expect(t[0].title).toBe('Rest complete')
    expect(t[0].tag).toBe('rest-timer')
  })

  it('fires once at 60s for transition rest', () => {
    const t = restNotificationTargets(startedAt, 'transition')
    expect(t).toHaveLength(1)
    expect(t[0].fireAt).toBe(startedAt + REST_TRANSITION_THRESHOLD * 1000)
    expect(t[0].body).toBe('Time for your next set')
  })

  it('fires twice for fail: 180s warning + 300s critical', () => {
    const t = restNotificationTargets(startedAt, 'fail')
    expect(t).toHaveLength(2)
    expect(t[0].fireAt).toBe(startedAt + REST_FAIL_NUDGE * 1000)
    expect(t[0].body).toBe('Time for your next set')
    expect(t[1].fireAt).toBe(startedAt + REST_FAIL_MAX * 1000)
    expect(t[1].body).toBe('Rest up — take your time')
  })

  it('returns targets even when startedAt is in the past (scheduler fires immediately)', () => {
    const t = restNotificationTargets(startedAt - 200_000, 'normal')
    expect(t).toHaveLength(1)
    expect(t[0].fireAt).toBeLessThan(NOW)
  })
})

describe('stalledSessionTarget', () => {
  it('fires 2h after session start with the idle body', () => {
    const t = stalledSessionTarget(NOW)
    expect(t.fireAt).toBe(NOW + STALLED_DELAY_MS)
    expect(t.fireAt).toBe(NOW + 120 * 60 * 1000)
    expect(t.body).toBe('Did you finish your session?')
    expect(t.title).toBe('Session idle')
    expect(t.tag).toBe('stalled-session')
  })
})

// ─── scheduling (page timers + SW mirror) ─────────────────────────────────────

type NotifCall = { title: string; opts: { body: string; tag: string; requireInteraction: boolean } }
let notifCalls: NotifCall[]
let swPostMessage: ReturnType<typeof vi.fn>
type NotifCtor = typeof globalThis.Notification
const notifGlobal = globalThis as unknown as { Notification: NotifCtor }
let OrigNotification: NotifCtor

class MockNotification {
  static permission: NotificationPermission = 'granted'
  title: string
  opts: NotifCall['opts']
  constructor(title: string, opts: NotifCall['opts']) {
    notifCalls.push({ title, opts })
    this.title = title
    this.opts = opts
  }
  close = vi.fn()
}

function installNoSw() {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller: null },
    writable: true,
    configurable: true,
  })
}

function installSw() {
  swPostMessage = vi.fn()
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { controller: { postMessage: swPostMessage } },
    writable: true,
    configurable: true,
  })
}

function setPageHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, writable: true, configurable: true })
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
  installNoSw()
  setPageHidden(false)
  notifCalls = []
  MockNotification.permission = 'granted'
  OrigNotification = notifGlobal.Notification
  notifGlobal.Notification = MockNotification as unknown as NotifCtor
})

afterEach(() => {
  vi.useRealTimers()
  cancelAll()
  notifGlobal.Notification = OrigNotification
})

describe('notifications — page timers, no SW (dev preview fallback)', () => {
  it('fires a page Notification after the 90s threshold (normal)', () => {
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000)
    expect(notifCalls).toHaveLength(1)
    expect(notifCalls[0].title).toBe('Rest complete')
    expect(notifCalls[0].opts.body).toBe('Time for your next set')
    expect(notifCalls[0].opts.tag).toBe('rest-timer')
  })

  it('does NOT fire before the threshold', () => {
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000 - 1)
    expect(notifCalls).toHaveLength(0)
  })

  it('cancels the rest timer before it fires', () => {
    scheduleRest(NOW, 'normal')
    cancelRest()
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000 + 1000)
    expect(notifCalls).toHaveLength(0)
  })

  it('re-scheduling a rest cancels the previous timer (no stacking)', () => {
    scheduleRest(NOW, 'normal')
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000)
    expect(notifCalls).toHaveLength(1)
  })

  it('rest with past start time fires on the next tick', () => {
    scheduleRest(NOW - 200_000, 'normal')
    expect(notifCalls).toHaveLength(0)          // deferred, not synchronous
    vi.advanceTimersByTime(0)
    expect(notifCalls).toHaveLength(1)
    expect(notifCalls[0].opts.tag).toBe('rest-timer')
  })

  it('a past-due rest cancelled in the same tick never fires', () => {
    scheduleRest(NOW - 200_000, 'normal')
    cancelRest()
    vi.advanceTimersByTime(0)
    expect(notifCalls).toHaveLength(0)
  })

  it('schedules the stalled-session notification after 2h', () => {
    scheduleStalledSession(NOW)
    vi.advanceTimersByTime(STALLED_DELAY_MS)
    expect(notifCalls).toHaveLength(1)
    expect(notifCalls[0].title).toBe('Session idle')
    expect(notifCalls[0].opts.tag).toBe('stalled-session')
  })

  it('cancelStalled drops the pending stalled timer', () => {
    scheduleStalledSession(NOW)
    cancelStalled()
    vi.advanceTimersByTime(STALLED_DELAY_MS + 1000)
    expect(notifCalls).toHaveLength(0)
  })

  it('cancelRest does not touch the stalled timer and vice-versa', () => {
    scheduleRest(NOW, 'normal')
    scheduleStalledSession(NOW)
    cancelRest()
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000)
    expect(notifCalls).toHaveLength(0)             // rest cancelled
    vi.advanceTimersByTime(STALLED_DELAY_MS)
    expect(notifCalls).toHaveLength(1)             // stalled still fires
    expect(notifCalls[0].opts.tag).toBe('stalled-session')
  })

  it('does not fire when permission is not granted', () => {
    MockNotification.permission = 'denied'
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000)
    expect(notifCalls).toHaveLength(0)
  })
})

describe('notifications — SW present (production)', () => {
  it('arms the SW and keeps the page silent while the tab is visible', () => {
    installSw()
    scheduleRest(NOW, 'normal')
    expect(swPostMessage).toHaveBeenCalledWith({
      type: 'schedule',
      tag: 'rest-timer',
      fireAt: NOW + REST_NORMAL_THRESHOLD * 1000,
      title: 'Rest complete',
      body: 'Time for your next set',
    })
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000 + 1000)
    expect(notifCalls).toHaveLength(0)             // visible tab: SW owns it
  })

  it('page also fires when the tab is hidden (SW is best-effort)', () => {
    installSw()
    setPageHidden(true)
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000)
    expect(notifCalls).toHaveLength(1)
    expect(swPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'schedule' }))
  })

  it('past-due target with SW present and visible tab: page stays silent', () => {
    installSw()
    scheduleRest(NOW - 200_000, 'normal')
    vi.advanceTimersByTime(0)
    expect(notifCalls).toHaveLength(0)
    expect(swPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'schedule' }))
  })

  it('past-due target with SW present and hidden tab: page fires', () => {
    installSw()
    setPageHidden(true)
    scheduleRest(NOW - 200_000, 'normal')
    vi.advanceTimersByTime(0)
    expect(notifCalls).toHaveLength(1)
  })

  it('cancel posts to the SW and clears the page timers', () => {
    installSw()
    scheduleRest(NOW, 'normal')
    cancelRest()
    expect(swPostMessage).toHaveBeenCalledWith({ type: 'cancel', tag: 'rest-timer' })
    vi.advanceTimersByTime(REST_NORMAL_THRESHOLD * 1000 + 1000)
    expect(notifCalls).toHaveLength(0)
  })
})