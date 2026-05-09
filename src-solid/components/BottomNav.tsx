import { A } from '@solidjs/router'
import { Show } from 'solid-js'
import { workout } from '../store/workoutStore'

export default function BottomNav() {
  return (
    <nav
      class="fixed bottom-0 left-0 right-0 bg-bg border-t border-border flex"
      style={{ 'padding-bottom': 'env(safe-area-inset-bottom, 0px)' }}
    >
      <A
        href="/today"
        class="flex-1 py-4 text-center text-xs tracking-widest transition-colors"
        activeClass="text-accent border-t border-accent -mt-px"
        inactiveClass="text-muted hover:text-text"
      >
        TODAY
      </A>
      <A
        href="/workout"
        class="flex-1 py-4 text-center text-xs tracking-widest transition-colors inline-flex items-center justify-center gap-1"
        activeClass="text-accent border-t border-accent -mt-px"
        inactiveClass="text-muted hover:text-text"
      >
        WORKOUT
        <Show when={workout.activeSession !== null}>
          <span class="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
        </Show>
      </A>
      <A
        href="/history"
        end={false}
        class="flex-1 py-4 text-center text-xs tracking-widest transition-colors"
        activeClass="text-accent border-t border-accent -mt-px"
        inactiveClass="text-muted hover:text-text"
      >
        HISTORY
      </A>
      <A
        href="/settings"
        class="flex-1 py-4 text-center text-xs tracking-widest transition-colors"
        activeClass="text-accent border-t border-accent -mt-px"
        inactiveClass="text-muted hover:text-text"
      >
        SETTINGS
      </A>
    </nav>
  )
}
