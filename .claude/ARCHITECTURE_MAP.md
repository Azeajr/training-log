# Architecture Map

---

## Directory Structure

```
src/
├── App.tsx                       # @solidjs/router routes + AppShell + ConfirmationContext
├── main.tsx                      # mount root after dbReady → seed → loadSettings → applyTheme
├── index.css                     # Tailwind 4 entry: @theme tokens + global prefers-reduced-motion
├── test-setup.ts                 # Vitest jsdom setup (rest-timer MockWorker, localStorage, scrollIntoView)
│
├── screens/                      # page-level components (one per route)
│   ├── Today.tsx                 # lift picker, week status, session preview, assistance slots, launch
│   ├── Workout.tsx               # active session: warmups, mains, jokers, supplementals,
│   │                             #   cross-lift blocks, accessories, notes
│   ├── History.tsx               # session browser; 3 modes: by-lift (TM + e1RM chart), by-date, calendar
│   ├── HistoryEdit.tsx           # edit a past session: sets, accessories, notes, status
│   ├── Stats.tsx                 # read-only: best e1RM + actual max per lift, TM progression
│   ├── Setup.tsx                 # 3-step first-run wizard: lift roster → TMs → confirm
│   └── Settings.tsx              # rest timers, theme, plates/equipment, supplemental + cross blocks,
│                                 #   cycle shape (deload on/off + deload supplemental), exercise
│                                 #   library, export/import, cleanup, week skip
│
├── components/
│   ├── layout/                   # BottomNav, Toast, Rule (`--- LABEL ---`), SectionLabel
│   ├── modals/                   # ConfirmationDialog (wired to use-confirmation), CycleCompleteModal
│   │                             #   (old → new TMs + STRONG CYCLE doubling), TmRecommendationModal,
│   │                             #   LiftSetupModal (TM, increment, equipment, cross blocks)
│   ├── forms/                    # Stepper, DurationInput, PlateDisplay, SetReadout,
│   │                             #   SetLogControls/FieldRow, NotesField, NotesText, ExerciseEditor
│   ├── ui/                       # InlineConfirm, ToggleChip
│   └── workout/                  # RestTimer, SetRow, CrossBlockLog, AccessoryLog, AccessoryPicker,
│                                 #   AmrapTargets
│
├── store/                        # Solid stores — global reactive state, NOT Zustand
│   ├── workout-store.ts          # active session, loggedSets (linear), loggedCrossSets (out-of-order),
│   │                             #   rest timer, accessories, notes; persisted to localStorage via
│   │                             #   createEffect, gated by STORAGE_VERSION, rehydrated through
│   │                             #   PERSISTED_KEYS + PERSISTED_VALIDATORS
│   ├── settings-store.ts         # rest timers, theme, barWeight, plates, supplementalTemplate,
│   │                             #   deloadSupplemental, hasDeloadWeek; loaded from db.settings on
│   │                             #   boot; THEMES map (11 themes) + applyTheme()
│   └── toast-store.ts            # createSignal singleton + showToast(msg, ms)
│
├── db/
│   ├── index.ts                  # PRIMARY runtime DB — one SQLiteTable per table (with its
│   │                             #   date/bool/json field lists); exports `db` (TrainingDB) + dbReady
│   ├── schema.ts                 # `SCHEMA`, `ADDITIVE_MIGRATIONS`, `ALL_TABLES` — single source of
│   │                             #   truth for both the prod worker and the test client
│   ├── sqlite-client.ts          # PROD client: Web Worker RPC, OPFS SAH pool, 10s per-request
│   │                             #   timeout (init exempt), reentrant transactions, terminate on
│   │                             #   non-bfcache pagehide, window.__e2eResetDb under DEV only
│   ├── sqlite-test-client.ts     # TEST client: in-process @sqlite.org/sqlite-wasm (no Worker,
│   │                             #   no OPFS). vite alias `/sqlite-client$/` → this file under vitest
│   ├── sqlite-table.ts           # query layer: SQLiteTable<T> + WhereClause → Query<T>; assertIdent;
│   │                             #   toSqlRow/fromSqlRow date/bool/json serialization
│   ├── sqlite.worker.ts          # Web Worker — imports SCHEMA from db/schema.ts
│   └── seed.ts                   # idempotent: lifts, exercise library (+ category normalisation),
│                                 #   default settings. Single in-flight promise, cleared on failure
│
├── lib/                          # business logic — plain inputs or a TrainingDB parameter
│   ├── calc.ts                   # 5/3/1 math: main %s, warmups, jokers, FSL/SSL/BBB/BBS/+BBB combos,
│   │                             #   cross-lift sets, plate distribution (paired|total), Wathan e1RM
│   │                             #   + AMRAP targets, cycleFinalWeek, effectiveSupplementalWeek,
│   │                             #   restStatus/RestPhase thresholds, formatDuration
│   ├── cycle.ts                  # computeClosedThroughWeek/syncClosedThroughWeek (high-water mark),
│   │                             #   getNextSessionAdvancingIfDone, advanceCycleIfComplete,
│   │                             #   applyTmProgression, applyAccessoryTmProgression, deloadTms,
│   │                             #   getRecentAmraps (median-seed input for AMRAP targets)
│   ├── tm-recommendations.ts     # getSessionTmRecommendation (≥15% AMRAP delta → post-session prompt),
│   │                             #   getCycleDoublingCandidates (all 3 working weeks ≥10% + no
│   │                             #   mid-cycle bump → offer 2× increment at cycle end)
│   ├── training-max.ts           # getCurrentTm, setTm, getAllCurrentTms, getLatestAccessoryTms
│   ├── lift.ts                   # create/update/archive/unarchive/delete/move a lift;
│   │                             #   liftSupplementals (cross-block) CRUD; liftsCrossReferencing
│   ├── session.ts                # discardPendingSession, reconcileActiveSession (store↔DB drift)
│   ├── assistance.ts             # push/pull/legs_core slots, category→section mapping, recency
│   │                             #   ranking, per-lift assistanceDefaults get/set + category cascade
│   ├── exercise.ts               # create/rename/archive/unarchive, set category, set plate loading
│   ├── plate-loading.ts          # resolveLiftLoading / resolveExerciseLoading → { mode, base }
│   ├── cleanup.ts                # pure buildCleanupPlan: orphan atm/accessorySets + exercises to archive
│   ├── export-import.ts          # JSON export + destructive import (validate → clear → restore),
│   │                             #   CSV export, pending-export retry via localStorage
│   ├── pr.ts                     # detectAmrapPRs — rep-PR and e1RM-PR vs. all prior AMRAPs;
│   │                             #   first-ever AMRAP returns e1RmPr=true (baseline)
│   ├── format.ts                 # formatDateShort/Long/Iso (Iso is the LOCAL day, not toISOString)
│   ├── audio-cues.ts             # module-scoped AudioContext; playCue(level), unlockAudio, ensureAudioCtx
│   └── rest-timer-worker.ts      # module-scoped Worker factory (getTimerWorker), survives remounts
│
├── hooks/
│   └── use-confirmation.ts       # createConfirmation() + ConfirmationContext + useConfirmation
│
├── types/
│   └── domain.ts                 # canonical entity types + SupplementalTemplate, DeloadSupplemental,
│                                 #   PlateMode, ExerciseCategory, AssistanceSection
│
└── workers/
    └── timer.worker.ts           # rest-timer tick worker — separate from sqlite.worker.ts
```

