// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Fake Web Audio surface: pins OUR parameters and timing (frequencies, gain
// envelope, start/stop offsets, singleton/resume state handling) — not the
// platform. jsdom has no AudioContext, so without this stub the whole module
// dies in its catch blocks and nothing is observable.
class FakeOscillator {
  type = ''
  frequency = { value: 0 }
  connect = vi.fn()
  start = vi.fn()
  stop = vi.fn()
}

class FakeGain {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
  connect = vi.fn()
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  state: 'running' | 'suspended' | 'closed' = 'running'
  currentTime = 100
  destination = {}
  oscillators: FakeOscillator[] = []
  gains: FakeGain[] = []
  resume = vi.fn(async () => { this.state = 'running' })
  constructor() { FakeAudioContext.instances.push(this) }
  createOscillator() { const o = new FakeOscillator(); this.oscillators.push(o); return o }
  createGain() { const g = new FakeGain(); this.gains.push(g); return g }
}

const flush = () => new Promise<void>(r => setTimeout(r, 0))

type AudioCues = typeof import('./audio-cues')
const loadModule = (): Promise<AudioCues> => import('./audio-cues')

let vibrateSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetModules()
  FakeAudioContext.instances = []
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vibrateSpy = vi.fn()
  Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, writable: true, configurable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (navigator as { vibrate?: unknown }).vibrate
})

describe('playCue tone parameters', () => {
  it('nudge: one 880Hz sine, gain 0.25 ramped to 0.001 over 0.15s, stop at +0.2', async () => {
    const { playCue } = await loadModule()
    playCue('nudge')
    await flush()
    expect(FakeAudioContext.instances).toHaveLength(1)
    const ctx = FakeAudioContext.instances[0]
    expect(ctx.oscillators).toHaveLength(1)
    const osc = ctx.oscillators[0]
    expect(osc.type).toBe('sine')
    expect(osc.frequency.value).toBe(880)
    expect(osc.start.mock.calls[0][0]).toBeCloseTo(100, 5)   // currentTime + 0 delay
    expect(osc.stop.mock.calls[0][0]).toBeCloseTo(100.2, 5)  // t + 0.15 + 0.05
    const gain = ctx.gains[0].gain
    expect(gain.setValueAtTime.mock.calls[0][0]).toBe(0.25)
    expect(gain.setValueAtTime.mock.calls[0][1]).toBeCloseTo(100, 5)
    expect(gain.exponentialRampToValueAtTime.mock.calls[0][0]).toBe(0.001)
    expect(gain.exponentialRampToValueAtTime.mock.calls[0][1]).toBeCloseTo(100.15, 5)
    expect(vibrateSpy).toHaveBeenCalledWith(80)
  })

  it('warning: two 880Hz tones, second delayed 0.25s, vibration 80/40/80', async () => {
    const { playCue } = await loadModule()
    playCue('warning')
    await flush()
    const ctx = FakeAudioContext.instances[0]
    expect(ctx.oscillators).toHaveLength(2)
    expect(ctx.oscillators.map(o => o.frequency.value)).toEqual([880, 880])
    expect(ctx.oscillators[0].start.mock.calls[0][0]).toBeCloseTo(100, 5)
    expect(ctx.oscillators[1].start.mock.calls[0][0]).toBeCloseTo(100.25, 5)
    expect(ctx.oscillators[1].stop.mock.calls[0][0]).toBeCloseTo(100.45, 5)  // 100.25 + 0.15 + 0.05
    expect(vibrateSpy).toHaveBeenCalledWith([80, 40, 80])
  })

  it('critical: three 660Hz tones at +0/+0.3/+0.6, 0.2s each, vibration 120/60 alternating', async () => {
    const { playCue } = await loadModule()
    playCue('critical')
    await flush()
    const ctx = FakeAudioContext.instances[0]
    expect(ctx.oscillators).toHaveLength(3)
    expect(ctx.oscillators.map(o => o.frequency.value)).toEqual([660, 660, 660])
    const starts = ctx.oscillators.map(o => o.start.mock.calls[0][0] as number)
    expect(starts[0]).toBeCloseTo(100, 5)
    expect(starts[1]).toBeCloseTo(100.3, 5)
    expect(starts[2]).toBeCloseTo(100.6, 5)
    expect(ctx.oscillators[0].stop.mock.calls[0][0]).toBeCloseTo(100.25, 5)  // t + 0.2 + 0.05
    expect(vibrateSpy).toHaveBeenCalledWith([120, 60, 120, 60, 120])
  })
})

