import { onMount, onCleanup, Show, type JSX } from 'solid-js'
import Rule from '../layout/Rule'

// Every full-screen surface in the app used to be a bare `fixed inset-0` div:
// no dialog role, no focus management, no Escape. That put the confirmation
// gate in front of every destructive action (archive, delete, deload,
// import-overwrite) out of reach of a keyboard or screen-reader user, who could
// Tab straight past it into the page behind. This wrapper is the one place that
// contract lives; the overlay call sites supply only their content.
//
// ── Which variant ────────────────────────────────────────────────────────────
// Both were already in the codebase and both are right for what they were doing,
// so neither was thrown away — but the choice is now made here, deliberately,
// rather than re-decided from scratch by whoever writes the next overlay:
//
//   card   — a bounded decision the user can answer without scrolling: a
//            confirmation, a short form, a summary. Centered over a scrim so the
//            page stays visible behind it and the modal reads as a detour.
//   sheet  — a list or form long enough to scroll. Full-bleed, because a
//            scrolling card inside a scrim is two nested scroll regions on a
//            phone, and the page behind it is not context the user needs.
//
// If neither fits, widen one of these two rather than adding a third.
type Variant = 'card' | 'sheet'

let seq = 0

interface Props {
  /**
   * Visible title. Rendered per variant (a sheet header row, a card heading) and
   * wired to `aria-labelledby`, so the accessible name can't drift from what's
   * on screen. Prefer this over `label`.
   */
  title?: string
  /**
   * Accessible name. Needed when there is no visible title, or when the title is
   * too terse to identify the dialog on its own ("TM ADJUSTMENT" — for which
   * lift?). Precedence is explicit-wins: `labelledBy`, then `label`, then the
   * rendered `title`.
   */
  label?: string
  /** Id of an element inside the dialog that already names it. */
  labelledBy?: string
  onClose: () => void
  variant?: Variant
  /**
   * Where focus lands on open. `first` (default) is the ordinary case. `container`
   * is for dialogs whose first control is destructive — landing on it would arm
   * a delete under the next Enter keypress.
   */
  initialFocus?: 'first' | 'container'
  /** Card headings are accent by default; `text` is for a neutral confirm. */
  titleTone?: 'accent' | 'text'
  /**
   * Sheets get a "← BACK" control in the header by default. Set false for a
   * sheet that already offers its own way out lower down.
   */
  backButton?: boolean
  /** Extra classes for the inner panel (card variant) or the sheet root. */
  class?: string
  children: JSX.Element
}

// Hidden-but-focusable elements are excluded in the selector rather than by
// measuring layout: `offsetParent`/`getClientRects()` both report "invisible"
// for every element under jsdom, which would silently reduce the trap to a
// no-op in tests. The app hides things by unmounting (`<Show>`), so the
// attribute checks cover the real cases.
const NOT_HIDDEN = ':not([hidden]):not([aria-hidden="true"])'
const FOCUSABLE = [
  `a[href]${NOT_HIDDEN}`,
  `button:not([disabled])${NOT_HIDDEN}`,
  `textarea:not([disabled])${NOT_HIDDEN}`,
  `input:not([disabled]):not([type="hidden"])${NOT_HIDDEN}`,
  `select:not([disabled])${NOT_HIDDEN}`,
  `[tabindex]:not([tabindex="-1"])${NOT_HIDDEN}`,
].join(',')

export default function Modal(props: Props) {
  // eslint-disable-next-line no-unassigned-vars -- Solid `ref={root}` assigns at runtime
  let root!: HTMLDivElement

  const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))

  onMount(() => {
    // Captured before we move focus, restored on unmount so closing the dialog
    // returns the user to the control that opened it rather than the top of the
    // document.
    const opener = document.activeElement as HTMLElement | null

    if (props.initialFocus === 'container') root.focus()
    else (focusables()[0] ?? root).focus()

    onCleanup(() => {
      if (opener?.isConnected) opener.focus()
    })
  })

  // Keydown, not keyup: Escape must beat any native default (a number input's
  // revert-on-Escape) to the punch. Bound on the dialog rather than the window
  // because focus is trapped inside it, so every keystroke passes through here.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      props.onClose()
      return
    }
    if (e.key !== 'Tab') return

    const items = focusables()
    // Nothing focusable inside: keep the caret here rather than letting Tab
    // escape to the page behind.
    if (items.length === 0) { e.preventDefault(); root.focus(); return }

    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === root)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const sheet = () => props.variant === 'sheet'
  const titleId = `modal-title-${++seq}`
  // Explicit wins: a caller that spelled out a name meant it. The rendered
  // title is the default so the two can't silently drift.
  const labelledBy = () =>
    props.labelledBy ?? (props.label ? undefined : props.title ? titleId : undefined)

  // The sheet header — "← BACK", the title, and a spacer that keeps the title
  // optically centered against the back button. Three call sites hand-rolled
  // this identically; it lives here now so a fourth can't drift.
  const header = () => (
    <Show when={props.title}>
      <div class="flex items-center justify-between mb-4">
        <Show when={props.backButton !== false} fallback={<div class="w-14" />}>
          <button
            onClick={() => props.onClose()}
            class="text-muted hover:text-text text-xs tracking-widest"
          >
            ← BACK
          </button>
        </Show>
        {/* The Rule renders the title as `--- TITLE ------…`, which is the right
            look and a terrible accessible name. The dashes are hidden from
            assistive tech and a clean copy of the title carries the name. */}
        <h2 id={titleId} class="sr-only">{props.title}</h2>
        <Rule label={props.title!} class="text-muted" aria-hidden="true" />
        <div class="w-14" />
      </div>
    </Show>
  )

  const cardTitle = () => (
    <Show when={props.title}>
      <div
        id={titleId}
        class={`uppercase tracking-widest text-sm mb-4 ${
          props.titleTone === 'text' ? 'text-text' : 'text-accent'
        }`}
      >
        {props.title}
      </div>
    </Show>
  )

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy() ? undefined : props.label}
      aria-labelledby={labelledBy()}
      tabindex={-1}
      onKeyDown={onKeyDown}
      class={
        sheet()
          ? `fixed inset-0 bg-bg z-50 focus:outline-none ${props.class ?? ''}`
          : 'fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 focus:outline-none'
      }
      style={sheet() ? { 'padding-top': 'max(1rem, env(safe-area-inset-top, 0px))' } : undefined}
    >
      <Show
        when={sheet()}
        fallback={<div class={props.class}>{cardTitle()}{props.children}</div>}
      >
        {header()}
        {props.children}
      </Show>
    </div>
  )
}
