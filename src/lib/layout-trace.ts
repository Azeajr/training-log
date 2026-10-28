import { isTraceEnabled, subscribeTraceEnabled, trace } from './trace'

// Deliberately structural: never read textContent, form values, class names,
// arbitrary attributes or URL query strings. Numeric paths are normalised.
const round = (n: number) => Math.round(n * 10) / 10
const rect = (r: DOMRect) => [r.x, r.y, r.width, r.height].map(round)
function identity(el: Element) {
  const path: string[] = []
  for (let p: Element | null = el; p && path.length < 8; p = p.parentElement) {
    path.unshift(`${p.tagName.toLowerCase()}:${p.parentElement ? [...p.parentElement.children].indexOf(p) + 1 : 1}`)
  }
  return {
    tag: el.tagName.toLowerCase(), landmark: el.getAttribute('data-layout-anchor'),
    section: el.closest('[data-section]')?.getAttribute('data-section') ?? null,
    path: path.join('/'),
  }
}
function css(el: Element) {
  const s = getComputedStyle(el)
  return {
    position: s.position, display: s.display, visibility: s.visibility,
    opacity: s.opacity, zIndex: s.zIndex, overflowX: s.overflowX, overflowY: s.overflowY,
    transform: s.transform, filter: s.filter, contain: s.contain, willChange: s.willChange,
    top: s.top, bottom: s.bottom, height: s.height, maxHeight: s.maxHeight,
    paddingBottom: s.paddingBottom,
    width: s.width, minWidth: s.minWidth, boxSizing: s.boxSizing,
    fontSize: s.fontSize, lineHeight: s.lineHeight, whiteSpace: s.whiteSpace,
    flex: s.flex, flexDirection: s.flexDirection, gap: s.gap,
  }
}

function elementRecord(el: Element, detailed: boolean) {
  const r = el.getBoundingClientRect()
  const x = Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2))
  const y = Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2))
  const hit = document.elementFromPoint?.(x, y)
  const ancestors = []
  for (let p = detailed ? el.parentElement : null; p && ancestors.length < 6; p = p.parentElement) {
    ancestors.push({ ...identity(p), rect: rect(p.getBoundingClientRect()), css: css(p) })
  }
  return {
    ...identity(el), rect: rect(r), css: detailed ? css(el) : (() => {
      const s = getComputedStyle(el)
      return { position: s.position, bottom: s.bottom, display: s.display, visibility: s.visibility }
    })(),
    scroll: [el.scrollLeft, el.scrollTop, el.scrollWidth, el.scrollHeight, el.clientWidth, el.clientHeight],
    centerHit: hit ? identity(hit) : null,
    centerUnobstructed: Boolean(hit && el.contains(hit)), ancestors,
  }
}

const CANDIDATES = 'button,input,textarea,select,main,nav,h1,h2,h3,img,svg,[data-section]'
const MAX_SCANNED = 2000
const MAX_VISIBLE = 60

export function layoutSnapshot(detailed = false) {
  const vv = window.visualViewport
  const root = document.documentElement
  const anchors = [...document.querySelectorAll('[data-layout-anchor], [role="dialog"], dialog')].slice(0, 16)
  // A bounded structural map makes overflow and overlapping controls visible
  // without serialising the DOM or user-entered content.
  // Filter for visibility BEFORE capping, so a page scrolled past the first
  // candidates in document order still reports what is on screen.
  const matches = detailed ? [...document.querySelectorAll(CANDIDATES)] : []
  const scanned = matches.slice(0, MAX_SCANNED)
  const visible = scanned.filter(el => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
  })
  return {
    route: location.pathname.replace(/\d+/g, ':id'),
    window: [innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio],
    visualViewport: vv ? { width: vv.width, height: vv.height, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, pageLeft: vv.pageLeft, pageTop: vv.pageTop, scale: vv.scale } : null,
    scroll: [scrollX, scrollY, root.scrollWidth, root.scrollHeight, root.clientWidth, root.clientHeight],
    orientation: screen.orientation?.type ?? null, visibility: document.visibilityState,
    focus: document.activeElement ? identity(document.activeElement) : null,
    fonts: document.fonts?.status ?? null,
    anchors: anchors.map(el => elementRecord(el, detailed)),
    ...(detailed ? { elements: visible.slice(0, MAX_VISIBLE).map(el => ({ ...identity(el), rect: rect(el.getBoundingClientRect()), css: css(el) })), truncated: matches.length > MAX_SCANNED || visible.length > MAX_VISIBLE } : {}),
  }
}

