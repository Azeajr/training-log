import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/today',    label: 'TODAY'    },
  { to: '/workout',  label: 'WORKOUT'  },
  { to: '/history',  label: 'HISTORY'  },
  { to: '/settings', label: 'SETTINGS' },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950 border-t border-zinc-700 flex">
      {tabs.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 py-3 text-center text-xs tracking-widest transition-colors ${
              isActive
                ? 'text-green-400 border-t border-green-400 -mt-px'
                : 'text-zinc-500 hover:text-zinc-100'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
