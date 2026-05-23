# Training Log — Roadmap

## Done

### SKIP DELOAD + Cycle-Complete TM Delta (2026-05-22)

- **SKIP DELOAD button** — appears in Settings → CYCLE only when the current week is week 4. Marks all remaining `pending` sessions in weeks 4 (and any gap weeks) as `skipped`, creating missing lift sessions as needed, then calls `advanceCycleIfComplete` to apply TM progression and open the next cycle. Gated behind a destructive confirm dialog. A fix restricted the button to week 4 only (an earlier draft showed it in all weeks).
- **Cycle-complete modal TM delta** — `advanceCycleIfComplete` now returns `Array<{ liftName, oldWeight, weight }>`. `CycleCompleteModal` renders the old → new weight for each lift (e.g. `BENCH  205 → 210 lbs`). Affects both the Workout and Settings trigger paths.

### Security Hardening Pass — Round 2 (2026-05-22)

Second pass on the same threat model after CSP / SQL identifier / import size / CI hardening
landed. Tightening the surrounding paths rather than expanding scope.

- **`importFromRawData` column allowlist for every table** — the existing `pickCols` pattern
  was only applied to `lifts`. Generalized so every table reads only known column names from
  the imported payload. Pairs with the lower-level `assertIdent` guard: bad keys never reach
  the `INSERT` column list, and legitimate-but-unknown-column legacy exports import cleanly
  instead of throwing at the SQL layer.
- **Workout store hydration allowlist** — `loadFromStorage` rejects non-object persisted
  state and copies only keys in the explicit `PERSISTED_KEYS` set into the reactive store.
  Defense in depth against a corrupted or tampered `localStorage` entry grafting extra fields
  onto the Solid store after a future XSS or migration bug.
- **`HistoryEdit` URL slug validation** — `:sessionId` coerced through
  `Number.isInteger(n) && n > 0`; bad slugs now redirect to `/history` instead of binding
  `NaN` into the SQL parameter (SQLite would silently match nothing, masking the broken
  link).
- **PWA cache tightening** — `cleanupOutdatedCaches: true` so an old (potentially tampered)
  precached bundle gets evicted on SW update; `clientsClaim: false` / `skipWaiting: false`
  keep the existing `registerType: 'prompt'` user-controlled refresh model; the `.wasm`
  CacheFirst route capped at `maxEntries: 4` to bound cache growth.

Tests: 2 new hydration-allowlist cases in `src/store/workout-store.test.ts`; the import
malicious-column test now asserts friendly-strip behavior (strict throw stays covered in
`src/db/sqlite-table.test.ts`). 441/441 pass.

### Security Hardening Pass (2026-05-22)

Targeted review against the static client-authoritative PWA threat model. XSS = full OPFS DB
read/write, so CSP and identifier hygiene are the load-bearing defenses; supply chain is the
realistic active threat.

- **Production CSP** — `<meta http-equiv="Content-Security-Policy">` in `index.html` (Cloudflare
  Pages was previously unprotected; only the vite preview server set CSP). Mirrored and
  tightened in `public/_headers` and `vite.config.ts` preview headers: added
  `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`, plus `Cross-Origin-Opener-Policy:
  same-origin`. `script-src 'self' 'wasm-unsafe-eval'` keeps SQLite Wasm working;
  `style-src 'self' 'unsafe-inline'` is the minimum Tailwind needs;
  `worker-src 'self' blob:` is required for the vite-plugin-pwa service worker.
- **Import file-size guard** — `importJson` now rejects files over `MAX_IMPORT_BYTES`
  (50 MB) before `file.text()` runs, and rejects non-object top-level JSON with a
  friendly error. Closes the OOM-by-large-backup path.
- **SQL identifier hygiene** — added `assertIdent` (`^[A-Za-z_][A-Za-z0-9_]*$`) to
  `src/db/sqlite-table.ts`. Applied to `SQLiteTable` constructor, `where()`,
  `orderBy()`, and the column-key lists in `add` / `put` / `update`. All call sites
  use literals today; this stops a future caller — or a `bulkAdd` path fed from
  imported JSON — from interpolating attacker-controlled identifiers into the SQL.
