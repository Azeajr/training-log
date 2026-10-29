import { isTraceEnabled, subscribeTraceEnabled, trace } from './trace'

// Deliberately structural: never read textContent, form values, class names,
// arbitrary attributes or URL query strings. Numeric paths are normalised.
const round = (n: number) => Math.round(n * 10) / 10
const rect = (r: DOMRect) => [r.x, r.y, r.width, r.height].map(round)
/** 1-based position among element siblings, walking back rather than copying
 *  the parent's whole child list (a long history list has hundreds). */
function siblingIndex(el: Element) {
  let i = 1
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) i++
  return i
}
function identity(el: Element) {
  const path: string[] = []
  for (let p: Element | null = el; p && path.length < 8; p = p.parentElement) {
    path.unshift(`${p.tagName.toLowerCase()}:${siblingIndex(p)}`)
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

function briefCss(el: Element) {
  const s = getComputedStyle(el)
  return { position: s.position, bottom: s.bottom, display: s.display, visibility: s.visibility }
}
const isOnScreen = (r: DOMRect) =>
  r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth

/** `seen` holds ancestor paths already serialised in full by an earlier anchor;
 *  a shared ancestor is then reported by identity alone. */
function elementRecord(el: Element, detailed: boolean, seen: Set<string>) {
  const r = el.getBoundingClientRect()
  // An element with no box or none on screen has no point to hit-test; clamping
  // one would report whatever sits at the viewport edge as "obstructing" it.
  const onScreen = isOnScreen(r)
  const hit = onScreen
    ? document.elementFromPoint?.(
      Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2)),
      Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2)),
    )
    : null
  const ancestors = []
  for (let p = detailed ? el.parentElement : null; p && ancestors.length < 6; p = p.parentElement) {
    const id = identity(p)
    if (seen.has(id.path)) { ancestors.push({ ...id, repeat: true }); continue }
    seen.add(id.path)
    ancestors.push({ ...id, rect: rect(p.getBoundingClientRect()), css: css(p) })
  }
  return {
    ...identity(el), rect: rect(r), css: detailed ? css(el) : briefCss(el),
    scroll: [el.scrollLeft, el.scrollTop, el.scrollWidth, el.scrollHeight, el.clientWidth, el.clientHeight],
    onScreen,
    centerHit: hit ? identity(hit) : null,
    centerUnobstructed: onScreen ? Boolean(hit && el.contains(hit)) : null, ancestors,
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
  const visible = scanned.filter(el => isOnScreen(el.getBoundingClientRect()))
  const seen = new Set<string>()
  return {
    route: location.pathname.replace(/\d+/g, ':id'),
    window: [innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio],
    visualViewport: vv ? { width: vv.width, height: vv.height, offsetLeft: vv.offsetLeft, offsetTop: vv.offsetTop, pageLeft: vv.pageLeft, pageTop: vv.pageTop, scale: vv.scale } : null,
    scroll: [scrollX, scrollY, root.scrollWidth, root.scrollHeight, root.clientWidth, root.clientHeight],
    orientation: screen.orientation?.type ?? null, visibility: document.visibilityState,
    focus: document.activeElement ? identity(document.activeElement) : null,
    fonts: document.fonts?.status ?? null,
    anchors: anchors.map(el => elementRecord(el, detailed, seen)),
    ...(detailed ? { elements: visible.slice(0, MAX_VISIBLE).map(el => ({ ...identity(el), rect: rect(el.getBoundingClientRect()), css: css(el) })), truncated: matches.length > MAX_SCANNED || visible.length > MAX_VISIBLE } : {}),
  }
}

// trace() replaces any record over half its byte budget with a bare marker;
// stay well under that so the capture degrades in detail instead of vanishing.
const MAX_CAPTURE_CHARS = 80_000

/** Whether a capture was recorded; false when tracing is off or it failed. */
export function captureLayout(reason = 'manual'): boolean {
  if (!isTraceEnabled()) return false
  try {
    let snapshot: Record<string, unknown> = layoutSnapshot(true)
    if (JSON.stringify(snapshot).length > MAX_CAPTURE_CHARS) {
      snapshot = { ...snapshot, elements: undefined, trimmed: 'elements' }
    }
    if (JSON.stringify(snapshot).length > MAX_CAPTURE_CHARS) {
      snapshot = { ...layoutSnapshot(false), trimmed: 'elements,ancestors' }
    }
    trace('layout.capture', { reason, ...snapshot })
    return true
  } catch {
    trace('layout.unavailable', { reason })
    return false
  }
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
        const target = interaction?.target
        const interactionRecord = target ? { kind: interaction!.kind, ...identity(target), scroll: [target.scrollLeft, target.scrollTop] } : null
        const key = JSON.stringify({ snapshot, interaction: interactionRecord })
        const measureMs = round(performance.now() - started)
        if (key !== lastKey || started - lastAt >= QUIET_RECORD_MS) {
          lastKey = key
          lastAt = started
          trace('layout.sample', {
            reasons: [...reasons],
            interaction: interactionRecord,
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
      // style/class changes can require a new structural measurement — except
      // inside `data-layout-volatile`, a fixed-size box restyled every tick (the
      // rest bar's width), which would otherwise resample every rest.
      if (records.some(r => !(r.target instanceof Element && r.target.closest('[data-layout-volatile]'))
        && (r.type === 'attributes' || [...r.addedNodes, ...r.removedNodes].some(n => n.nodeType === Node.ELEMENT_NODE)))) schedule('dom')
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
