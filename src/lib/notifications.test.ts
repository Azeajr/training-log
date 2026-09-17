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
  REST_FAILED_BELL,
  REST_FIRST_BELL,
  REST_SECOND_BELL,
} from './calc'
import { readTrace, reloadTrace } from './trace'

const NOW = 1_000_000_000

// ─── pure logic ──────────────────────────────────────────────────────────────

describe('restNotificationTargets', () => {
  const startedAt = 1_000_000

  it('fires at both completed-set checkpoints', () => {
    const t = restNotificationTargets(startedAt, 'normal')
    expect(t).toHaveLength(2)
    expect(t[0].fireAt).toBe(startedAt + REST_FIRST_BELL * 1000)
    expect(t[0].body).toBe('First bell — go if ready')
    expect(t[0].title).toBe('Rest complete')
    expect(t[0].tag).toBe('rest-timer')
    expect(t[1].fireAt).toBe(startedAt + REST_SECOND_BELL * 1000)
    expect(t[1].body).toBe('Second bell — go if ready')
  })

  it('fires once at the failed-set checkpoint', () => {
    const t = restNotificationTargets(startedAt, 'fail')
    expect(t).toHaveLength(1)
    expect(t[0].fireAt).toBe(startedAt + REST_FAILED_BELL * 1000)
    expect(t[0].body).toBe('Failed-set rest complete')
  })

  it('returns targets even when startedAt is in the past (scheduler fires immediately)', () => {
    const t = restNotificationTargets(startedAt - 200_000, 'normal')
    expect(t).toHaveLength(2)
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
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(1)
    expect(notifCalls[0].title).toBe('Rest complete')
    expect(notifCalls[0].opts.body).toBe('First bell — go if ready')
    expect(notifCalls[0].opts.tag).toBe('rest-timer')
  })

  it('does NOT fire before the threshold', () => {
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000 - 1)
    expect(notifCalls).toHaveLength(0)
  })

  it('cancels the rest timer before it fires', () => {
    scheduleRest(NOW, 'normal')
    cancelRest()
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000 + 1000)
    expect(notifCalls).toHaveLength(0)
  })

  it('re-scheduling a rest cancels the previous timer (no stacking)', () => {
    scheduleRest(NOW, 'normal')
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(1)
  })

  it('rest with past start time fires on the next tick', () => {
    scheduleRest(NOW - 200_000, 'normal')
    expect(notifCalls).toHaveLength(0)          // deferred, not synchronous
    vi.advanceTimersByTime(0)
    expect(notifCalls).toHaveLength(2)
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
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(0)             // rest cancelled
    vi.advanceTimersByTime(STALLED_DELAY_MS)
    expect(notifCalls).toHaveLength(1)             // stalled still fires
    expect(notifCalls[0].opts.tag).toBe('stalled-session')
  })

  it('does not fire when permission is not granted', () => {
    MockNotification.permission = 'denied'
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(0)
  })
})

describe('notifications — SW present (production)', () => {
  it('arms the SW and still fires page-side while the tab is visible', () => {
    installSw()
    scheduleRest(NOW, 'normal')
    expect(swPostMessage).toHaveBeenCalledWith({
      type: 'schedule',
      tag: 'rest-timer',
      fireAt: NOW + REST_FIRST_BELL * 1000,
      title: 'Rest complete',
      body: 'First bell — go if ready',
    })
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(1)             // F107: no abstain for the SW
  })

  it('page also fires when the tab is hidden (SW is best-effort)', () => {
    installSw()
    setPageHidden(true)
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(1)
    expect(swPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'schedule' }))
  })

  it('past-due target with SW present and visible tab: page fires (F107)', () => {
    installSw()
    scheduleRest(NOW - 200_000, 'normal')
    vi.advanceTimersByTime(0)
    expect(notifCalls).toHaveLength(2)             // both bells, coalesced by tag
    expect(swPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'schedule' }))
  })

  it('past-due target with SW present and hidden tab: page fires', () => {
    installSw()
    setPageHidden(true)
    scheduleRest(NOW - 200_000, 'normal')
    vi.advanceTimersByTime(0)
    expect(notifCalls).toHaveLength(2)
  })

  it('cancel posts to the SW and clears the page timers', () => {
    installSw()
    scheduleRest(NOW, 'normal')
    cancelRest()
    expect(swPostMessage).toHaveBeenCalledWith({ type: 'cancel', tag: 'rest-timer' })
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000 + 1000)
    expect(notifCalls).toHaveLength(0)
  })
})