- **Deploy workflow** — `permissions: contents: read` on the job, `persist-credentials:
  false` on `actions/checkout`, `npm install --prefer-offline --no-audit --no-fund`
  followed by `npm audit signatures` so a tampered lockfile is caught before deploy.
  Still on `npm install` rather than `npm ci` because the documented rolldown
  optional-cpu lockfile bug blocks `npm ci`.

Tests: `src/db/sqlite-table.test.ts` (new, 6 identifier-guard cases) + 3 new import-guard cases
in `src/lib/export-import.test.ts`. 439/439 pass.

### PR Detection + Toast (2026-05-22)

After an AMRAP is logged, `detectAmrapPRs` (in `src/lib/pr.ts`) compares the just-saved set
against all prior AMRAP sets for that lift and reports two PR flavors independently:

- **Rep PR** — strictly more reps than any prior AMRAP at this *exact* weight
- **e1RM PR** — strictly higher Epley estimated 1RM than any prior AMRAP

First-ever AMRAP for a lift returns `e1RmPr: true` and fires the toast (sets the baseline record). `Workout.handleLog`
calls the detector with `excludeSetId = dbId` (the just-inserted row) so the new set doesn't
self-compare. A toast fires when either flag is set, e.g. `BENCH — REP PR 225×8 · e1RM 285lb`.

Pure-logic test coverage in `src/lib/pr.test.ts` (10 cases): no priors → no PR, ties don't
trigger, lift-id isolation, exclusion filter, both flag combinations.

### Calendar Heatmap (2026-05-22)

Third tab in History (alongside "By lift" / "By date") shows a month-grid heatmap of training
days. Each cell is a button labeled with `Date.toDateString()` (e.g. `Fri May 22 2026`) and
colored by session count: 0 (border-dim), 1 (accent/10), 2 (accent/25), 3+ (solid accent).
Selecting a current-month cell reveals that day's sessions inline using the existing
`HistorySessionRow` expand pattern. Prev/next month arrows reset the selection.

Cells include both the day number and a small count badge when sessions exist. Out-of-month
padding cells are disabled. RTL coverage in `src/screens/History.test.tsx` exercises the mode
switch, the count badge render, and the click-to-expand flow.

### Drop Dexie Test Backend; Single SQLite Backend (2026-05-21)

Tests now run against the same SQLite Wasm engine that ships in production
(`@sqlite.org/sqlite-wasm`) via an in-process client (no worker, no OPFS).
The Dexie shim and `TableLike<T>` interface are gone.

- `src/db/db.ts` (Dexie schema) deleted; `dexie` and `fake-indexeddb` removed from `devDependencies`.
- `src/lib/types.ts` is now just `type TrainingDB = typeof db` — single source of truth.
- `src/db/schema.ts` holds the shared `SCHEMA`, `ADDITIVE_MIGRATIONS`, and `ALL_TABLES`.
- `src/db/sqlite-table.ts` (was inside `sqlite-client.ts`) owns the `SQLiteTable` query layer.
- `src/db/sqlite-client.ts` is the prod (Web Worker + OPFS) client; `src/db/sqlite-test-client.ts` is the vitest in-process variant. Vite alias `/sqlite-client$/` -> `/sqlite-test-client` swaps the dependency under test.
- Both clients implement reentrant `transaction()` (depth counter) so `archiveExercise` can be called from inside `handleCleanupAccessoryData`'s outer transaction without "cannot start a transaction within a transaction".
- `toSqlRow` no longer injects `null` for missing date fields — broke updates that only touch a subset of columns under real NOT NULL constraints.

Net result: one production backend, one mirror test backend, no Dexie surface to maintain.

### Senior-Review Cleanup Pass (2026-05-21)

Targeted maintainability fixes flagged by deep code review.

- **N+1 in `getAllCurrentTms`** — replaced per-lift query loop with one `toArray()` + in-memory group-by (`src/lib/training-max.ts`).
- **Dead `.and()` alias on `WhereQuery`** — removed from `sqlite-client.ts` and from `TableLike<T>`. Three call sites in `HistoryEdit.tsx` switched to `.filter()`; `.filter()` return type widened to expose `.delete()` to match real usage.
- **`seedDatabase` cache traps rejection** — `_seed` is now cleared on failure so transient first-run errors (e.g. OPFS lock contention) can be retried instead of permanently re-throwing.
- **Worker promises could hang forever** — 10s per-request timeout added to `SqliteClient.send`; `init` exempted because OPFS SAH pool retries can legitimately take ~1.5s.
- **`addExerciseToLift` trusted caller-passed `currentCount`** — parameter dropped; the function now computes `max(order)+1` from existing rows scoped to the lift.
- **`SessionPreview` single-use wrapper** — inlined into `Today.tsx` and the file deleted.

