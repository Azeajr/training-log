import { For, Show } from 'solid-js'
import { workout } from '../../store/workout-store'

export interface SessionSegment {
  /** Matches the `data-section` attribute on the block this scrolls to. */
  id: string
  label: string
  done: number
  /** 0 = optional and unfilled (an assistance slot nobody picked). */
  total: number
}

interface Props {
  segments: SessionSegment[]
  onComplete: () => void
  disabled?: boolean
}

export const isOutstanding = (s: SessionSegment) => s.total > 0 && s.done < s.total

// Scroll a block into view without stealing the page's smooth-scroll setting
// from a user who turned motion off.
export function scrollToSection(id: string) {
  const el = document.querySelector(`[data-section="${id}"]`)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' })
}

// The session's state, always on screen. Finishing used to be a button at the
// bottom of a long document, reached by scrolling back past every set already
// logged — and nothing anywhere said which blocks were still owed. This strip
// answers both: what's left, and (when nothing is) the one action that ends the
// session. The rest timer owns the same strip while a rest is running.
export default function SessionBar(props: Props) {
  const outstanding = () => props.segments.filter(isOutstanding)
  const allDone = () => props.segments.some(s => s.total > 0) && outstanding().length === 0

  return (
    <Show when={!workout.isResting}>
      <div class="fixed bottom-16 left-0 right-0 bg-bg border-t-2 border-border px-4 py-2">
        <div class="max-w-3xl mx-auto">
          <Show
            when={allDone()}
            fallback={
              <div class="flex items-center gap-3">
                <div class="flex gap-3 overflow-x-auto py-1 flex-1 -mx-1 px-1">
                  <For each={props.segments}>
                    {s => (
                      <button
                        onClick={() => scrollToSection(s.id)}
                        class={`shrink-0 font-mono text-xs tracking-widest whitespace-nowrap ${
                          s.total === 0
                            ? 'text-faint'
                            : s.done >= s.total
                              ? 'text-accent'
                              : 'text-text-dim hover:text-accent'
                        }`}
                      >
                        {s.label}{' '}
                        <span class="text-faint">
                          {s.total === 0 ? '—' : `${s.done}/${s.total}`}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
                <button
                  onClick={props.onComplete}
                  disabled={props.disabled}
                  class="shrink-0 border border-border text-muted px-3 py-2 font-mono text-xs tracking-widest hover:border-accent hover:text-accent disabled:opacity-40"
                >
                  FINISH
                </button>
              </div>
            }
          >
            <div class="flex items-center justify-between gap-4 py-1">
              <span class="text-accent font-mono text-xs tracking-widest">ALL WORK LOGGED</span>
              <button
                onClick={props.onComplete}
                disabled={props.disabled}
                class="border border-accent text-accent px-5 py-3 font-mono text-xs tracking-widest disabled:opacity-40"
              >
                COMPLETE SESSION
              </button>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  )
}
