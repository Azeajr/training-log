import { createEffect, createSignal, on, Show, type JSX } from 'solid-js'
import SectionLabel from '../layout/SectionLabel'

let seq = 0

interface Props {
  label: string
  /**
   * Non-clickable trailing info (sets × reps, weight mode). Rendered after the
   * label but NOT underlined — the underline marks the name only, matching the
   * accessory idiom (name underlined, meta muted).
   */
  labelMeta?: string
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
  onLabelClick?: () => void
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

  // The history tap target (onLabelClick) must survive the fold: previously it
  // existed only in the un-complete branch, so finishing a cross block silently
  // removed its history entry point. Label and fold toggle are separate buttons.
  const labelButton = (extraClass?: string) => (
    <Show
      when={props.onLabelClick}
      fallback={
        <SectionLabel class={extraClass}>
          {props.label}
          <Show when={props.labelMeta}><span class="text-muted">{'  '}{props.labelMeta}</span></Show>
        </SectionLabel>
      }
    >
      <button
        onClick={props.onLabelClick}
        class={`text-left cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${extraClass ?? ''}`}
      >
        <SectionLabel>
          <span class="underline underline-offset-2 decoration-faint hover:decoration-accent">{props.label}</span>
          <Show when={props.labelMeta}><span class="text-muted">{'  '}{props.labelMeta}</span></Show>
        </SectionLabel>
      </button>
    </Show>
  )

  return (
    <div class={props.class}>
      <Show
        when={props.complete}
        fallback={labelButton('mb-2')}
      >
        {/* With a history handler the row splits: label → history, triangle →
            fold. Without one the whole row stays the fold toggle, keeping the
            big tap target warmup/main always had. */}
        <Show
          when={props.onLabelClick}
          fallback={
            <button
              onClick={() => setUserExpanded(v => !v)}
              aria-expanded={expanded()}
              aria-controls={id}
              class="w-full flex items-baseline gap-2 mb-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <SectionLabel>
                {props.label}
                <Show when={props.labelMeta}><span class="text-muted">{'  '}{props.labelMeta}</span></Show>
              </SectionLabel>
              <FoldGlyph expanded={expanded()} summary={props.summary} summaryClass="text-faint text-xs tracking-widest" glyphClass="text-faint text-xs ml-auto" />
            </button>
          }
        >
          <div class="w-full flex items-baseline gap-2 mb-2">
            {labelButton()}
            <button
              onClick={() => setUserExpanded(v => !v)}
              aria-expanded={expanded()}
              aria-controls={id}
              aria-label={`${expanded() ? 'Collapse' : 'Expand'} ${props.label}`}
              class="flex items-baseline gap-2 ml-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <FoldGlyph expanded={expanded()} summary={props.summary} summaryClass="text-faint text-xs tracking-widest" glyphClass="text-faint text-xs" />
            </button>
          </div>
        </Show>
      </Show>
      <div id={id} hidden={!expanded()}>
        {props.children}
      </div>
    </div>
  )
}

// Summary chip + fold triangle, shared by both complete-branch layouts above.
// Triangles, not −/+: the steppers on this page are already covered in −/+
// glyphs, and a second meaning for the same character is confusing on screen
// and ambiguous to anything querying by text.
function FoldGlyph(props: { expanded: boolean; summary?: string; summaryClass: string; glyphClass: string }) {
  return (
    <>
      <Show when={!props.expanded && props.summary}>
        <span class={props.summaryClass}>{props.summary} done</span>
      </Show>
      <span class={props.glyphClass} aria-hidden="true">{props.expanded ? '▾' : '▸'}</span>
    </>
  )
}
