import { createEffect, createSignal, on, Show, type JSX } from 'solid-js'
import SectionLabel from '../layout/SectionLabel'

let seq = 0

interface Props {
  label: string
  /**
   * True when every set in this section is behind the linear cursor. This is
   * the whole safety condition: a section is only ever collapsible once the
   * active row has left it, so collapsing can never unmount the element the
   * page's scroll-to-active-set effect is holding.
   */
  complete: boolean
  /** Shown in place of the content when collapsed, e.g. "3 sets". */
  summary?: string
  class?: string
  children: JSX.Element
}

// A finished section on the workout page is a long stretch of rows the user has
// no further business with — on a lift with two cross blocks and a full
// assistance slate that adds up to a lot of scrolling past done work to reach
// the set they're actually on.
//
// So a section folds itself away once it's finished, and only then. While a
// section still holds the cursor it renders exactly as it did before: a plain
// label and its rows, with no toggle to fumble mid-set. Undoing back into a
// finished section un-completes it, which re-opens it automatically.
export default function CollapsibleSection(props: Props) {
  const id = `section-${++seq}`
  const [userExpanded, setUserExpanded] = createSignal(false)

  // Re-fold on each fresh completion: a user who opened a finished section to
  // check something, then logged another set into it, shouldn't find it still
  // open the second time it finishes.
  createEffect(on(() => props.complete, done => { if (done) setUserExpanded(false) }, { defer: true }))

  const expanded = () => !props.complete || userExpanded()

  return (
    <div class={props.class}>
      <Show
        when={props.complete}
        fallback={<SectionLabel class="mb-2">{props.label}</SectionLabel>}
      >
        <button
          onClick={() => setUserExpanded(v => !v)}
          aria-expanded={expanded()}
          aria-controls={id}
          class="w-full flex items-baseline gap-2 mb-2 text-left"
        >
          <SectionLabel>{props.label}</SectionLabel>
          <Show when={!expanded() && props.summary}>
            <span class="text-faint text-xs tracking-widest">{props.summary} done</span>
          </Show>
          {/* Triangles, not −/+: the steppers on this page are already covered
              in −/+ glyphs, and a second meaning for the same character is
              confusing on screen and ambiguous to anything querying by text. */}
          <span class="text-faint text-xs ml-auto" aria-hidden="true">{expanded() ? '▾' : '▸'}</span>
        </button>
      </Show>
      <div id={id} hidden={!expanded()}>
        {props.children}
      </div>
    </div>
  )
}
