import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { workout } from '../../store/workout-store'

export default function BottomNav() {
  return (
    <nav
      class="fixed bottom-0 left-0 right-0 bg-bg border-t border-border flex h-[var(--nav-h)]"
      style={{ 'padding-bottom': 'env(safe-area-inset-bottom, 0px)' }}
    >
      <A
        href="/today"
        class="flex-1 inline-flex items-center justify-center text-xs tracking-wider transition-colors"
        activeClass="text-accent border-t border-accent -mt-px"
        inactiveClass="text-muted hover:text-text"
      >
        TODAY
      </A>
      <A
        href="/workout"
        class="flex-1 inline-flex items-center justify-center gap-1 text-xs tracking-wider transition-colors"
        activeClass="text-accent border-t border-accent -mt-px"
        inactiveClass="text-muted hover:text-text"
      >
        WORKOUT
        <Show when={workout.activeSession !== null}>
          <span class="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
        </Show>
      </A>
      {/* No STATS tab: records and TM progression live inside HISTORY, which
          already charted the same numbers per lift. One destination for
          progress, one for the log. /stats stays routable as the direct link to
          the whole-roster records view. */}
      <A
        href="/history"
        end={false}
        class="flex-1 inline-flex items-center justify-center text-xs tracking-wider transition-colors"
        activeClass="text-accent border-t border-accent -mt-px"
        inactiveClass="text-muted hover:text-text"
      >
        HISTORY
      </A>
      <A
        href="/settings"
        class="flex-1 inline-flex items-center justify-center text-xs tracking-wider transition-colors"
        activeClass="text-accent border-t border-accent -mt-px"
        inactiveClass="text-muted hover:text-text"
      >
        SETTINGS
      </A>
    </nav>
  )
}
