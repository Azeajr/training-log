import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/today',    label: 'TODAY'    },
  { to: '/workout',  label: 'WORKOUT'  },
  { to: '/history',  label: 'HISTORY'  },
  { to: '/settings', label: 'SETTINGS' },
]

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-bg border-t border-border flex"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {tabs.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 py-4 text-center text-xs tracking-widest transition-colors ${
              isActive
                ? 'text-accent border-t border-accent -mt-px'
                : 'text-muted hover:text-text'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