### Second Senior-Review Pass — Post-Dexie Cleanup (2026-05-21)

Follow-up review after the Dexie removal landed. Two real bugs, one robustness fix, and the
documentation that was lying about deleted code.

- **`Workout.handleLog` cascade not reverted on DB failure** — when the user adjusted the
  weight on a main set or supplemental and `db.sets.add()` then threw, `deleteLastSet()` would
  roll back the logged set but the cascaded weight changes on `allSets` stayed. Subsequent
  supplemental sets would render and save with the wrong weight. Now snapshots `allSets`
  before the cascade and restores it inside the catch.
- **`SqliteClient.terminate()` leaked pending promises** — `pagehide` fires `worker.terminate()`,
  but any in-flight RPC promises in `this.pending` never settled. Added explicit rejection of
  every entry with `Error('SQLite worker terminated')` before clearing the map.
- **Mutating `.sort()` on db arrays** — `AccessoryPicker.load` and `Settings.load` both wrote
  `arr.sort(...)` on the fresh array returned by `db.*.toArray()`. Harmless today because the
  arrays aren't read afterwards, but reads as if the mutation matters. Both call sites now use
  `[...arr].sort(...)`.
- **`.claude/ARCHITECTURE_MAP.md`** described a directory tree that no longer exists: `db/db.ts`,
  `TableLike<T>`, the `db/index → db/db.ts` test alias, a `persistWorkoutToStorage` function name
  that was renamed, and schema "inline in worker". Rewritten to match the post-Dexie reality
  (single `db/schema.ts`, `/sqlite-client$/ → sqlite-test-client` alias,
  `setupWorkoutPersistence`, etc.).
- **`.claude/COMMON_MISTAKES.md`** mistake #1 was about Dexie-vs-SQLite dual-backend drift (gone).
  Mistake #5 said `VITE_DEMO` was a dead declaration that should be removed — already removed.
  Both rewritten around current state.

### Third Pass — RestTimer Singletons + Workout DRY (2026-05-21)

Last open tech-debt item from the roadmap, plus a small DRY win.

- **RestTimer module-singletons extracted** — `audioCtx` / `playTone` / `playCue` moved to
  `src/lib/audio-cues.ts`; the rest-timer-worker getter moved to
  `src/lib/rest-timer-worker.ts`. `RestTimer.tsx` now only contains reactive UI wiring;
  iOS audio-unlock semantics preserved (still module-scoped, just in lib modules instead of
  buried in a component).
- **`Workout.tsx` DRY** — `loadData` and `rebuildAllSets` shared a 6-line warmup/main/
  joker/supplemental assembly. Extracted into a single `composeAllSets(tm, week, template)`
  helper that both call. Roughly 12 lines collapsed to 3.

### Test Infrastructure — Coverage + Mutation

414 unit and component integration tests covering `src/lib`, `src/screens`, `src/store`, and key components. Vitest v8 coverage enforces ≥80% line, branch, function, and statement thresholds. Stryker mutation testing (`npm run test:mutation`) enforces ≥80% mutation score on `src/lib` using `inPlace` mode with `perTest` coverage analysis.

Coverage approach: lib functions and screens both run against the real `@sqlite.org/sqlite-wasm` engine via the in-process `sqlite-test-client.ts` (Vite alias `/sqlite-client$/`). Screens are exercised end-to-end from DOM event → SolidJS store → SQLite → rendered output with no DB layer mocked.

### Editable History
Route `/history/:sessionId/edit` — edit weight, reps, notes, and accessory exercises on any completed session. Swapping an accessory exercise deletes the old sets and reinserts under the new exercise ID.

### Exit Session Without Saving
EXIT WITHOUT SAVING button on the Workout screen abandons the current attempt, deletes any sets already written to the DB, and leaves the session as `pending` so it can be restarted.