// ── F107 ────────────────────────────────────────────────────────────────────
// The page used to abstain whenever a service worker controlled a VISIBLE page:
// `if (swController() && !isPageHidden()) return`. Two justifications were
// recorded for it, and the device test of 2026-09-16 broke both.
//
// "The SW owns the visible-tab case" (the code's own comment) cannot be true.
// `navigator.serviceWorker.controller` reports CONTROL, not aliveness — it stays
// non-null after the browser terminates an idle worker (~30 s, COMMON_MISTAKES
// #11) — while the SW's schedule is plain in-memory setTimeouts that die with it
// and are never re-armed. The first bell is 90 s out, so the page stood aside
// for a worker that was, by then, usually gone. Nobody fired.
//
// "The in-app rest UI already alerts the user there" (deep-code-review.md:3377,
// which checked this line and ruled it justified) does not hold on the platform
// this PWA targets: on an installed iOS PWA with the app open and visible, the
// reporter got no audio cue and no notification. Whether the audio failure is
// the AudioContext or a frozen tick worker is still open; either way it is not a
// second alert this one can lean on.
//
// Firing both sides is safe, and is what the shared `tag` is for: a same-tag
// notification replaces its predecessor rather than stacking, and a replacement
// does not re-alert (`renotify` defaults to false). So a live SW and the page
// firing the same target cost one alert, not two — while a dead SW now costs
// nothing at all.
describe('a controlling service worker does not silence the page (F107)', () => {
  it('fires the first bell with the tab visible and a SW in control', () => {
    installSw()
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(1)
    expect(notifCalls[0].title).toBe('Rest complete')
    expect(notifCalls[0].opts.tag).toBe('rest-timer')
  })

  it('fires the failed-set bell with the tab visible and a SW in control', () => {
    installSw()
    scheduleRest(NOW, 'fail')
    vi.advanceTimersByTime(REST_FAILED_BELL * 1000)
    expect(notifCalls).toHaveLength(1)
    expect(notifCalls[0].opts.body).toBe('Failed-set rest complete')
  })

  it('fires the stalled-session notification with the tab visible and a SW in control', () => {
    installSw()
    scheduleStalledSession(NOW)
    vi.advanceTimersByTime(STALLED_DELAY_MS)
    expect(notifCalls).toHaveLength(1)
    expect(notifCalls[0].opts.tag).toBe('stalled-session')
  })

  it('does not depend on visibility either way', () => {
    installSw()
    setPageHidden(true)
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    const hidden = notifCalls.length
    cancelAll()
    notifCalls = []
    setPageHidden(false)
    scheduleRest(NOW + REST_FIRST_BELL * 1000, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(hidden)
  })

  it('still respects an explicit permission denial', () => {
    installSw()
    MockNotification.permission = 'denied'
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(notifCalls).toHaveLength(0)
  })
})

// ── F67 ─────────────────────────────────────────────────────────────────────
// firePage called `new Notification(...)` behind a permission check only — no
// try/catch and no fallback. On an engine that rejects the constructor the
// TypeError escapes the timer tick uncaught, no notification appears, and
// nothing in the module reports it. This module designates the PAGE path as the
// reliable one and the service worker as best-effort, so if the constructor is
// unavailable the reliability story inverts — on exactly the platform this PWA
// targets.
//
// The existing cases cannot observe this: they stub Notification as a spy that
// always succeeds.
describe('firePage on an engine that rejects the constructor (F67)', () => {
  function installThrowingNotification() {
    const ctor = function () {
      throw new TypeError("Failed to construct 'Notification': Illegal constructor.")
    } as unknown as NotifCtor
    Object.defineProperty(ctor, 'permission', { value: 'granted', configurable: true })
    globalThis.Notification = ctor
  }

  /** A registration whose showNotification we can observe. */
  function installRegistration() {
    const showNotification = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: null, ready: Promise.resolve({ showNotification }) },
      writable: true,
      configurable: true,
    })
    return showNotification
  }

  it('does not let the constructor throw out of the timer tick', async () => {
    installThrowingNotification()
    installRegistration()
    setPageHidden(true)
    scheduleRest(Date.now() - 200_000, 'normal', { firstBell: 1, secondBell: 2, failedBell: 3 })
    await vi.advanceTimersByTimeAsync(50)
    // Reaching here without an unhandled TypeError is the assertion.
    expect(true).toBe(true)
  })

  it('falls back to the service-worker registration', async () => {
    installThrowingNotification()
    const showNotification = installRegistration()
    setPageHidden(true)
    scheduleRest(Date.now() - 200_000, 'normal', { firstBell: 1, secondBell: 2, failedBell: 3 })
    await vi.advanceTimersByTimeAsync(50)
    await Promise.resolve()
    expect(showNotification).toHaveBeenCalled()
  })
})

