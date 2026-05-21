# Architecture Map

---

## Directory Structure

```
src/
├── App.tsx                       # @solidjs/router routes + AppShell + ConfirmationContext
├── main.tsx                      # mount root after dbReady → seed → loadSettings → applyTheme
├── index.css                     # Tailwind 4 entry + CSS variable theme tokens
├── test-setup.ts                 # Vitest jsdom setup
│
├── screens/                      # page-level components (one per route)
│   ├── Today.tsx                 # lift picker + week status + session preview + launch
│   ├── Workout.tsx               # active session: warmups, mains, jokers, supplementals, accessories, notes
│   ├── History.tsx               # cycle/session browser, est-1RM, AMRAP history
│   ├── HistoryEdit.tsx           # edit a past session: sets, notes, status
│   ├── Setup.tsx                 # first-run TM entry
│   └── Settings.tsx              # rest timers, theme, plate config, supplemental template, export/import, cleanup
│
├── components/
│   ├── layout/                   # BottomNav, Toast, Rule
│   ├── modals/                   # ConfirmationDialog (wired to use-confirmation), CycleCompleteModal
│   ├── forms/                    # Stepper, DurationInput, PlateDisplay
│   ├── ui/                       # InlineConfirm
│   └── workout/                  # RestTimer, SetRow, AccessoryLog, AccessoryPicker,
│                                 #   AmrapTargets, SessionPreview
│
├── store/                        # Solid stores — global reactive state, NOT Zustand
│   ├── workout-store.ts          # active session, logged sets, rest timer, accessories, notes;
│   │                             #   persisted to localStorage via createEffect, version-gated
│   ├── settings-store.ts         # rest timers, theme, barWeight, plates, supplementalTemplate;
│   │                             #   loaded from db.settings on boot; THEMES table + applyTheme()
│   └── toast-store.ts            # createSignal singleton + showToast(msg, ms)
│
├── db/
│   ├── index.ts                  # PRIMARY runtime DB — wraps SQLiteTable per table, exports `db`
│   ├── sqlite-client.ts          # Worker RPC client + Dexie-shaped query builder
│   │                             #   (WhereClause / WhereQuery / OrderByQuery / FilterQuery)
│   │                             #   + toSqlRow/fromSqlRow date/bool/json serialization
│   ├── sqlite.worker.ts          # @sqlite.org/sqlite-wasm worker — OPFS SAH pool, falls back
│   │                             #   to in-memory; embeds CREATE TABLE schema + indexes
│   ├── db.ts                     # Dexie schema — TEST-ONLY (vite.config aliases db/index → db.ts
│   │                             #   under Vitest). Keep table set/version in sync with sqlite.worker.
│   └── seed.ts                   # idempotent: lifts, exercises, lift-accessories, default settings
│                                 #   (single in-flight promise via _seed cache)
│
├── lib/                          # pure business logic — takes a TrainingDB or plain inputs
│   ├── calc.ts                   # 5/3/1 math: main %s, warmups, jokers, FSL/SSL/BBB/BBS,
│   │                             #   AMRAP targets, plate math, formatDuration
│   ├── cycle.ts                  # getNextSession, advanceCycleIfComplete,
│   │                             #   applyTmProgression, applyAccessoryTmProgression, deloadTms,
│   │                             #   getAmrapTargets
│   ├── training-max.ts           # getCurrentTm, setTm, getAllCurrentTms
│   ├── exercise.ts               # create/rename/archive/unarchive + add/remove to a lift
│   ├── cleanup.ts                # pure buildCleanupPlan: orphan la/atm/sets + exercises-to-archive
│   ├── export-import.ts          # JSON export+import (destructive replace), CSV export,
│   │                             #   pending-export retry via localStorage
│   └── types.ts                  # TableLike<T> + TrainingDB interface — the shared contract
│                                 #   that both db/index.ts (SQLite) and db/db.ts (Dexie) satisfy
│
├── hooks/
│   └── use-confirmation.ts       # createConfirmation() API + ConfirmationContext + useConfirmation hook
│
├── types/
│   └── domain.ts                 # canonical entity types: Lift, TrainingMax, Cycle, Session, Set,
│                                 #   Exercise, LiftAccessory, AccessoryTrainingMax, AccessorySet,
│                                 #   PlateConfig, Settings, SupplementalTemplate
│
└── workers/
    └── timer.worker.ts           # rest-timer tick worker (start/stop/pause/resume) — separate
                                  #   from sqlite.worker.ts
```