export function captureLayout(reason = 'manual') {
  if (!isTraceEnabled()) return
  try { trace('layout.capture', { reason, ...layoutSnapshot(true) }) }
  catch { trace('layout.unavailable', { reason }) }
}

const QUIET_RECORD_MS = 60_000

/** Active only while tracing. Coalesce busy scroll/mutation streams; do not
 * write localStorage or measure layout on each animation frame. */
export function installLayoutTrace(): () => void {
  let stopActive = () => {}
  const activate = (on: boolean) => {
    stopActive()
    stopActive = () => {}
    if (!on) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const reasons = new Set<string>()
    let interaction: { kind: string; target: Element } | null = null
    // An unchanged layout is not new evidence; skipping it spares the
    // synchronous storage write and keeps captures from being rolled off.
    let lastKey = ''
    let lastAt = 0
    let writeMs = 0
    const sample = () => {
      timer = undefined
      try {
        const started = performance.now()
        const snapshot = layoutSnapshot()
        const key = JSON.stringify(snapshot)
        const measureMs = round(performance.now() - started)
        if (key !== lastKey || started - lastAt >= QUIET_RECORD_MS) {
          lastKey = key
          lastAt = started
          const target = interaction?.target
          trace('layout.sample', {
            reasons: [...reasons],
            interaction: target ? { kind: interaction!.kind, ...identity(target), scroll: [target.scrollLeft, target.scrollTop] } : null,
            ...snapshot, measureMs, prevWriteMs: writeMs,
          })
          writeMs = round(performance.now() - started - measureMs)
        }
      }
      catch { trace('layout.unavailable') }
      reasons.clear()
      interaction = null
    }
    const schedule = (reason: string) => {
      reasons.add(reason)
      timer ??= setTimeout(sample, 2000)
    }
    const cleanups: (() => void)[] = []
    const listen = (target: EventTarget, name: string, reason = name) => {
      const fn = (event: Event) => {
        if (event.target instanceof Element && ['scroll', 'focusin', 'click'].includes(name)) {
          interaction = { kind: name, target: event.target }
        }
        schedule(reason)
      }
      target.addEventListener(name, fn, { passive: true, capture: true })
      cleanups.push(() => target.removeEventListener(name, fn, true))
    }
    for (const name of ['scroll', 'resize', 'orientationchange', 'pageshow']) listen(window, name)
    for (const name of ['focusin', 'focusout', 'visibilitychange', 'click']) listen(document, name)
    if (window.visualViewport) {
      listen(window.visualViewport, 'resize', 'viewport.resize')
      listen(window.visualViewport, 'scroll', 'viewport.scroll')
    }
    const mutations = new MutationObserver(records => {
      // Timer text changes every second. Only element additions/removals or
      // style/class changes can require a new structural measurement.
      if (records.some(r => r.type === 'attributes' || [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === Node.ELEMENT_NODE))) schedule('dom')
    })
    mutations.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] })
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule('layout.resize'))
    resize?.observe(document.documentElement)
    const heartbeat = setInterval(() => { if (!document.hidden) schedule('heartbeat') }, 10000)
    schedule('trace.start')
    stopActive = () => {
      if (timer !== undefined) clearTimeout(timer)
      clearInterval(heartbeat)
      mutations.disconnect()
      resize?.disconnect()
      cleanups.forEach(fn => fn())
    }
  }
  const unsubscribe = subscribeTraceEnabled(activate)
  activate(isTraceEnabled())
  return () => { unsubscribe(); stopActive() }
}