### Plate Calculator
Given a target weight, show which plates to load on each side of the bar. Shown inline on the active set during a workout.

### Per-Set Weight Adjustment
Weight on the active set defaults to the programmed value. Tap the weight display to reveal the stepper (signalled by a dashed underline; accent colour when open). Stored on the set record; TM is unchanged. Completed sets can be re-edited inline.

### React → SolidJS Migration
Rewrote the full app from React 19 + React Router v7 + Zustand to SolidJS 1.9 + @solidjs/router + SolidJS stores. All screens, components, and state management ported; routing structure unchanged. Build tool updated to vite-plugin-solid.

### SQLite Wasm (Worker-based) Database
Replaced Dexie/IndexedDB with SQLite Wasm running in a dedicated Web Worker. All DB reads and writes go through a message-passing interface; the main thread never blocks on IO. Schema and query layer rewritten; data import/export retained.

### Performance & Mobile Optimization
Nine-phase optimization pass targeting mobile frame rate and startup time: layout shift elimination, lazy screen loading, virtualizer removal in History (plain `For` loop), loading placeholder during DB init, DB race fix (gate non-init worker messages on ready promise), and React-remnant cleanup.

### Component-Level Workout Tests
RTL integration tests (`src/screens/Workout.test.tsx`) cover the joker-button flow — successful AMRAP, failed AMRAP, week 2/3 minimums, pending-joker suppression — without requiring a browser. Removes reliance on Playwright as the sole regression gate for core workout logic.

### FSL Weight Fix
`calcFslSets` was hardcoded to 65% TM regardless of week. FSL now derives its weight from the actual first main set (70% on week 2, 75% on week 3), matching the "First Set Last" definition. Parameterised tests cover all four weeks.

### Full Integration Test Suite
`@solidjs/testing-library` + Vitest + in-process `@sqlite.org/sqlite-wasm` (via `sqlite-test-client.ts`) covering every screen and key component: `Today`, `Setup`, `History`, `HistoryEdit`, `Settings`, `AccessoryPicker`, `AmrapTargets`, `RestTimer`, `BottomNav`, `DurationInput`. Every user-visible interaction path exercises the full stack from UI event → SolidJS store → SQLite → rendered output with no DB layer mocked.

### Joker Sets
After logging the AMRAP top set with reps ≥ the week's minimum (≥5/≥3/≥1), a "+ JOKER SET Xlb" button appears. Each joker uses the same rep scheme as the main sets. Button reappears after each successful joker. Disabled on deload week. Joker sets survive reload.

Weight increment is determined by AMRAP performance: if reps strictly exceed double the week's goal (>10 on 5s week, >6 on 3s week, >2 on 1s week), each joker jumps +10%; otherwise +5%. Both increment sizes round to nearest 5lb.

### Warmup Sets

Warmup follows Wendler's 40/50/60% TM prescription: three sets at 5/5/3 reps calculated from TM (not working weight). Any set at or above the first working weight is dropped; weights below 45 lb floor to bar weight; consecutive sets that round to the same weight are deduplicated. Identical scheme for all lifts — no upper/lower special-casing.

### Custom Accessory Exercises

Add new exercises (name + type: reps/timed/distance) from Settings and assign them to lifts. Create, rename, and archive exercises; archived exercises are hidden from the picker but history is preserved.

### Accessory TM Progression Rate

`incrementLb` exposed in the Settings exercise edit form (and in the AccessoryPicker TM setup screen) via a Stepper. Persisted on the latest `accessoryTrainingMaxes` row per exercise. Controls how fast each accessory exercise progresses after each cycle.

### Accessory Data Cleanup

CLEANUP ORPHANS button in Settings → DATA. Deletes `liftAccessories` / `accessoryTrainingMaxes` rows with missing `exerciseId`, deletes `accessorySets` rows with missing `sessionId`, and archives exercises with no assignments and no set history. Gated behind confirm dialog. Detection logic extracted to `buildCleanupPlan` (pure function) with unit and RTL screen test coverage.

### Manual Week Override

CYCLE section in Settings shows the current week (1–4) with skip-forward buttons. Clicking a future week marks all remaining sessions in skipped weeks as `skipped` (creating missing lift sessions as needed) and advances program state. Gated behind confirm dialog.