```
public/
├── icon-192.png / icon-512.png   # PWA icons
├── favicon.svg, icons.svg
├── _headers                      # Cloudflare: CSP + X-Frame-Options + Permissions-Policy + COOP
└── demo-seed.json                # static demo dataset; user imports via Settings → IMPORT JSON

tests/e2e/                        # Playwright specs + auto-fixtures (_noPageErrors, _freshDb)
scripts/                          # debug-browser.js, migrate-history.py
```

## Routes (`src/App.tsx`)

`/` and `/today` → Today · `/workout` → Workout · `/history` → History · `/stats` → Stats ·
`/history/:sessionId/edit` → HistoryEdit · `/settings` → Settings · `/setup` → Setup.
All screens are `lazy()` inside a `<Suspense>`; `AppShell` redirects to `/setup` on every navigation
while `trainingMaxes` is empty.

## SQLite Tables (`src/db/schema.ts`)

| Table | Purpose | Notes |
|-------|---------|-------|
| `lifts` | main lifts | `order`, `progressionIncrement`, `baseWeight`, `liftType`, `archived`, `plateMode`, `implementBase`, legacy `usesBarbell` |
| `trainingMaxes` | TM history per lift | append-only; latest by `setAt` |
| `cycles` | 5/3/1 cycle records | `number`, `startDate`, `endDate`, `closedThroughWeek` (high-water mark) |
| `sessions` | one row per lift × week | `status: pending\|completed\|skipped`; a redo adds a second row |
| `sets` | warmup/main/joker/supplemental/cross | `isAmrap` boolean; `liftId` set only on `cross` rows |
| `exercises` | accessory exercise library | `type: reps\|timed\|distance`, `category`, `archived`, plate-loading fields |
| `liftSupplementals` | cross-lift blocks per training day | `movementLiftId`, `weightMode: fsl\|percent`, `percent`, `sets`, `reps`, `order` |
| `accessoryTrainingMaxes` | TM history for accessories | per-row `incrementLb` |
| `accessorySets` | logged accessory sets | nullable weight/reps/duration/distance |
| `accessoryNotes` | one note per (session, exercise) | unique index enforced via `ADDITIVE_MIGRATIONS` |
| `assistanceDefaults` | a lift's pick per assistance section | unique on `(liftId, section)` |
| `settings` | single-row user settings | `plates` JSON; `hasDeloadWeek` bool; `supplementalTemplate`, `deloadSupplemental` |

