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

let el: HTMLAudioElement | null = null
let objectUrl: string | null = null
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

/**
 * A WAV of near-silence.
 *
 * 16-bit samples alternating ±1 LSB rather than a run of zeroes: that is about
 * -90 dBFS, inaudible on any hardware, but it is not digital silence — which
 * some engines detect and discard, taking the media session with it. Generated
 * rather than shipped as an asset so the whole experiment is one file and adds
 * nothing to the bundle.
 */
function silentWav(seconds = 1, rate = 8000): Blob {
  const samples = seconds * rate
  const dataBytes = samples * 2
  const buf = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buf)
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true)            // fmt chunk size
  view.setUint16(20, 1, true)             // PCM
  view.setUint16(22, 1, true)             // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)      // byte rate
  view.setUint16(32, 2, true)             // block align
  view.setUint16(34, 16, true)            // bits per sample
  ascii(36, 'data')
  view.setUint32(40, dataBytes, true)
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, i % 2 === 0 ? 1 : -1, true)
  return new Blob([buf], { type: 'audio/wav' })
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
  objectUrl = URL.createObjectURL(silentWav())
  const audio = new Audio(objectUrl)
  audio.loop = true
  audio.preload = 'auto'
  // Deliberately NOT muted: a muted element does not hold a media session, and
  // the session is the entire point. The silence comes from the content.
  audio.muted = false
  for (const name of ['playing', 'pause', 'ended', 'stalled', 'error', 'suspend'] as const) {
    audio.addEventListener(name, () => trace('keepalive.media', { event: name, paused: audio.paused }))
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
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}