// ── diagnostics ─────────────────────────────────────────────────────────────
// The iOS reports are all of the form "nothing happened", and nothing in this
// module said which nothing it was: no permission, no constructor, a throw, or
// a request the OS accepted and then did not show. One record per branch.
describe('notification trace', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
  })

  afterEach(() => {
    localStorage.clear()
    reloadTrace()
  })

  it('separates a permission denial from a silent failure', () => {
    MockNotification.permission = 'denied'
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    const denied = readTrace().find(e => e.ev === 'notify.page.denied')
    expect(denied?.d).toMatchObject({ permission: 'denied' })
    expect(readTrace().map(e => e.ev)).not.toContain('notify.page.ok')
  })

  it('records the arming context: permission and whether a SW controls the page', () => {
    installSw()
    scheduleRest(NOW, 'normal')
    const armed = readTrace().find(e => e.ev === 'notify.scheduleRest')
    expect(armed?.d).toMatchObject({ permission: 'granted', controlled: true })
    expect(readTrace().map(e => e.ev)).toContain('notify.sw.schedule')
  })

  it('records a successful page notification', () => {
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    expect(readTrace().map(e => e.ev)).toContain('notify.page.ok')
  })

  it('records the constructor throwing, which used to be invisible', () => {
    const ctor = function () { throw new TypeError('Illegal constructor') } as unknown as NotifCtor
    Object.defineProperty(ctor, 'permission', { value: 'granted', configurable: true })
    notifGlobal.Notification = ctor
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: null, ready: Promise.resolve({ showNotification: vi.fn().mockResolvedValue(undefined), getNotifications: vi.fn().mockResolvedValue([]) }) },
      writable: true, configurable: true,
    })
    scheduleRest(NOW, 'normal')
    vi.advanceTimersByTime(REST_FIRST_BELL * 1000)
    const threw = readTrace().find(e => e.ev === 'notify.page.threw')
    expect(String(threw?.d?.error)).toContain('Illegal constructor')
    expect(readTrace().map(e => e.ev)).toContain('notify.reg')
  })

  it('reads back what the registration is actually holding', async () => {
    const getNotifications = vi.fn().mockResolvedValue([{ tag: 'rest-timer' }])
    const ctor = function () { throw new TypeError('nope') } as unknown as NotifCtor
    Object.defineProperty(ctor, 'permission', { value: 'granted', configurable: true })
    notifGlobal.Notification = ctor
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        controller: null,
        ready: Promise.resolve({ showNotification: vi.fn().mockResolvedValue(undefined), getNotifications }),
      },
      writable: true, configurable: true,
    })
    scheduleRest(Date.now() - 200_000, 'normal', { firstBell: 1, secondBell: 2, failedBell: 3 })
    await vi.advanceTimersByTimeAsync(50)
    await Promise.resolve()
    // `showNotification` resolving only means the request was accepted; this is
    // the closest the platform comes to saying it was shown.
    const back = readTrace().find(e => e.ev === 'notify.readback')
    expect(back?.d).toMatchObject({ held: 1 })
  })
})