### Screen Wake Lock

`WakeLockSentinel` acquired at rest timer start, released on stop or session exit. Prevents the display from sleeping mid-rest on mobile. Falls back silently on unsupported browsers (Firefox, older iOS). Lock is re-acquired automatically after a page visibility change releases it.

---

### Supplemental Template Selection

Global supplemental template selector in Settings (single choice applies to all lifts). Templates:
- **FSL+BBB** (default) — 5×10 at first working set weight (FSL's weight, BBB's volume)
- **FSL** — 5×5 at the first working set weight
- **SSL** — 5×5 at the second working set weight
- **SSL+BBB** — 5×10 at second working set weight (SSL's weight, BBB's volume)
- **BBB** — 5×10 at 50% TM
- **BBS** — 10×5 at 60%/70%/80% TM across weeks 1–3; hidden on deload week
- **None** — no supplemental block

Stored in `settings.supplementalTemplate`; migrated from per-lift column on first run. Header in Workout screen is dynamic and shows sets × reps and % TM where applicable.

### Estimated 1RM History Chart

`TmChart` in the History By Lift view refactored to dual-series SVG with shared date-based X axis. TM plotted in accent colour; estimated 1RM (Epley: `weight × (1 + reps / 30)`) from each AMRAP set plotted in dashed warn colour. Legend shows each series only when it has 2+ data points.

---

## Planned

### Push Notifications

Rest timer fires audio + vibration in-app. When the screen locks or the browser backgrounds, cues go silent. Push notifications solve this.

**What's needed**

Service worker — already registered by vite-plugin-pwa. Needs a `notificationclick` handler and access to the Notification API.

Permission request — `Notification.requestPermission()` triggered by a deliberate user action (Settings toggle), not on first load. iOS 16.4+ requires the app to be installed as a PWA.

**Scheduling options**
- `setTimeout` inside the service worker at set-log time. Survives backgrounding on Android; unreliable on iOS due to aggressive SW suspension.
- Push API (`PushManager.subscribe`) with a backend sending a Web Push message at the right timestamp. Reliable cross-platform but requires a server component and VAPID keys.

**Notification types**

| Trigger | Message |
|---|---|
| Rest threshold reached (normal/transition) | "Time for your next set" |
| Rest threshold reached (fail) | "Rest up — take your time" |
| Session left open > 2 hours | "Did you finish your session?" |

**Platform notes**
- Android Chrome: full support
- iOS 16.4+ (installed PWA only): available; prefer Web Push over SW scheduling
- iOS Safari (not installed): no notification support

**Implementation order**
1. Settings toggle: "Notify me when rest is over" (off by default)
2. On enable: `Notification.requestPermission()`
3. Schedule via SW `setTimeout` (covers Android + desktop)
4. Evaluate Web Push backend if SW scheduling proves unreliable on iOS

---

### Onboarding — Methodology Overview

Add an informational section to the setup wizard explaining 5/3/1 basics before the user enters training maxes.

**Key terms to define**
- **Training Max (TM)** — the weight the program calculates sets from; typically 85–90% of true 1RM
- **AMRAP (Plus sets)** — the final main set each week: lift as many reps as possible; performance drives joker sets and TM recommendations
- **Cycle structure** — 4 weeks: week 1 (5s), week 2 (3s), week 3 (5/3/1), week 4 (deload); TM increments after each deload

---

### TM Adjustment Recommendations

After completing a cycle, recommend whether to increase, hold, or reduce the TM for each lift based on AMRAP performance — rather than applying a fixed increment.

- If AMRAP reps are well above target (e.g. 10+ on week 3), suggest a larger jump
- If AMRAP reps are at or below minimum (e.g. ≤ 1 on week 3), suggest holding or reducing
- Surface as a prompt when deload week is completed

---

### Post-Session TM Prompt (from weight adjustments)

If the user bumped up the weight on the top set (AMRAP set) relative to the planned weight, surface a prompt at session completion: "You lifted Xlb on your top set — want to update your training max?" Opt-in only; TM does not change unless confirmed.

- Compare logged weight vs planned weight on the AMRAP set
- Only trigger if logged weight > planned (voluntary bump up, not a bail)
- Skip if cycle is on deload week (no AMRAP)

---