describe('AudioContext lifecycle', () => {
  it('reuses one context across multiple cues', async () => {
    const { playCue } = await loadModule()
    playCue('nudge')
    await flush()
    playCue('nudge')
    await flush()
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(2)
  })

  it('recreates the context when the previous one is closed', async () => {
    const { playCue } = await loadModule()
    playCue('nudge')
    await flush()
    FakeAudioContext.instances[0].state = 'closed'
    playCue('nudge')
    await flush()
    expect(FakeAudioContext.instances).toHaveLength(2)
    expect(FakeAudioContext.instances[1].oscillators).toHaveLength(1)
  })

  it('resumes a suspended context before playing the tone', async () => {
    const { playCue } = await loadModule()
    playCue('nudge')
    await flush()
    const ctx = FakeAudioContext.instances[0]
    ctx.state = 'suspended'
    playCue('nudge')
    await flush()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(ctx.oscillators).toHaveLength(2)  // tone still played after resume
  })

  it('does not resume a running context', async () => {
    const { playCue } = await loadModule()
    playCue('nudge')
    await flush()
    expect(FakeAudioContext.instances[0].resume).not.toHaveBeenCalled()
  })
})

describe('unlockAudio', () => {
  it('creates and resumes the context when none exists', async () => {
    const { unlockAudio } = await loadModule()
    expect(() => unlockAudio()).not.toThrow()
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(FakeAudioContext.instances[0].resume).toHaveBeenCalledTimes(1)
  })

  it('resumes an existing suspended context without recreating it', async () => {
    const { playCue, unlockAudio } = await loadModule()
    playCue('nudge')
    await flush()
    const ctx = FakeAudioContext.instances[0]
    ctx.state = 'suspended'
    unlockAudio()
    expect(ctx.resume).toHaveBeenCalledTimes(1)
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('no-ops when the context is already running', async () => {
    const { playCue, unlockAudio } = await loadModule()
    playCue('nudge')
    await flush()
    unlockAudio()
    expect(FakeAudioContext.instances[0].resume).not.toHaveBeenCalled()
  })
})

describe('ensureAudioCtx', () => {
  it('constructs the context eagerly', async () => {
    const { ensureAudioCtx } = await loadModule()
    ensureAudioCtx()
    expect(FakeAudioContext.instances).toHaveLength(1)
  })

  it('reuses the existing context on a second call', async () => {
    const { ensureAudioCtx } = await loadModule()
    ensureAudioCtx()
    ensureAudioCtx()
    expect(FakeAudioContext.instances).toHaveLength(1)
  })
})

describe('vibration guard', () => {
  it('skips vibration when navigator does not support it — tone still plays', async () => {
    delete (navigator as { vibrate?: unknown }).vibrate
    const { playCue } = await loadModule()
    expect(() => playCue('nudge')).not.toThrow()
    await flush()
    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(1)
  })
})

// ── diagnostics ─────────────────────────────────────────────────────────────
// On an installed iOS PWA with the app open and visible, the rest bell makes no
// sound, while the same path works on desktop. Nothing in this module reported
// anything, because every failure it has ends in a swallowed catch. These cases
// pin what the trace must say in each of the three candidate worlds, so the
// export can be read as an answer rather than a hint.
describe('audio trace', () => {
  async function loadTracing(on: boolean) {
    localStorage.clear()
    if (on) localStorage.setItem('notif-trace-on', '1')
    const traceMod = await import('./trace')
    traceMod.reloadTrace()
    const audio = await loadModule()
    return { ...audio, ...traceMod }
  }

  it('records nothing at all while tracing is off', async () => {
    const { playCue, readTrace } = await loadTracing(false)
    playCue('nudge')
    await flush()
    expect(readTrace()).toHaveLength(0)
    // and the cue itself is untouched
    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(1)
  })

  it('does not even attach an onended handler while tracing is off', async () => {
    const { playCue } = await loadTracing(false)
    playCue('nudge')
    await flush()
    const osc = FakeAudioContext.instances[0].oscillators[0] as FakeOscillator & { onended?: unknown }
    expect(osc.onended).toBeUndefined()
  })

  it('records the whole arc of a tone that plays', async () => {
    const { playCue, readTrace } = await loadTracing(true)
    playCue('nudge')
    await flush()
    const osc = FakeAudioContext.instances[0].oscillators[0] as FakeOscillator & {
      onended?: () => void
    }
    osc.onended?.()
    const evs = readTrace().map(e => e.ev)
    expect(evs).toContain('cue.play')
    expect(evs).toContain('audio.tone')
    expect(evs).toContain('audio.tone.armed')
    expect(evs).toContain('audio.tone.ended')
  })

  it('stops at audio.tone when resume never resolves — the cue never ran', async () => {
    const { playCue, readTrace } = await loadTracing(true)
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        this.state = 'suspended'
        // A resume that never settles is the first candidate world: iOS
        // refusing to resume a context outside a gesture.
        this.resume = vi.fn(() => new Promise<void>(() => {})) as never
      }
    })
    playCue('nudge')
    await flush()
    const evs = readTrace().map(e => e.ev)
    expect(evs).toContain('audio.tone')
    // Everything after the await is dead code in this world, and the absence
    // of these two is what says so.
    expect(evs).not.toContain('audio.tone.resumed')
    expect(evs).not.toContain('audio.tone.armed')
  })

  it('reports the error the catch used to swallow', async () => {
    const { playCue, readTrace } = await loadTracing(true)
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      createOscillator(): never { throw new TypeError('no oscillator for you') }
    })
    playCue('nudge')
    await flush()
    const failed = readTrace().find(e => e.ev === 'audio.tone.failed')
    expect(failed).toBeDefined()
    expect(String(failed?.d?.error)).toContain('no oscillator for you')
  })

  it('records a missing Vibration API rather than nothing', async () => {
    const { playCue, readTrace } = await loadTracing(true)
    delete (navigator as { vibrate?: unknown }).vibrate
    playCue('nudge')
    await flush()
    expect(readTrace().map(e => e.ev)).toContain('audio.vibrate.absent')
  })
})

