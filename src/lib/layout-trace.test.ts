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
  it('records nested scroll offsets even when anchor geometry stays unchanged', () => {
    setTraceEnabled(true)
    stop = installLayoutTrace()
    vi.advanceTimersByTime(2000)
    const area = document.querySelector('textarea')!
    for (const top of [100, 200]) {
      area.scrollTop = top
      area.dispatchEvent(new Event('scroll'))
      vi.advanceTimersByTime(2000)
      expect(readTrace().at(-1)?.d?.interaction).toMatchObject({ kind: 'scroll', tag: 'textarea', scroll: [0, top] })
    }
    expect(readTrace().filter(e => e.ev === 'layout.sample')).toHaveLength(3)
  })
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

  it('does not hit-test elements that have no box on screen', () => {
    const bar = document.querySelector('[data-layout-anchor="session-bar"]')!
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 5000, 100, 40))
    const record = layoutSnapshot(true).anchors.find(a => a.landmark === 'session-bar')!
    expect(record).toMatchObject({ onScreen: false, centerHit: null, centerUnobstructed: null })
  })

  it('serialises a shared ancestor once per snapshot', () => {
    const anchors = layoutSnapshot(true).anchors
    const ancestors = anchors.flatMap(a => a.ancestors)
    expect(ancestors.filter(a => a.path.endsWith('div:1') && !('repeat' in a)).length).toBe(1)
    expect(ancestors.some(a => 'repeat' in a)).toBe(true)
  })

  it('trims a capture that would exceed the record budget and reports whether it was recorded', () => {
    setTraceEnabled(true)
    document.getElementById('root')!.insertAdjacentHTML('beforeend', '<div data-section="x">' + '<button>b</button>'.repeat(60) + '</div>')
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 50, 20))
    vi.spyOn(window, 'getComputedStyle').mockReturnValue(new Proxy({}, { get: () => 'x'.repeat(200) }) as CSSStyleDeclaration)
    expect(captureLayout()).toBe(true)
    const d = readTrace().find(e => e.ev === 'layout.capture')!.d!
    expect(d.oversized).toBeUndefined()
    expect(d.trimmed).toBeDefined()
  })

  it('reports false when tracing is off', () => {
    expect(captureLayout()).toBe(false)
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

  // jsdom has no layout: every rect is empty unless a test supplies one.
  const visibleRect = (hidden: (el: Element) => boolean) =>
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const h = hidden(this) ? 0 : 20
      return { x: 0, y: 10, width: h && 50, height: h, top: 10, bottom: 10 + h, left: 0, right: 50 } as DOMRect
    })

  it('reports visible elements even when more than 400 precede them in the document', () => {
    const filler = Array.from({ length: 450 }, () => '<button data-hidden>x</button>').join('')
    document.body.innerHTML = `<div id="root">${filler}<div data-section="late"></div></div>`
    visibleRect(el => el.hasAttribute('data-hidden'))
    const snapshot = layoutSnapshot(true) as { elements: { section: string | null }[] }
    expect(snapshot.elements.map(e => e.section)).toEqual(['late'])
  })

  it('does not record text, only structure and numeric ids in data-section', () => {
    document.body.innerHTML = '<div id="root"><div data-section="assist-extra-12"><button>Bench Press</button></div></div>'
    visibleRect(() => false)
    const encoded = JSON.stringify(layoutSnapshot(true))
    expect(encoded).toContain('assist-extra-12')
    expect(encoded).not.toContain('Bench Press')
  })

  it('skips samples that repeat an unchanged layout', () => {
    setTraceEnabled(true)
    stop = installLayoutTrace()
    vi.advanceTimersByTime(2000)
    const first = readTrace().filter(e => e.ev === 'layout.sample').length
    expect(first).toBe(1)
    vi.advanceTimersByTime(30000)
    expect(readTrace().filter(e => e.ev === 'layout.sample')).toHaveLength(1)
    vi.advanceTimersByTime(40000)
    expect(readTrace().filter(e => e.ev === 'layout.sample').length).toBeGreaterThan(1)
  })
})
