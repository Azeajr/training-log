import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  startKeepalive, stopKeepalive, setKeepaliveEnabled, isKeepaliveEnabled, reloadKeepalive,
} from './keepalive'
import { readTrace, reloadTrace } from './trace'

let play: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>
let created: Blob[]
let revoked: string[]

beforeEach(() => {
  localStorage.clear()
  reloadTrace()
  reloadKeepalive()
  created = []
  revoked = []
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  // jsdom implements neither of these.
  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement['play']
  HTMLMediaElement.prototype.pause = pause as unknown as HTMLMediaElement['pause']
  HTMLMediaElement.prototype.load = vi.fn() as unknown as HTMLMediaElement['load']
  URL.createObjectURL = vi.fn((b: Blob) => { created.push(b); return `blob:fake-${created.length}` })
  URL.revokeObjectURL = vi.fn((u: string) => { revoked.push(u) })
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
    expect(created).toHaveLength(0)
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

  it('releases the object URL when the rest ends', () => {
    enable()
    startKeepalive()
    stopKeepalive()
    expect(pause).toHaveBeenCalled()
    expect(revoked).toEqual(['blob:fake-1'])
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

describe('the silent loop itself', () => {
  it('is a well-formed 16-bit mono WAV', async () => {
    enable()
    startKeepalive()
    const view = new DataView(await created[0].arrayBuffer())
    const tag = (off: number, len: number) =>
      String.fromCharCode(...Array.from({ length: len }, (_, i) => view.getUint8(off + i)))
    expect(tag(0, 4)).toBe('RIFF')
    expect(tag(8, 4)).toBe('WAVE')
    expect(view.getUint16(22, true)).toBe(1)       // mono
    expect(view.getUint16(34, true)).toBe(16)      // bits per sample
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8)
  })

  it('is near-silence, not digital silence', async () => {
    enable()
    startKeepalive()
    const view = new DataView(await created[0].arrayBuffer())
    const first = view.getInt16(44, true)
    const second = view.getInt16(46, true)
    // A run of zeroes can be detected and discarded by the engine, taking the
    // media session — and the whole point — with it. ±1 LSB is about -90 dBFS.
    expect(first).toBe(1)
    expect(second).toBe(-1)
  })
})
