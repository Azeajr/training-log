import { A } from '@solidjs/router'
import { For } from 'solid-js'

const tabs = [
  { href: '/today',    label: 'TODAY'    },
  { href: '/workout',  label: 'WORKOUT'  },
  { href: '/history',  label: 'HISTORY'  },
  { href: '/settings', label: 'SETTINGS' },
]

export default function BottomNav() {
  return (
    <nav
      class="fixed bottom-0 left-0 right-0 bg-bg border-t border-border flex"
      style={{ 'padding-bottom': 'env(safe-area-inset-bottom, 0px)' }}
    >
      <For each={tabs}>
        {tab => (
          <A
            href={tab.href}
            class="flex-1 py-4 text-center text-xs tracking-widest transition-colors"
            activeClass="text-accent border-t border-accent -mt-px"
            inactiveClass="text-muted hover:text-text"
          >
            {tab.label}
          </A>
        )}
      </For>
    </nav>
  )
}
