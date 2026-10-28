import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureLayout, installLayoutTrace, layoutSnapshot } from './layout-trace'
import { readTrace, reloadTrace, setTraceEnabled } from './trace'

let stop = () => {}
beforeEach(() => {
  localStorage.clear()
  reloadTrace()
  vi.useFakeTimers()
  document.body.innerHTML = '<div id="root"><main data-layout-anchor="main"><textarea>PRIVATE NOTE</textarea><div data-layout-anchor="session-bar" style="position:fixed;bottom:56px"><button>PRIVATE EXERCISE</button></div></main></div>'
})
afterEach(() => { stop(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

describe('layout evidence', () => {
  it('records geometry and containing styles without text or input values', () => {
    const textarea = document.querySelector('textarea')!
    textarea.value = 'SECRET VALUE'
    textarea.focus()
    const snapshot = layoutSnapshot(true)
    expect(snapshot.focus?.tag).toBe('textarea')
    expect(snapshot.anchors.find(a => a.landmark === 'session-bar')?.css).toMatchObject({position:'fixed',bottom:'56px'})
    const encoded = JSON.stringify(snapshot)
    for (const secret of ['PRIVATE NOTE', 'PRIVATE EXERCISE', 'SECRET VALUE']) expect(encoded).not.toContain(secret)
  })

  it('stays inactive when off; starts on toggle, coalesces scrolls and stops immediately', () => {
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    stop = installLayoutTrace()
    window.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(1000)
    expect(readTrace()).toHaveLength(0)
    expect(measure).not.toHaveBeenCalled()
    setTraceEnabled(true)
    for (let i=0; i<30; i++) window.dispatchEvent(new Event('scroll'))
    expect(measure).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    const samples = readTrace().filter(e=>e.ev==='layout.sample')
    expect(samples).toHaveLength(1)
    expect(samples[0].d?.reasons).toContain('scroll')
    window.dispatchEvent(new Event('scroll'))
    setTraceEnabled(false)
    const count = readTrace().length
    vi.advanceTimersByTime(10000)
    captureLayout()
    expect(readTrace()).toHaveLength(count)
  })

  it('captures viewport offset changes and survives missing browser APIs', () => {
    const viewport = new EventTarget()
    Object.assign(viewport, {width:375,height:320,offsetTop:210,offsetLeft:0,pageTop:900,pageLeft:0,scale:1})
    vi.stubGlobal('visualViewport', viewport)
    setTraceEnabled(true)
    stop = installLayoutTrace()
    viewport.dispatchEvent(new Event('resize'))
    vi.advanceTimersByTime(2000)
    expect(readTrace().find(e=>e.ev==='layout.sample')?.d).toMatchObject({visualViewport:{height:320,offsetTop:210},reasons:expect.arrayContaining(['viewport.resize'])})
    captureLayout()
    expect(readTrace().at(-1)?.ev).toBe('layout.capture')
    vi.unstubAllGlobals()
  })

  it('resumes collection when tracing was enabled before boot and cleans up on disposal', () => {
    setTraceEnabled(true)
    stop = installLayoutTrace()
    vi.advanceTimersByTime(2000)
    expect(readTrace().some(e=>e.ev==='layout.sample')).toBe(true)
    stop()
    const count = readTrace().length
    vi.advanceTimersByTime(10000)
    expect(readTrace()).toHaveLength(count)
  })
})