### Training Volume Insights

Per-session and per-week totals:
- Total tonnage (sum of weight × reps across all sets)
- Set count by category (main / FSL / accessory)
- Weekly frequency — how many days trained

Surface in History or a dedicated Stats tab.

---

### 5's PRO

Alternative main set style: always 5 reps across all three working sets regardless of week (no AMRAP). Reduces fatigue during high-volume supplemental phases like BBB. Settable per lift as a toggle alongside the current default.

---


### Leader / Anchor Cycle Structure

Formalize the two-phase programming block from *5/3/1 Forever*:
- **Leader** (typically 2 cycles): high supplemental volume (BBB/BBS), 5's PRO on main sets, no Jokers
- **Anchor** (typically 1 cycle): lower supplemental volume (FSL), AMRAP top sets, Jokers allowed

The app would track which phase the user is in and surface the appropriate options automatically.

---

### 7th Week Protocol

A structured week inserted between Leader and Anchor cycles (or every 2–3 cycles). Three variants:
- **Deload** — standard easy week to shed fatigue
- **PR Test** — attempt a new rep PR at the top set weight
- **TM Test** — perform 3–5 reps at 100% TM; if the user can't hit it cleanly, the app suggests reducing the TM before the next block

---

### Assistance Category Tracking

Tag each accessory exercise as **Push**, **Pull**, or **Single Leg / Core**. Track rep totals per category per session and show progress toward the Wendler target of 25–100 reps from each bucket every workout.

---

### Session Notes Indicator in History

`sessions.notes` is stored and editable in HistoryEdit but invisible in the History list view. Surface a visual indicator (dot or truncated preview) on session rows that have notes, so users can find annotated sessions without expanding each one.

---

### Body Weight Tracking

Log body weight per session (or per day). New `bodyWeights` table (`{ id, weight, recordedAt }`).
Surface as a third series on the History By Lift chart so users can correlate strength vs scale
weight. Optional gate so it doesn't clutter the chart for users who don't track BW.

- Log inline at session start or via a dedicated Settings → BODY WEIGHT entry
- Show latest BW on Today header (optional, behind a Settings toggle)
- Export / import already covers arbitrary tables — extend the JSON shape

---

### Unit Toggle (lb / kg)

Currently every weight in the app is lb. Add a global `settings.unit: 'lb' | 'kg'` and route
all display through a single formatter. Stored weights remain in lb (the canonical unit); the
toggle only affects display and input.

- Affects: SetRow, PlateDisplay, History, HistoryEdit, Setup, Settings, Workout, Today
- Plate math: convert kg input → lb internally, compute plate combination on lb plates,
  display kg labels if user has kg plates configured
- One `formatWeight(lb, unit)` helper used everywhere; no scattered conversions

---

### Per-Lift Bar Weight Override

Some lifts use specialty bars (e.g., 35 lb safety squat bar, 55 lb trap bar, 20 lb women's bar
for OHP). Today the bar weight is global. Add an optional `barWeight` override on each `Lift`
record; if null, fall back to `settings.barWeight`.

- Surface in Settings → LIFTS edit row
- Plate math, warmup floor logic, and Stepper min already use a `barWeight` arg — wire the
  per-lift value through `composeAllSets`, `calcWarmup`, and the AccessoryPicker

---

### Pre-Session Readiness Rating

1–5 sleep / soreness / energy rating logged at the start of a workout. Stored on the session
row (`readiness: number | null`). Surfaces nowhere by default but can be plotted against AMRAP
performance to spot patterns (e.g., low readiness consistently → bailed AMRAP).

- New optional `sessions.readiness` column (additive migration)
- Pre-workout modal at session launch, dismissible
- History chart adds a fourth series option toggleable in the legend

---

### Session Search & Date-Range Filter

History currently filters by lift or date toggle. Add:
- Text search over `sessions.notes`
- Date-range picker (from / to) applied across both view modes
- Filter chips for status (completed / skipped) and week (1–4)

URL-driven so filters survive reload and share via link.

---

### Lift Order Customization

`lifts.order` exists but the UI to reorder it doesn't. Add drag-reorder controls (or up / down
buttons for mobile reliability) in Settings → LIFTS. Reorder applies everywhere lifts are
listed (Today week status, Settings, History By Lift tabs).