// ── F108 ────────────────────────────────────────────────────────────────────
// `playTone` only ever resumed a context whose state was exactly `suspended`.
// WebKit has a third state — `interrupted` — that a phone lock or another app's
// audio puts the context into, and it was never even asked to resume. Captured
// on an installed iOS PWA: a note armed at t+581.0 did not sound until t+611.4,
// when the touch that hit SKIP resumed the context and released it. The bell
// rang half a minute after the rest it belonged to.
describe('a context that is not running (F108)', () => {
  async function loadTracing() {
    localStorage.clear()
    localStorage.setItem('notif-trace-on', '1')
    const traceMod = await import('./trace')
    traceMod.reloadTrace()
    const audio = await loadModule()
    return { ...audio, ...traceMod }
  }

  /** A context stuck in `state`, whose resume() behaves as told. */
  function stubCtx(state: string, resume: () => Promise<void>) {
    const resumeSpy = vi.fn(resume)
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super()
        this.state = state as 'running' | 'suspended' | 'closed'
        this.resume = resumeSpy as never
      }
    })
    return resumeSpy
  }

  it('asks an interrupted context to resume — the old check never did', async () => {
    const { playCue, readTrace } = await loadTracing()
    const resume = stubCtx('interrupted', async () => {})
    playCue('nudge')
    await flush()
    expect(resume).toHaveBeenCalled()
    expect(readTrace().map(e => e.ev)).toContain('audio.tone.resumed')
  })

  it('records a resume that never settles instead of awaiting it forever', async () => {
    vi.useFakeTimers()
    try {
      const { playCue, readTrace } = await loadTracing()
      stubCtx('interrupted', () => new Promise<void>(() => {}))
      playCue('nudge')
      await vi.advanceTimersByTimeAsync(500)
      const resumed = readTrace().find(e => e.ev === 'audio.tone.resumed')
      // Unsettled forever is exactly what iOS does outside a user gesture, and
      // it used to leave no record at all.
      expect(resumed?.d).toMatchObject({ resumed: 'timeout' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('names the ghost bell when the note is scheduled against a stopped clock', async () => {
    const { playCue, readTrace } = await loadTracing()
    stubCtx('interrupted', async () => {})   // resolves, but state stays put
    playCue('nudge')
    await flush()
    const dead = readTrace().find(e => e.ev === 'audio.tone.deadctx')
    expect(dead?.d).toMatchObject({ state: 'interrupted' })
  })

  it('survives a resume() that throws synchronously', async () => {
    const { playCue, readTrace } = await loadTracing()
    stubCtx('interrupted', () => { throw new DOMException('InvalidStateError') })
    playCue('nudge')
    await flush()
    expect(readTrace().map(e => e.ev)).toContain('audio.tone.resumed')
    expect(readTrace().map(e => e.ev)).not.toContain('audio.tone.failed')
  })

  it('leaves a running context alone: no resume, no ghost record', async () => {
    const { playCue, readTrace } = await loadTracing()
    const resume = stubCtx('running', async () => {})
    playCue('nudge')
    await flush()
    expect(resume).not.toHaveBeenCalled()
    const evs = readTrace().map(e => e.ev)
    expect(evs).not.toContain('audio.tone.deadctx')
    expect(evs).toContain('audio.tone.armed')
  })
})
