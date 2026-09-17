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

/**
 * One tone.
 *
 * Everything here used to end in a bare `catch` whose comment read "audio not
 * available" — a silent failure on the path whose whole job is to make a
 * noise, which is why nothing surfaced when it stopped working. The trace
 * calls are what turn "no sound" into an answer, and they are laid out to split
 * the two candidates apart:
 *
 *   `audio.tone` with no matching `audio.tone.armed`  → `resume()` never
 *     resolved; the context is suspended and everything after the await is dead
 *     code. The cue never ran.
 *   `audio.tone.armed` with no `audio.tone.ended`     → the note was scheduled
 *     against a clock that is not advancing (`currentTime` frozen), so it will
 *     never arrive.
 *   `audio.tone.ended` and still nothing audible      → WebAudio did its job
 *     and the loss is below it: silent switch, routing, volume. Not fixable
 *     from here, but no longer a mystery.
 */
async function playTone(freq: number, duration: number, startDelay = 0): Promise<void> {
  try {
    const ctx = getAudioCtx()
    trace('audio.tone', {
      freq, duration, startDelay, state: ctx.state, currentTime: ctx.currentTime,
    })
    if (ctx.state === 'suspended') {
      await ctx.resume()
      trace('audio.tone.resumed', { state: ctx.state, currentTime: ctx.currentTime })
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
