import { trace, isTraceEnabled } from './trace'

// Module-scoped AudioContext: iOS requires a single instance unlocked by a
// user gesture; we keep one across remounts of any consumer.
let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
    trace('audio.ctx.new', { state: audioCtx.state, sampleRate: audioCtx.sampleRate })
    // Every state change, not just the ones this module causes: iOS suspends a
    // context on its own when the app backgrounds or an interruption ends, and
    // that transition is otherwise invisible.
    audioCtx.onstatechange = () => trace('audio.ctx.state', { state: audioCtx?.state })
  }
  return audioCtx
}

// How long to wait for a resume before calling it a non-answer.
//
// `resume()` outside a user gesture is unreliable on iOS: it can sit unsettled
// indefinitely, which would leave `playTone` awaiting a promise that never
// resolves — no note, no error, and nothing recorded about why. Racing it
// against a deadline turns "never settled" from an invisible hang into an
// observation. 400 ms because a bell that needs longer than that has already
// missed its moment.
const RESUME_TIMEOUT_MS = 400

async function resumeWithin(ctx: AudioContext): Promise<'ok' | 'failed' | 'timeout'> {
  let attempt: Promise<'ok' | 'failed'>
  try {
    attempt = ctx.resume().then(() => 'ok' as const, () => 'failed' as const)
  } catch {
    return 'failed'
  }
  return Promise.race([
    attempt,
    new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), RESUME_TIMEOUT_MS)),
  ])
}

/**
 * One tone.
 *
 * Everything here used to end in a bare `catch` whose comment read "audio not
 * available" — a silent failure on the path whose whole job is to make a
 * noise, which is why nothing surfaced when it stopped working. The trace
 * calls are what turn "no sound" into an answer, and they are laid out to split
 * the two candidates apart:
 *
 *   `audio.tone.resumed` with `resumed: "timeout"`   → `resume()` never
 *     settled, which is what iOS does outside a user gesture. Recorded rather
 *     than awaited forever.
 *   `audio.tone.deadctx`                              → the context was still
 *     not running when the note was scheduled. This is the ghost bell: the note
 *     sits against a stopped clock and plays on the NEXT user gesture, minutes
 *     late. Observed on an installed iOS PWA — armed at t+581.0, played at
 *     t+611.4, released by the touch that hit SKIP.
 *   `audio.tone.armed` with no `audio.tone.ended`     → the note was scheduled
 *     against a clock that is not advancing (`currentTime` frozen), so it will
 *     never arrive.
 *   `audio.tone.ended` and still nothing audible      → WebAudio did its job
 *     and the loss is below it: silent switch, routing, volume. Not fixable
 *     from here, but no longer a mystery.
 *
 * The state check is `!== 'running'`, not `=== 'suspended'`: WebKit has a third
 * state, `interrupted`, which the old check did not recognise, so a context
 * stopped by a phone lock or another app's audio was never even asked to
 * resume (F108).
 */
async function playTone(freq: number, duration: number, startDelay = 0): Promise<void> {
  try {
    const ctx = getAudioCtx()
    trace('audio.tone', {
      freq, duration, startDelay, state: ctx.state, currentTime: ctx.currentTime,
    })
    if (ctx.state !== 'running') {
      const resumed = await resumeWithin(ctx)
      trace('audio.tone.resumed', { resumed, state: ctx.state, currentTime: ctx.currentTime })
    }
    if (ctx.state !== 'running') {
      // Scheduled anyway, deliberately: this is where the ghost bell comes from
      // — a note queued against a stopped clock plays on the next user gesture,
      // minutes late. Whether to drop it instead is a live decision (F108); for
      // now it is recorded rather than changed, so the trace can settle it.
      trace('audio.tone.deadctx', { freq, state: ctx.state, currentTime: ctx.currentTime })
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = ctx.currentTime + startDelay
    gain.gain.setValueAtTime(0.25, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    // The decisive instrument: `onended` fires only if the note actually ran.
    if (isTraceEnabled()) {
      osc.onended = () => trace('audio.tone.ended', { freq, currentTime: ctx.currentTime })
    }
    osc.start(t)
    osc.stop(t + duration + 0.05)
    trace('audio.tone.armed', { freq, at: t, state: ctx.state, currentTime: ctx.currentTime })
  } catch (err) {
    trace('audio.tone.failed', { freq, error: String(err) })
  }
}

function vibrate(pattern: number | number[]): void {
  if (!('vibrate' in navigator)) {
    // iOS Safari has no Vibration API at all, so a cue that relies on it is
    // silent there in a second way. Worth one record rather than nothing.
    trace('audio.vibrate.absent', {})
    return
  }
  const ok = navigator.vibrate(pattern)
  trace('audio.vibrate', { ok })
}

export type CueLevel = 'nudge' | 'warning' | 'critical'

export function playCue(level: CueLevel): void {
  trace('cue.play', { level, ctx: audioCtx?.state ?? 'none' })
  if (level === 'nudge') {
    void playTone(880, 0.15)
    vibrate(80)
  } else if (level === 'warning') {
    void playTone(880, 0.15)
    void playTone(880, 0.15, 0.25)
    vibrate([80, 40, 80])
  } else {
    void playTone(660, 0.2)
    void playTone(660, 0.2, 0.3)
    void playTone(660, 0.2, 0.6)
    vibrate([120, 60, 120, 60, 120])
  }
}

// iOS requires AudioContext.resume() inside a direct synchronous touch handler;
// the caller is responsible for binding this to a user gesture (e.g. touchstart).
export function unlockAudio(): void {
  if (audioCtx?.state === 'running') return
  try {
    const ctx = getAudioCtx()
    trace('audio.unlock', { state: ctx.state })
    void ctx.resume().then(
      () => trace('audio.unlock.ok', { state: ctx.state }),
      (err: unknown) => trace('audio.unlock.failed', { error: String(err) }),
    )
  } catch (err) {
    trace('audio.unlock.threw', { error: String(err) })
  }
}

// Allow consumers to ensure the context exists before a gesture fires.
export function ensureAudioCtx(): void {
  try { getAudioCtx() } catch (err) { trace('audio.ctx.blocked', { error: String(err) }) }
}
