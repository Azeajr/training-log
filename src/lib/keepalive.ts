// An EXPERIMENT: hold the page process alive across an app switch.
//
// The capture that prompted this is unambiguous. During an 82-second app
// switch the page executed nothing — `page.beat` went dark for the whole
// window — while the monotonic clock advanced the full 82 seconds. The device
// was awake; our page was suspended. So the rest bell came due on time with
// nothing running to fire it, and landed 3 seconds after the user returned.
//
// The service worker was meant to cover exactly this and cannot: a SW's own
// `setTimeout` does not keep the worker alive, the browser reaps it in about
// 30 seconds, and the first bell is 90 seconds out (COMMON_MISTAKES #11).
//
// WebKit keeps a page running while it is playing media. The hypothesis is
// therefore: play a near-silent loop for the duration of a rest, and the
// process survives the switch. **This is unproven.** It is built behind its own
// switch, off by default, so the trace can settle it — if `page.beat` keeps
// ticking through a backgrounded window, the hypothesis holds; if the window
// goes dark anyway, it does not, and the honest answer is UI copy.
//
// Two costs are real and neither is hidden:
//   - Battery. Bounded by scoping playback to an active rest only.
//   - The user's music. `navigator.audioSession.type = 'ambient'` asks iOS to
//     MIX with other audio rather than interrupt it, which is what keeps a gym
//     playlist alive. Where that API is absent there is no such guarantee,
//     which is a reason to leave this off by default.

import { trace } from './trace'

const ENABLED_KEY = 'notif-keepalive-on'

// 'ambient' mixes with other audio and obeys the silent switch — the right
// trade for an app used while music is playing. It does mean a phone on silent
// may not hold the session at all, which the experiment will show.
const SESSION_TYPE = 'ambient'

// A real file, not a blob: URL.
//
// The first device run failed on every attempt with
// `NotSupportedError: The operation is not supported.` and a media `error`
// event — the loop never played once, so it tested nothing. iOS requires a
// media resource that supports byte-range requests, and a `blob:` URL does not
// provide them. A file served over HTTP does, so the source is now an asset.
// It is precached (`wav` is in vite.config's globPatterns) because an
// offline-first app must not lose this the moment the network does — the same
// mistake F72 made with the only icon that existed.
const SILENCE_URL = '/silence.wav'

let el: HTMLAudioElement | null = null
let retryBound = false
let enabled = read()

function read(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function isKeepaliveEnabled(): boolean {
  return enabled
}

export function setKeepaliveEnabled(on: boolean): void {
  enabled = on
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0')
  } catch {
    // The flag failing to persist costs this session's experiment, not the app.
  }
  trace('keepalive.toggle', { on })
  if (!on) stopKeepalive()
}

/** Test seam, and used by the panel after a toggle. */
export function reloadKeepalive(): void {
  enabled = read()
}

function claimAudioSession(): void {
  const nav = navigator as Navigator & { audioSession?: { type?: string } }
  if (!nav.audioSession) {
    trace('keepalive.session.absent', {})
    return
  }
  try {
    nav.audioSession.type = SESSION_TYPE
    trace('keepalive.session', { type: nav.audioSession.type })
  } catch (err) {
    trace('keepalive.session.failed', { error: String(err) })
  }
}

function ensureElement(): void {
  if (el) return
  const audio = new Audio(SILENCE_URL)
  audio.loop = true
  audio.preload = 'auto'
  // Deliberately NOT muted: a muted element does not hold a media session, and
  // the session is the entire point. The silence comes from the content.
  audio.muted = false
  for (const name of ['playing', 'pause', 'ended', 'stalled', 'error', 'suspend'] as const) {
    audio.addEventListener(name, () => trace('keepalive.media', {
      event: name,
      paused: audio.paused,
      // MediaError tells apart "could not fetch it" from "cannot decode it",
      // which is the difference between a caching problem and a format one.
      code: audio.error?.code ?? null,
    }))
  }
  el = audio
}

function attemptPlay(why: string): void {
  if (!el) return
  trace('keepalive.play', { why })
  void el.play().then(
    () => trace('keepalive.playing', { paused: el?.paused }),
    (err: unknown) => {
      // Autoplay refused. A rest starts from a tap, but the play() call happens
      // in an effect rather than in the handler, so the gesture credit may
      // already be spent — retry on the next touch.
      trace('keepalive.blocked', { why, error: String(err) })
      bindRetry()
    },
  )
}

function bindRetry(): void {
  if (retryBound || typeof document === 'undefined') return
  retryBound = true
  const onTouch = () => {
    retryBound = false
    document.removeEventListener('touchstart', onTouch)
    attemptPlay('gesture')
  }
  document.addEventListener('touchstart', onTouch, { passive: true, once: true })
}

/** Begin holding the process. No-op unless the experiment is switched on. */
export function startKeepalive(): void {
  if (!enabled) return
  try {
    claimAudioSession()
    ensureElement()
    attemptPlay('rest-start')
  } catch (err) {
    trace('keepalive.failed', { error: String(err) })
  }
}

/** Release it. Safe to call when nothing is running. */
export function stopKeepalive(): void {
  if (!el) return
  trace('keepalive.stop', {})
  try {
    el.pause()
    el.removeAttribute('src')
    el.load()
  } catch (err) {
    trace('keepalive.stop.failed', { error: String(err) })
  }
  el = null
}
