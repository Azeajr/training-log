// Module-scoped AudioContext: iOS requires a single instance unlocked by a
// user gesture; we keep one across remounts of any consumer.
let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

async function playTone(freq: number, duration: number, startDelay = 0): Promise<void> {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = ctx.currentTime + startDelay
    gain.gain.setValueAtTime(0.25, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
    osc.start(t)
    osc.stop(t + duration + 0.05)
  } catch {
    // audio not available
  }
}

function vibrate(pattern: number | number[]): void {
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

export type CueLevel = 'nudge' | 'warning' | 'critical'

export function playCue(level: CueLevel): void {
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
  try { void getAudioCtx().resume() } catch { /* ignore */ }
}

// Allow consumers to ensure the context exists before a gesture fires.
export function ensureAudioCtx(): void {
  try { getAudioCtx() } catch { /* ignore if browser blocks before gesture */ }
}