```
public/
├── icon-192.png / icon-512.png   # PWA icons
└── ...                           # static assets

tests/e2e/                        # Playwright specs
scripts/                          # debug-browser.js, migrate-history.py
```

## SQLite Tables (src/db/sqlite.worker.ts)

| Table | Purpose | Notes |
|-------|---------|-------|
| `lifts` | OHP/Bench/Squat/Deadlift | `order`, `progressionIncrement`, `baseWeight`, `liftType` |
| `trainingMaxes` | TM history per lift | append-only; latest by `setAt` |
| `cycles` | 5/3/1 cycle records | `number`, `startDate`, `endDate` |
| `sessions` | one row per lift × week | `status: pending|completed|skipped` |
| `sets` | main/warmup/joker/supplemental sets | `isAmrap` boolean (stored as INTEGER) |
| `exercises` | accessory exercise definitions | `type: reps|timed|distance`, `archived` |
| `liftAccessories` | which accessories belong to each lift | with `order` |
| `accessoryTrainingMaxes` | TM history for accessory exercises | with per-row `incrementLb` |
| `accessorySets` | logged accessory sets | nullable weight/reps/duration/distance |
| `settings` | single-row user settings | `plates` stored as JSON TEXT |

Indexes: `trainingMaxes.liftId`, `sessions.cycleId`, `sessions.liftId`, `sets.sessionId`,
`accessorySets.sessionId`, `accessoryTrainingMaxes.exerciseId`.

Schema lives inline in `sqlite.worker.ts` as `SCHEMA` (CREATE TABLE IF NOT EXISTS …). Additive
migrations done via `ALTER TABLE … ADD COLUMN` after the create block (e.g. `supplementalTemplate`).

## Key Patterns

- **Framework**: Solid.js 1 + `@solidjs/router` 0.16, Tailwind 4, Vite 8. No React. No Zustand.
- **State**: Solid `createStore` for app state (`workout-store`, `settings-store`), `createSignal`
  for toast and confirmation. Workout state is persisted to `localStorage` via a `createEffect`
  inside `persistWorkoutToStorage()` (called from `main.tsx` after render).
- **Persistence**: SQLite WASM in a dedicated worker (`db/sqlite-client.ts` ↔ `db/sqlite.worker.ts`).
  Storage backend is OPFS SAH pool when available, in-memory fallback otherwise (`ready` resolves
  to `{ persistent: boolean }`).
- **Test backend**: Vitest aliases `db/index` → `db/db.ts` (Dexie + fake-indexeddb). Business logic
  in `lib/` depends only on the `TrainingDB` interface in `lib/types.ts`, so the same code runs
  against either backend. **Both backends must keep the same table set and column shape.**
- **Routing**: `@solidjs/router` — routes wired in `App.tsx`; screens are `lazy()` imports inside a
  `<Suspense>` boundary. AppShell redirects to `/setup` when `trainingMaxes` is empty.
- **Theming**: `THEMES` map in `settings-store.ts` writes CSS variables on `<html>`; Tailwind reads
  `var(--color-*)` tokens.
- **Confirmation dialogs**: `ConfirmationContext` provided at the root in `App.tsx`; call
  `const { confirm } = useConfirmation()` and `await confirm('...')` — `ConfirmationDialog` is
  mounted once at the app root.
- **PWA**: `vite-plugin-pwa` with `registerType: 'prompt'`; `.wasm` cached with `CacheFirst`.
  CSP set on preview server (also configured server-side for prod).
- **Tests**: co-located `*.test.ts(x)` next to source. Vitest + jsdom + `@solidjs/testing-library`
  + `@testing-library/jest-dom`. Coverage gated at 80% on `lib/`, `screens/`, `store/`. Stryker
  mutation testing available via `npm run test:mutation`. Many components in `components/` have
  no co-located test — coverage is concentrated on screens and lib.
- **E2E**: Playwright specs under `tests/e2e/`.

## Boot Order (main.tsx)

1. `dbReady` — SQLite worker init (OPFS pool, schema apply, additive ALTERs)
2. `seedDatabase()` — idempotent seed of lifts / exercises / lift-accessories / default settings
3. `loadSettings()` — read single settings row into the Solid store
4. `applyTheme(settings.theme)` — write CSS variables
5. `render(() => { persistWorkoutToStorage(); return <App /> }, root)` — first reactive read inside
   the renderer sets up the localStorage effect

If TM count is zero on first mount, AppShell navigates to `/setup`.

---

**Last Updated**: 2026-05-21
