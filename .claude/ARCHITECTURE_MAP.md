# Architecture Map

---

## Directory Structure

```
src/
├── App.tsx                  # router + layout shell
├── main.tsx                 # React root mount
├── components/              # reusable UI (21 components, each has .test.tsx)
├── screens/                 # page-level components (Today, Workout, History, HistoryEdit, Setup, Settings)
├── store/
│   ├── workoutStore.ts      # Zustand — active session, sets, cycles
│   └── settingsStore.ts     # Zustand — user preferences, training maxes
├── db/
│   ├── db.ts                # Dexie schema + migrations (10 tables)
│   └── seed.ts              # dev/demo seed data
├── lib/
│   ├── calc.ts              # 5/3/1 math (weights, reps, progression)
│   ├── session.ts           # session state helpers
│   └── exportImport.ts      # JSON/CSV export-import
├── hooks/
│   └── useSwipeNav.ts       # swipe gesture navigation
└── assets/                  # static assets

public/
├── demo-seed.json           # demo mode seed (2.5 cycles of data)
├── icons.svg                # icon sprite
└── _headers                 # Cloudflare/GH Pages headers

tests/e2e/                   # Playwright specs
scripts/                     # debug-browser.js, migrate-history.py
```

## Dexie Tables (src/db/db.ts)

| Table | Purpose |
|-------|---------|
| `lifts` | squat/bench/deadlift/ohp definitions |
| `trainingMaxes` | per-lift training max values |
| `cycles` | 5/3/1 cycle records |
| `sessions` | individual training sessions |
| `sets` | logged sets per session |
| `exercises` | exercise definitions |
| `liftAccessories` | accessory work linked to lifts |
| `accessoryTrainingMaxes` | training maxes for accessories |
| `accessorySets` | logged accessory sets |
| `settings` | user settings key-value store |

## Key Patterns

- **State**: Zustand stores (`workoutStore`, `settingsStore`) — no Redux, no Context for app state
- **Persistence**: Dexie (IndexedDB) — all data local, no backend
- **Routing**: React Router 7 — screens map 1:1 to routes
- **Tests**: co-located `.test.tsx` files, jsdom environment, RTL + Vitest
- **Offline**: PWA via vite-plugin-pwa — service worker + manifest

---

**Last Updated**: 2026-05-12
