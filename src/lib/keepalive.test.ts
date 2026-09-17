import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  startKeepalive, stopKeepalive, setKeepaliveEnabled, isKeepaliveEnabled, reloadKeepalive,
} from './keepalive'
import { readTrace, reloadTrace } from './trace'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  reloadTrace()
  reloadKeepalive()
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  // jsdom implements neither of these.
  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement['play']
  HTMLMediaElement.prototype.pause = pause as unknown as HTMLMediaElement['pause']
  HTMLMediaElement.prototype.load = vi.fn() as unknown as HTMLMediaElement['load']
})

afterEach(() => {
  stopKeepalive()
  vi.restoreAllMocks()
  localStorage.clear()
})

function enable() {
  localStorage.setItem('notif-keepalive-on', '1')
  localStorage.setItem('notif-trace-on', '1')
  reloadKeepalive()
  reloadTrace()
}

describe('the off switch', () => {
  it('does nothing at all while off — no element, no playback', () => {
    localStorage.setItem('notif-trace-on', '1')
    reloadTrace()
    expect(isKeepaliveEnabled()).toBe(false)
    startKeepalive()
    expect(play).not.toHaveBeenCalled()
    expect(readTrace()).toHaveLength(0)
  })

  it('stops a running loop when switched off mid-rest', () => {
    enable()
    startKeepalive()
    expect(play).toHaveBeenCalled()
    setKeepaliveEnabled(false)
    expect(pause).toHaveBeenCalled()
  })

  it('stopKeepalive is safe when nothing is running', () => {
    expect(() => stopKeepalive()).not.toThrow()
  })
})

describe('holding the process', () => {
  it('plays a looping source and records it', async () => {
    enable()
    startKeepalive()
    await Promise.resolve()
    expect(play).toHaveBeenCalledTimes(1)
    const evs = readTrace().map(e => e.ev)
    expect(evs).toContain('keepalive.play')
    expect(evs).toContain('keepalive.playing')
  })

  it('pauses and releases the element when the rest ends', () => {
    enable()
    startKeepalive()
    stopKeepalive()
    expect(pause).toHaveBeenCalled()
  })

  it('asks for an audio session that mixes rather than interrupts', () => {
    enable()
    const session: { type?: string } = {}
    Object.defineProperty(navigator, 'audioSession', { value: session, configurable: true })
    startKeepalive()
    // A gym app that stops the user's music to keep a timer alive is worse than
    // a late bell.
    expect(session.type).toBe('ambient')
    delete (navigator as { audioSession?: unknown }).audioSession
  })

  it('records the absence of the session API rather than assuming it worked', () => {
    enable()
    delete (navigator as { audioSession?: unknown }).audioSession
    startKeepalive()
    expect(readTrace().map(e => e.ev)).toContain('keepalive.session.absent')
  })
})

describe('when autoplay is refused', () => {
  it('records the refusal and retries on the next touch', async () => {
    enable()
    play.mockRejectedValueOnce(new DOMException('NotAllowedError'))
    startKeepalive()
    await Promise.resolve()
    await Promise.resolve()
    expect(readTrace().map(e => e.ev)).toContain('keepalive.blocked')

    // A rest begins from a tap, but play() runs in an effect rather than the
    // handler, so the gesture credit may already be spent.
    play.mockResolvedValue(undefined)
    document.dispatchEvent(new Event('touchstart'))
    await Promise.resolve()
    expect(play).toHaveBeenCalledTimes(2)
    const blocked = readTrace().filter(e => e.ev === 'keepalive.play')
    expect(blocked[1].d).toMatchObject({ why: 'gesture' })
  })
})

// The first device run failed every play() with `NotSupportedError` and a media
// `error` event — the loop never started, so the experiment tested nothing. The
// source was a `blob:` URL, and iOS requires a media resource that answers
// byte-range requests, which blob URLs do not. It is a shipped file now, and
// these cases hold that file to the shape the fix depends on.
describe('the shipped silence.wav', () => {
  const wav = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'silence.wav'))
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
  const tag = (off: number, len: number) =>
    String.fromCharCode(...Array.from({ length: len }, (_, i) => view.getUint8(off + i)))

  it('is a well-formed 16-bit mono PCM WAV', () => {
    expect(tag(0, 4)).toBe('RIFF')
    expect(tag(8, 4)).toBe('WAVE')
    expect(view.getUint16(20, true)).toBe(1)       // PCM
    expect(view.getUint16(22, true)).toBe(1)       // mono
    expect(view.getUint16(34, true)).toBe(16)      // bits per sample
    expect(view.getUint32(4, true)).toBe(wav.byteLength - 8)
  })

  it('is near-silence, not digital silence', () => {
    // A run of zeroes can be detected and discarded by the engine, taking the
    // media session — and the whole point — with it. ±1 LSB is about -90 dBFS.
    expect(view.getInt16(44, true)).toBe(1)
    expect(view.getInt16(46, true)).toBe(-1)
  })

  it('is what the module loads — a file, never a blob URL', () => {
    const seen: string[] = []
    const RealAudio = window.Audio
    class SpyAudio extends RealAudio {
      constructor(src?: string) {
        super(src)
        if (src !== undefined) seen.push(src)
      }
    }
    vi.stubGlobal('Audio', SpyAudio)
    enable()
    startKeepalive()
    // The regression this pins: a `blob:` URL answers no byte-range requests,
    // which iOS requires of a media resource, and every play() came back
    // `NotSupportedError`.
    expect(seen).toEqual(['/silence.wav'])
    vi.unstubAllGlobals()
  })

  it('is precached, so the loop survives going offline', () => {
    const cfg = readFileSync(join(import.meta.dirname, '..', '..', 'vite.config.ts'), 'utf8')
    const globs = /globPatterns: \['\*\*\/\*\.\{([^}]+)\}'\]/.exec(cfg)
    expect(globs?.[1].split(',')).toContain('wav')
  })
})