Indexes cover the foreign keys above. `liftAccessories` was dropped — the per-lift accessory roster
concept is gone; a session's assistance comes from `assistanceDefaults` plus in-session picks.

`SCHEMA` and `ADDITIVE_MIGRATIONS` both live in `src/db/schema.ts`, imported by the production worker
and the in-process test client, so there is exactly one place to edit. `ADDITIVE_MIGRATIONS` is
append-only and each statement runs inside a swallowed try/catch; it is no longer strictly additive
(it carries a `DROP TABLE` and a `CREATE UNIQUE INDEX`). An index that can fail against existing rows
belongs there and never in `SCHEMA`, whose exec is unguarded.

## Key Patterns

- **Framework**: Solid.js 1.9 + `@solidjs/router` 0.16, Tailwind 4, Vite 8. No React. No Zustand.
- **State**: Solid `createStore` for app state (`workout-store`, `settings-store`), `createSignal` for
  toast and confirmation. Workout state persists to `localStorage` via a `createEffect` inside
  `setupWorkoutPersistence()`, called from `main.tsx` inside the render root.
- **Persistence (prod)**: SQLite Wasm in a dedicated worker (`db/sqlite-client.ts` ↔ `db/sqlite.worker.ts`).
  OPFS SAH pool when available, in-memory fallback otherwise (`dbReady` resolves `{ persistent }`).
  Each RPC has a 10s timeout (init exempt); `terminate()` rejects in-flight promises.
- **Persistence (test)**: vitest aliases `/sqlite-client$/` → `db/sqlite-test-client.ts` — same
  `@sqlite.org/sqlite-wasm` package, in-process, no Worker/OPFS. `SQLiteTable` and the query layer are
  shared verbatim; only the RPC target changes. lib/db tests reset via `__resetForTest()`; screen tests
  clear the tables they seed.
- **Cycle shape**: `cycleFinalWeek(settings.hasDeloadWeek)` decides whether a cycle runs 1–3 or 1–4.
  `cycles.closedThroughWeek` is a self-healing cache of the highest contiguous completed week, so
  changing the lift roster mid-cycle never reopens a finished week.
- **Cross-lift supplemental**: `liftSupplementals` rows drive `calcCrossSets`; those sets live in
  `workout.loggedCrossSets`, outside the linear `currentSetIndex` model, and persist to `sets` with
  `type: 'cross'` plus their own `liftId`.
- **Equipment / plate math**: `resolveLiftLoading` / `resolveExerciseLoading` turn `plateMode` +
  `implementBase` (falling back to the legacy `usesBarbell` flag) into `{ mode, base }`, which
  `calcPlates` distributes as pairs (`paired`) or singles (`total`).
- **Theming**: 14 `--color-*` tokens declared in `src/index.css` `@theme` and overridden at runtime by
  the `THEMES` map in `settings-store.ts` (11 themes) via `applyTheme()`. Tailwind utilities read the vars.
- **Confirmation dialogs**: `ConfirmationContext` provided at the root in `App.tsx`; call
  `const { confirm } = useConfirmation()` and `await confirm('…')`.
- **PWA**: `vite-plugin-pwa`, `registerType: 'prompt'`, `cleanupOutdatedCaches`, `.wasm` on `CacheFirst`.
  CSP set identically in `index.html`, `public/_headers`, and the vite preview server.
- **Tests**: co-located `*.test.ts(x)`; Vitest + jsdom + `@solidjs/testing-library` + `@testing-library/jest-dom`.
  Coverage gated at 80% over `lib/`, `screens/`, `store/` — `components/`, `db/`, and `hooks/` sit
  outside the gate, and a component earns a test when it owns real logic. Stryker mutates `src/lib`
  (`pnpm test:mutation`; the run fails below a 40% score).
- **E2E**: Playwright specs under `tests/e2e/`, resetting OPFS through the DEV-only `window.__e2eResetDb`.

## Boot Order (`src/main.tsx`)

1. `dbReady` — SQLite worker init (OPFS pool, `SCHEMA`, then `ADDITIVE_MIGRATIONS`)
2. `seedDatabase()` — idempotent seed of lifts / exercise library / default settings
3. `loadSettings()` — read the single settings row into the Solid store
4. `applyTheme(settings.theme)` — write CSS variables onto `<html>`
5. `render(() => { setupWorkoutPersistence(); return <App /> }, root)` — the localStorage effect is
   registered inside the reactive root

`AppShell` navigates to `/setup` whenever the TM count is zero, re-checked on every navigation.

---

**Last Updated**: 2026-07-29
