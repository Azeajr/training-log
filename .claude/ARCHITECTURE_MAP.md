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
│   ├── History.tsx               # cycle/session browser, est-1RM, AMRAP history; 3 modes: by-lift, by-date, calendar heatmap
│   ├── HistoryEdit.tsx           # edit a past session: sets, notes, status
│   ├── Setup.tsx                 # first-run TM entry
│   └── Settings.tsx              # rest timers, theme, plate config, supplemental template, export/import, cleanup,
│                                 #   cycle controls (skip-to-week, SKIP DELOAD — only visible in week 4)
│
├── components/
│   ├── layout/                   # BottomNav, Toast, Rule
│   ├── modals/                   # ConfirmationDialog (wired to use-confirmation), CycleCompleteModal
│   │                             #   (shows old → new TM weights + STRONG CYCLE doubling section),
│   │                             #   TmRecommendationModal (post-session ≥15% AMRAP TM bump prompt)
│   ├── forms/                    # Stepper, DurationInput, PlateDisplay, ExerciseEditor
│   ├── ui/                       # InlineConfirm
│   └── workout/                  # RestTimer, SetRow, AccessoryLog, AccessoryPicker, AmrapTargets
│
├── store/                        # Solid stores — global reactive state, NOT Zustand
│   ├── workout-store.ts          # active session, logged sets, rest timer, accessories, notes;
│   │                             #   persisted to localStorage via createEffect, version-gated
│   ├── settings-store.ts         # rest timers, theme, barWeight, plates, supplementalTemplate;
│   │                             #   loaded from db.settings on boot; THEMES map + applyTheme()
│   └── toast-store.ts            # createSignal singleton + showToast(msg, ms)
│
├── db/
│   ├── index.ts                  # PRIMARY runtime DB — wraps SQLiteTable per table, exports `db`
│   │                             #   (the `TrainingDB` instance) and `dbReady`
│   ├── schema.ts                 # `SCHEMA` (CREATE TABLE), `ADDITIVE_MIGRATIONS`, `ALL_TABLES`
│   │                             #   — single source of truth for both prod and test clients
│   ├── sqlite-client.ts          # PROD client: Web Worker RPC, OPFS SAH pool, 10s per-request
│   │                             #   timeout, reentrant transactions
│   ├── sqlite-test-client.ts     # TEST client: in-process @sqlite.org/sqlite-wasm (no Worker,
│   │                             #   no OPFS). vite alias `/sqlite-client$/` → this file under vitest.
│   ├── sqlite-table.ts           # query layer: SQLiteTable<T> + chainable WhereClause → Query<T>
│   │                             #   builder. Handles toSqlRow/fromSqlRow date/bool/json
│   │                             #   serialization.
│   ├── sqlite.worker.ts          # Web Worker — imports SCHEMA from db/schema.ts
│   └── seed.ts                   # idempotent: lifts, exercises, lift-accessories, default settings
│                                 #   (single in-flight promise via _seed cache, cleared on failure)
│
├── lib/                          # pure business logic — takes a TrainingDB or plain inputs
│   ├── calc.ts                   # 5/3/1 math: main %s, warmups, jokers, FSL/SSL/BBB/BBS,
│   │                             #   AMRAP targets, plate math, formatDuration;
│   │                             #   restStatus/RestPhase/RestStatus + rest thresholds
│   ├── cycle.ts                  # getNextSessionAdvancingIfDone, advanceCycleIfComplete,
│   │                             #   applyTmProgression, applyAccessoryTmProgression, deloadTms,
│   │                             #   getAmrapTargets; advanceCycleIfComplete returns doublingCandidates
│   │                             #   (computed pre-progression via tm-recommendations)
│   ├── tm-recommendations.ts     # getSessionTmRecommendation (≥15% AMRAP delta → post-session prompt),
│   │                             #   getCycleDoublingCandidates (all 3 weeks ≥10% + no mid-cycle bump
│   │                             #   → offer 2× increment at cycle end)
│   ├── training-max.ts           # getCurrentTm, setTm, getAllCurrentTms
│   ├── exercise.ts               # create/rename/archive/unarchive + add/remove to a lift
│   ├── cleanup.ts                # pure buildCleanupPlan: orphan la/atm/sets + exercises-to-archive
│   ├── export-import.ts          # JSON export+import (destructive replace), CSV export,
│   │                             #   pending-export retry via localStorage
│   ├── format.ts                 # formatDateShort/Long/Iso
│   ├── audio-cues.ts             # module-scoped AudioContext; playCue(level), unlockAudio, ensureAudioCtx;
│   │                             #   tone + vibration for rest-timer nudge/warning/critical phases
│   ├── pr.ts                     # detectAmrapPRs — rep-PR and e1RM-PR detection vs. all prior AMRAPs;
│   │                             #   first-ever AMRAP returns e1RmPr=true (sets baseline)
│   └── rest-timer-worker.ts      # module-scoped Worker factory (getTimerWorker); keeps Worker alive
│                                 #   across RestTimer remounts; wraps workers/timer.worker.ts
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
├── demo-seed.json                # static demo dataset; user imports via Settings → IMPORT JSON
└── ...                           # static assets

tests/e2e/                        # Playwright specs
scripts/                          # debug-browser.js, migrate-history.py
```

## SQLite Tables (src/db/schema.ts)

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

Schema and additive migrations both live in `src/db/schema.ts`. Both the production worker
(`sqlite.worker.ts`) and the in-process test client (`sqlite-test-client.ts`) import from there,
so there is exactly one place to edit when adding a column or table.

## Key Patterns

- **Framework**: Solid.js 1 + `@solidjs/router` 0.16, Tailwind 4, Vite 8. No React. No Zustand.
- **State**: Solid `createStore` for app state (`workout-store`, `settings-store`), `createSignal`
  for toast and confirmation. Workout state is persisted to `localStorage` via a `createEffect`
  inside `setupWorkoutPersistence()` (called from `main.tsx` after render).
- **Persistence (prod)**: SQLite WASM in a dedicated worker (`db/sqlite-client.ts` ↔ `db/sqlite.worker.ts`).
  Storage backend is OPFS SAH pool when available, in-memory fallback otherwise (`dbReady` resolves
  to `{ persistent: boolean }`). The client wraps each RPC in a 10s timeout (init exempted) and
  rejects in-flight promises on `terminate()`.
- **Persistence (test)**: Vitest aliases `/sqlite-client$/` → `db/sqlite-test-client.ts`. The test
  client uses the same `@sqlite.org/sqlite-wasm` package but runs in-process (no Worker, no OPFS).
  `SQLiteTable<T>` and the query layer in `sqlite-table.ts` are shared verbatim between prod and
  test — only the underlying RPC target changes. Tests reset state via `__resetForTest()` from the
  test client.
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
  mutation testing available via `pnpm test:mutation`. Many components in `components/` have
  no co-located test — coverage is concentrated on screens and lib.
- **E2E**: Playwright specs under `tests/e2e/`.

## Boot Order (main.tsx)

1. `dbReady` — SQLite worker init (OPFS pool, schema apply, additive ALTERs)
2. `seedDatabase()` — idempotent seed of lifts / exercises / lift-accessories / default settings
3. `loadSettings()` — read single settings row into the Solid store
4. `applyTheme(settings.theme)` — write CSS variables
5. `render(() => { setupWorkoutPersistence(); return <App /> }, root)` — first reactive read inside
   the renderer sets up the localStorage effect

If TM count is zero on first mount, AppShell navigates to `/setup`.

---

**Last Updated**: 2026-05-31