- Persisted via `db.lifts.update(id, { order: newOrder })`
- Single transaction to avoid intermediate states where two lifts share an order

---

### Workout Reminders (Scheduled Notifications)

Separate from rest-timer notifications (covered in `Push Notifications` above). Recurring
weekly schedule (M / W / F at 6 PM, etc.) that fires a notification reminding the user to log
a session.

- Depends on push-notification infra being landed first
- Settings → REMINDERS UI: day-of-week checkboxes + time picker
- Scheduled via service worker `setTimeout` chain (Android) or Web Push (iOS PWA)
- Skipped if a session is already logged for that day

---

### Microloading Plate Support

`PlateConfig` already supports fractional weights. UX gaps:
- Settings → PLATES doesn't list 1.25 / 0.5 lb rows by default
- Stepper `step={2.5}` on weight inputs prevents entering microloaded values
- Plate math handles them but display lines truncate awkwardly with many small plates

Add a "MICROLOAD" toggle in Settings → PLATES that exposes 1.25 / 0.5 lb (and 0.25 kg) rows
and switches the default stepper step on Workout / HistoryEdit weight inputs from 2.5 to 1.25
when enabled.

---

### Per-Set Comments

`sets.notes` doesn't exist; only session-level notes do. Add an optional `sets.notes: string |
null` column and a small "+ note" affordance on the active set row. Useful for flagging form
breakdowns, equipment changes, or rep-count uncertainty mid-session.

- Additive schema migration
- HistoryEdit shows notes inline beside each set; tap to edit
- Export / CSV picks up the new column automatically

---

## Security

*Threat model: static Cloudflare-Pages PWA, no server, no auth, client-authoritative. Primary
risk is XSS → OPFS read/write; supply chain is the realistic active threat. CSP shipped in
`index.html` and `public/_headers`; SQL identifier guard in `src/db/sqlite-table.ts`; import
size cap in `src/lib/export-import.ts`; deploy workflow least-privilege + `npm audit
signatures`. See "Security Hardening Pass (2026-05-22)" under Done for details.*

No open items.

### Future considerations

- **Switch deploy from `npm install` → `npm ci`** once the rolldown optional-cpu lockfile bug
  resolves upstream (tracked in `.github/workflows/deploy.yml`). `npm audit signatures` is the
  current bridge.
- **Subresource Integrity / dependency lockdown** — would catch a tampered CDN delivery, but
  all assets are self-hosted today so impact is low. Revisit if any external `<script>` lands.

---

## Tech Debt

No open items.

### Resolved 2026-05-21

- ~~**Dexie-Shaped Query Builder vs SQL backend**~~ — Dexie test backend
  dropped; tests now run against in-process `@sqlite.org/sqlite-wasm`.
  `TableLike<T>` and `db/db.ts` deleted; `TrainingDB` is now `typeof db`.
- ~~**Chainable query builder wrapper classes**~~ — five internal classes
  (`WhereClause` / `WhereQuery` / `OrderByQuery` / `CollectionQuery` /
  `FilterQuery`) in `src/db/sqlite-table.ts` collapsed to two
  (`WhereClause` + `Query<T>`). External chainable API preserved exactly,
  zero call-site changes. Small bonus: `Query.first()` without a filter
  now emits `LIMIT 1` instead of fetching the whole result set and taking
  `rows[0]`. 414/414 tests still pass.
- ~~**`SetSection` duplication in Workout.tsx**~~ — extracted; all four
  `For` loops use it; offset arithmetic centralised.
- ~~**Module-singleton side effects in RestTimer**~~ — `audioCtx` /
  `playTone` / `playCue` extracted to `src/lib/audio-cues.ts`; timer-worker
  getter extracted to `src/lib/rest-timer-worker.ts`. `RestTimer.tsx` is
  now pure reactive UI wiring.
- ~~**`deleteLastSet` triggered a full `loadData` reload**~~ —
  `handleDeleteSet` now calls `rebuildAllSets()`, which recomputes
  `allSets` from existing signals with no DB round-trips.
- ~~**`History.tsx` localStorage read at signal init**~~ —
  `HISTORY_LIFT_KEY` read moved into `load()`; no longer a hidden
  side-effect at component construction time.

---

