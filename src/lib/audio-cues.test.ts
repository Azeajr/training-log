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
