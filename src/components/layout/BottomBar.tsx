import type { JSX } from 'solid-js'

/**
 * The fixed strip a logging screen keeps at the bottom of the viewport.
 *
 * Presentational only, and deliberately store-free: the PT run screen uses it
 * too, and PT has no `workout-store` and no rest state. It owns the position,
 * the background and the top border so its rows can stack without each one
 * drawing its own bar — which is what let the rest timer and the session strip
 * occupy the same slot and hide each other.
 *
 * It sits above the nav bar rather than at the very bottom, and anything it
 * covers has to be paid for in the page's own bottom padding.
 */
export default function BottomBar(props: { children: JSX.Element }) {
  return (
    <div class="fixed bottom-[var(--nav-h)] left-0 right-0 bg-bg border-t-2 border-border">
      <div class="max-w-3xl mx-auto px-4">{props.children}</div>
    </div>
  )
}
