# Engineering Passes

Autonomous-execution prompts for `training-log`. Each pass is a full loop: review → implement → verify
locally → commit → push. **Run one by handing the agent § Repository model plus that pass's prompt block** —
the prompts assume this context and do not repeat it.

---

## Repository model

Offline-first PWA for Jim Wendler's 5/3/1. Solid.js 1.9 + TypeScript 6 + Tailwind 4 + Vite 8, SQLite-Wasm on
OPFS. No server, no auth, no runtime network. pnpm. Static deploy to Cloudflare Pages.

### Layout

**`src/lib/*.ts`** — business logic; the highest-value test surface.
- Pure (plain inputs → plain data): `calc.ts` (all 5/3/1 math, plate distribution, rest-phase thresholds),
  `plate-loading.ts`, `format.ts`, `cleanup.ts`.
- DB-parameterized (take a `TrainingDB`, still DOM-free): `cycle.ts`, `tm-recommendations.ts`,
  `training-max.ts`, `pr.ts`, `exercise.ts`, `lift.ts`, `session.ts`, `assistance.ts`.
- Browser-API exceptions living here by convention — do not "purify" them: `export-import.ts` (Blob + anchor
  download, `localStorage` pending-export retry), `audio-cues.ts` (module-scoped `AudioContext`, vibration),
  `rest-timer-worker.ts` (module-scoped `Worker`).

**`src/db/`** — the persistence boundary. `schema.ts` is the single source of truth (`SCHEMA`,
`ADDITIVE_MIGRATIONS`, `ALL_TABLES`), imported by both the prod worker and the test client. `index.ts` builds
`TrainingDB`: one `SQLiteTable` per table plus its date/bool/json field lists. `sqlite-table.ts` is the shared
query layer (`SQLiteTable<T>` → `WhereClause` → `Query<T>`, `assertIdent`). `sqlite-client.ts` is the prod
Worker RPC: 10 s per-call timeout except `init`, reentrant transactions via `txDepth`, terminate on
non-bfcache `pagehide`, `window.__e2eResetDb` behind `import.meta.env.DEV`. `sqlite-test-client.ts` is the
in-process twin; vitest aliases `/sqlite-client$/` onto it.

**`src/store/`** — Solid `createStore` globals. Not Zustand, not React. `workout-store` (active session, linear
`loggedSets`, out-of-order `loggedCrossSets`, accessories; mirrored to `localStorage` by the `createEffect` in
`setupWorkoutPersistence()`, gated by `STORAGE_VERSION`, rehydrated through `PERSISTED_KEYS` +
`PERSISTED_VALIDATORS`), `settings-store` (DB-backed settings, `THEMES`, `applyTheme`), `toast-store`.

**`src/screens/*.tsx`** — Today, Workout, History, HistoryEdit, Stats, Setup, Settings.
**`src/components/{forms,layout,modals,ui,workout}`** — shared primitives; `AppShell` lives in `App.tsx`.
Also `src/workers/timer.worker.ts`, `src/hooks/use-confirmation.ts`, `src/types/domain.ts`. Tests are
co-located `*.test.ts(x)`; Playwright specs live in `tests/e2e/`.

### Invariants

1. **Cycle length is a setting.** `cycleFinalWeek(hasDeloadWeek)` → `3 | 4` is the only source for "how long is
   a cycle". Week 4 is the deload when it exists. `computeClosedThroughWeek` takes `finalWeek` as a
   **required** parameter on purpose — a default silently gave 3-week cycles a week 4. Never add one.
2. **e1RM is Wathan**, `weight / (0.488 + 0.538·e^(−0.075·reps))`, with a `reps === 1 → weight` short-circuit.
   It is asymptotic: `targetReps` returns `null` when `todayWeight / prev1RM ≤ 0.488`, `1` when
   `todayWeight ≥ prev1RM`, and is otherwise floored at 2. AMRAP targets seed off `seedE1Rm` — the **median**
   Wathan estimate over the last `SEED_WINDOW` (3) AMRAPs that `getRecentAmraps` collects from completed
   non-deload sessions, at most one per `(cycleId, week)`.
3. **Program constants are canon**: `MAIN_PERCENTAGES`, `MAIN_REPS`, warmup 40/50/60, `BBB_PCT`,
   `BBS_PERCENTAGES`, `ACCESSORY_*`, `TM_PCT_OF_1RM`, `BAR_WEIGHT`, `JOKER_MIN_REPS`, `REST_*`,
   `SESSION_TM_BUMP_THRESHOLD` (0.15), `CYCLE_DOUBLE_THRESHOLD` (0.10), `SEED_WINDOW`, the Wathan constants.
   Re-weighing one is a behavior change — never a refactor, never a bug fix.
4. **Schema edits move together**: `SCHEMA` + `ADDITIVE_MIGRATIONS` + `ALL_TABLES` + `domain.ts` + the
   `SQLiteTable` field lists in `db/index.ts` + `COLS`/`importSpec` in `export-import.ts`. Out of scope for
   every pass but Pass 7.
5. **Persisted store shape is gated by `STORAGE_VERSION`.** Changing the shape without bumping it is a bug.
6. **Lift IDs are positional** (seed order: OHP, Deadlift, Bench, Squat). Look up by name.
7. **Layering holds**: `src/lib` stays DOM-free apart from the three exceptions above; screens stay thin over
   lib + store; all SQL goes through `SQLiteTable`.

### Intentional behavior — confirm, then leave alone

- **Import is destructive.** `importFromRawData` validates shape, then clears every table in `importSpec`
  inside one transaction and restores only the tables present in the payload. No partial merge.
- **`ADDITIVE_MIGRATIONS` is append-only, each statement in a swallowed try/catch**, so re-running is a no-op.
  It is no longer strictly additive — it already carries `DROP TABLE IF EXISTS liftAccessories` and a
  `CREATE UNIQUE INDEX`. Indexes that can fail against existing data belong here, not in `SCHEMA`, whose exec
  is unguarded and would break every boot.
- **Week 4 suppresses work**: `isAmrap = week !== 4 && i === 2`, `shouldShowJokerButton` returns false,
  `BBS_PERCENTAGES[4] === null` empties BBS. `effectiveSupplementalWeek` then resolves deload supplemental and
  cross volume from the `deloadSupplemental` setting: `skip → null`, `normal → week 1`, `deload → week 4`.
- **Cross-lift sets are separate**: persisted in `sets` with `type: 'cross'` and their own `liftId`, tracked in
  `workout.loggedCrossSets`, deliberately outside the linear `currentSetIndex`/`loggedSets` model.
- **`shouldShowJokerButton` hides once supplemental logging starts** — a joker would shift the positional
  indices the logged-set mapping depends on.
- iOS Safari's back-swipe cannot be suppressed from web code (`.claude/COMMON_MISTAKES.md` #6).
  `public/demo-seed.json` is a manual Settings → IMPORT payload, never auto-seeded.

### Commands

```bash
pnpm dev            # 5173
pnpm typecheck      # tsc -b. Root tsconfig is a solution file (files: []) — `tsc -p tsconfig.json` checks NOTHING
pnpm build          # tsc -b && vite build
pnpm lint           # eslint; no-floating-promises enforced on src/ and tests/e2e/
pnpm test           # vitest run — whole suite, seconds. Never scope it down "to save time"
pnpm test:coverage  # + v8 gate: 80% stmt/branch/fn/line over src/lib, src/screens, src/store
pnpm test:mutation  # stryker over src/lib; report in reports/mutation/ (gitignored)
pnpm test:e2e       # playwright; auto-starts `pnpm dev`, resets OPFS per test via window.__e2eResetDb
pnpm check          # build + test
pnpm debug:browser  # scripts/debug-browser.js: chromium walks the setup wizard, dumps page text +
                    # console errors, writes scripts/screenshot.png
```

`debug:browser`'s wipe step deletes an IndexedDB named `TrainingLog`, unused since the SQLite migration — it
does **not** clear OPFS. For a genuine first-run state use `pnpm test:e2e` (its `_freshDb` fixture calls
`__e2eResetDb`) or clear site data by hand.

### Shipping

Conventional Commits. **No `Co-Authored-By` trailer.** Trunk-based: commit and push to `main`.

`.github/workflows/deploy.yml` fires on `push` to `main` **only when the diff touches `src/**` (excluding
`src/**/*.test.*`), `public/**`, `index.html`, `package.json`, `pnpm-lock.yaml`, `vite.config.*`, or
`tsconfig*`** — plus `workflow_dispatch`. It installs `--frozen-lockfile`, runs `pnpm audit signatures`,
builds, deploys with wrangler. **It never runs lint, tests, or e2e.** Local `pnpm build && pnpm lint && pnpm
test` is the only regression gate that exists.

A test-only or docs-only commit starts no deploy — do not wait on a run that will never appear. When the diff
does touch a deploy path:

```bash
gh run watch "$(gh run list -L1 --json databaseId -q '.[0].databaseId')" --exit-status
```

---

## Quick pick

| Pass | Use when |
|------|----------|
| [1. Structural Refactoring](#1-structural-refactoring) | Code works but is clever, over-abstracted, or hard to follow. Maintainability, zero behavior change. |
| [2. Security Mitigation](#2-security-mitigation) | Verify and tighten the shipped defenses against this PWA's real threat model — XSS and supply chain. |
| [3. High-Signal Testing](#3-high-signal-testing) | Coverage is thin or vanity; you want behavior tests that make refactoring safe. |
| [4. Mutation Hardening](#4-mutation-hardening) | Point Stryker at one `src/lib` module, kill tests that pass without constraining anything. Repeatable. |
| [5. Bug Hunting](#5-bug-hunting) | You suspect defects ship silently — wrong weights, mis-classified cycles, missed PRs, crashes on bad input. |
| [6. Design System & UI](#6-design-system--ui) | Visual/UX work inside the existing terminal-brutalist system: restyle, tokenize, or build a screen in-style. |
| [7. Schema & Migration](#7-schema--migration) | Add or change a column/table. The only pass allowed to touch `schema.ts`. |

---

## 1. Structural Refactoring

```text
Act as a veteran TypeScript engineer refactoring training-log. Mandate: maintainability with ZERO behavior change — no computed 5/3/1 output moves, no persisted shape changes, no schema changes, no redesign. You are not hunting bugs (Pass 5) and not chasing coverage (Pass 3).

TARGETS, richest first: src/lib/calc.ts, cycle.ts, tm-recommendations.ts, export-import.ts; src/store/workout-store.ts; src/db/sqlite-table.ts; and the two largest screens, src/screens/Workout.tsx and Settings.tsx.

CRITERIA
1. YAGNI. Delete abstractions solving hypothetical problems. Slightly repetitive and obvious beats parametrized and clever. House precedent: the query builder collapsed from five wrapper classes to two (WhereClause + Query<T>) with the external API untouched.
2. Single definition per derived value. accessoryWeight, cycleFinalWeek, effectiveSupplementalWeek, importSpec, and getLatestAccessoryTms each exist because two call sites had drifted. Collapse a duplicated computation the same way.
3. Locality of behavior: a calc helper's inputs, math, and output shape read in one flow; a cache mutation sits beside its guard.
4. No module-init side effects. localStorage/timer/audio wiring belongs in a setup function called from a reactive root, not at import time.
5. Flatten. Early returns over nested conditionals.
6. Layering. src/lib stays DOM-free (except export-import / audio-cues / rest-timer-worker); screens stay thin over lib + store; every query goes through SQLiteTable.

DISCIPLINE
- Verify before restructuring. Run `pnpm test:coverage` and read the uncovered lines for the code you are about to move. If the suite does not reach it, add at most three tests pinning CURRENT behavior first, so the refactor lands verified rather than hopeful.
- A suspected framework quirk (Solid reactivity, @solidjs/router, @sqlite.org/sqlite-wasm) must be confirmed against the INSTALLED source under node_modules or reproduced in a test before you code around it. No defensive code for behavior the library does not have.
- If a cleanup needs a schema change, a constant change, or a real bug fix: STOP and note it for Pass 7 / Pass 5. Do not smuggle it in.

DONE WHEN: build, lint, and test are green with no assertion weakened or deleted; every hunk is justifiable as a pure restructure; the commit message states WHY the structure changed.
```

---

## 2. Security Mitigation

```text
Act as a security architect reviewing training-log: a static, client-authoritative PWA. No server, no auth, no backend — all data lives in the user's browser (OPFS SQLite + localStorage). The threat model is exactly two things: XSS gives full read/write of the training DB, and a tampered dependency or lockfile is the realistic active threat. Implement concrete local mitigations for THAT model only. Server-side auth, session tokens, rate limiting, and encryption-at-rest do not apply and would be theater.

The defenses below already shipped (ROADMAP.md § Security). Verify each is intact, tighten its edges, cover it with a test — do not re-invent it.

1. CSP. The identical policy string exists in THREE places: the <meta http-equiv> in index.html, the Content-Security-Policy line in public/_headers (production), and preview.headers in vite.config.ts. It must keep `script-src 'self' 'wasm-unsafe-eval'` (SQLite Wasm), `style-src 'self' 'unsafe-inline'` (Tailwind minimum), `worker-src 'self' blob:` (PWA SW + sqlite worker), plus object-src 'none', base-uri 'self', form-action 'none', frame-ancestors 'none'. Flag drift between the three. The OTHER headers intentionally differ — public/_headers additionally sets X-Frame-Options, Permissions-Policy, Cross-Origin-Opener-Policy and a stricter Referrer-Policy; the preview server sets a narrower set. Do not "sync" those.
2. SQL identifier hygiene. assertIdent (^[A-Za-z_][A-Za-z0-9_]*$) must still guard the SQLiteTable constructor, WhereClause, Query.orderBy, and the column-key lists in add/put/update — so no caller, especially a bulkAdd fed from imported JSON, can interpolate an attacker-controlled identifier into the SQL string.
3. Untrusted import payload. validateImportShape must run BEFORE the destructive clear (non-array table value, non-object row, duplicate ids all reject with a friendly error). importJson must reject over MAX_IMPORT_BYTES before file.text() materializes the string, and reject non-object or array top-level JSON. The per-table COLS allowlist drops unknown keys. A malicious or malformed backup fails safe: never a raw SQL error, never a grafted column, never a half-wiped DB.
4. Persisted-state tampering. loadFromStorage must reject a non-object blob, DROP state on STORAGE_VERSION mismatch rather than throw, and copy only PERSISTED_KEYS whose value passes its PERSISTED_VALIDATORS entry — a wrong-typed value under an allowlisted key is discarded, not grafted.
5. Route slug → SQL parameter. HistoryEdit's :sessionId stays coerced through `Number.isInteger(n) && n > 0` and redirects to /history on failure, never binding NaN.
6. Dev-only escape hatch. window.__e2eResetDb stays behind import.meta.env.DEV so it cannot ship to production.
7. Supply chain / deploy. deploy.yml keeps `permissions: contents: read`, `persist-credentials: false`, `pnpm install --frozen-lockfile`, and `pnpm audit signatures`. PWA config keeps cleanupOutdatedCaches: true with registerType: 'prompt' and skipWaiting/clientsClaim false, so a stale or tampered precache is evicted and updates are never force-activated.

SCOPE GUARDS: no authentication, no encryption-at-rest, no security framework, no new runtime dependency. Do not weaken offline-first behavior or the destructive-import contract.

DONE WHEN: every new or tightened guard has a test — precedents are src/db/sqlite-table.test.ts (identifier guard), src/lib/export-import.test.ts (import guards), src/store/workout-store.test.ts (hydration allowlist); build, lint, and test are green; the commit names the exact vulnerability closed and the method.
```

---

## 3. High-Signal Testing

```text
Act as a veteran TypeScript engineer extending the training-log test suite (Vitest + @solidjs/testing-library + in-process @sqlite.org/sqlite-wasm). Optimize for confidence and safe refactoring, not for the coverage number. Do not test Solid, @solidjs/router, or the SQLite engine — pin OUR usage of them.

ROUTE EACH TEST TO ITS OWNING LAYER
- src/lib/*.test.ts — the pure and DB-parameterized core. Highest value. No DOM, no mocks: build real inputs (or real DB state) and assert on returned data.
- src/screens/*.test.tsx — DOM event → Solid store → real SQLite → rendered output, nothing between mocked.
- src/store/*.test.ts — persistence, version gating, hydration validators, theme apply, toasts.
- src/db/*.test.ts — the SQLiteTable query surface, assertIdent, reentrant transactions, serialization round-trips.

TEST ARCHITECTURE AS IT ACTUALLY IS
- The DB engine in tests IS the production engine; only the Worker/OPFS transport differs. There is nothing to mock.
- There is NO autouse reset fixture. lib and db suites call `__resetForTest()` (from ../db/sqlite-client) in their own beforeEach; screen suites instead clear the specific tables they seed. Follow whichever convention the file you are editing already uses.
- The only mock in the suite is @solidjs/router's useNavigate, spread over vi.importActual, in five screen suites. Do not add more.
- src/test-setup.ts supplies MockWorker (jsdom has no Worker; it speaks only the rest-timer protocol, since the SQLite worker is aliased away), a localStorage polyfill, and scrollIntoView. Nothing else is stubbed — if a component needs a new browser API, add it there deliberately rather than assuming one exists.
- The coverage gate spans src/lib, src/screens, src/store only. src/components, src/db, and src/hooks sit outside it; a component earns a test when it owns real logic (Stepper, RestTimer, SetRow, InlineConfirm, AccessoryPicker, AmrapTargets, NotesField, DurationInput, TmRecommendationModal are the precedents).

PRINCIPLES
1. Assert outputs, not call sequencing: computed set arrays (weight/reps/isAmrap/type), cycle-advance deltas, recommendation flags, persisted rows, rendered structure. Pin numbers, counts, flags, and row shapes — never exact toast prose or copy that is allowed to be reworded.
2. Target decisions, not lines. Chase uncovered BRANCHES encoding a guard, threshold, or fallback; `pnpm test:coverage` prints them per file. Pick from that evidence, not intuition.
3. The boundaries where regressions actually live: warmup dedup/break/bar-floor; the week-4 gates across every supplemental template (fsl, ssl, bbb, fsl+bbb, ssl+bbb, bbs) and every deloadSupplemental mode; calcPlates paired-vs-total, its 0.01 `remaining` tolerance, and the not-achievable → null return; the Wathan reps===1 short-circuit, targetReps's null and floor-of-2 edges, seedE1Rm's even/odd median; computeClosedThroughWeek monotonicity when the roster changes mid-cycle; the CYCLE_START_TOLERANCE_MS auto-progression-vs-manual-bump discriminator; doubling eligibility after a redo; PR detection at exact ties and on the first-ever AMRAP.
4. Degrade, don't crash: malformed or oversized imports, non-object persisted state, bad route slugs, empty cycles and sessions, archived lifts, a DB with zero history. Assert the friendly/safe state.
5. Reuse the file's existing fixture helpers and it.each patterns instead of inventing parallel synthetic data. Never seed a test from a real user export.
6. For src/lib the real bar is mutation, not lines (Pass 4). A test that cannot fail under a flipped comparator is vanity.

DONE WHEN: build, lint, test, and `pnpm test:coverage` are green. If a new test fails, fix the TEST — unless you uncovered a genuine defect, in which case fix the source and say so. Commit message describes the BEHAVIOR now covered.
```

---

## 4. Mutation Hardening

Repeatable: each run takes one `src/lib` module, finds tests that pass without constraining anything, and
ships assertions that kill the survivors.

```text
Act as a TypeScript engineer hardening the training-log suite against mutation. Run Stryker against ONE module under src/lib, analyze the surviving mutants, sharpen tests until they die, ship. Pick a different module each run.

STRYKER AS CONFIGURED (stryker.config.mjs)
- `mutate: ['src/lib/**/*.ts', '!src/lib/**/*.test.ts']` — every lib module, export-import included.
- `thresholds: { high: 80, low: 60, break: 40 }`. The run FAILS below 40. 80 is the green-report aspiration, not a gate — do not claim a "≥80% gate".
- `inPlace: true`: mutants are written into your working tree during the run. After every mutation run, confirm `git status` is clean before committing.
- coverageAnalysis 'perTest', disableTypeChecks false. Reports land in reports/mutation/ (html + json).

PHASE 1 — RUN AND TRIAGE
1. Scope the run: temporarily narrow `mutate` to ['src/lib/<module>'], or run the full `pnpm test:mutation` and read only that module's section of the HTML report.
2. For each Survived / NoCoverage mutant record the line, the mutation applied, and WHY the current tests miss it (assertion too loose? branch never exercised? only the happy path?).
3. Note genuinely equivalent mutants and move on — do not chase them.
4. Probe before writing a test for any survivor in import-time code (module-level constants, top-level regexes). perTest coverage cannot attribute those to a test, so Stryker runs an unrelated subset and reports a FALSE survivor. Hand-mutate the line, run only that module's test file, and see whether the suite already kills it — several "survivors" in export-import.ts are exactly this. A `Timeout` verdict deserves the same probe: it counts as detected, but it may mean an unrelated screen test hung rather than an assertion firing.

PHASE 2 — KILL
For each real survivor, tighten or add a test in the matching src/lib/<module>.test.ts:
- Assert specifically enough to fail under that exact mutation: the precise rounded weight rather than `> 0`; the value at the threshold AND one step either side; `[]` rather than "falsy"; the null return rather than "not truthy".
- Reuse the file's existing fixtures and it.each patterns.
- Do NOT edit src/lib to make a mutant die — unless it exposed a genuine defect, in which case fix the source and lead the commit with that.
- Round asserted floats the way the code does (roundToNearest5, the 0.01 plate tolerance). Never pin raw floating-point noise.

PHASE 3 — SHIP
Restore the full `mutate` glob. Run build, lint, test, then `pnpm test:mutation`; confirm the targeted survivors are dead and the module's score did not regress. Verify `git status` shows only your intended diff (inPlace). Commit naming the module and the class of mutant killed.

GUARDRAILS: never commit a narrowed stryker.config.mjs. One module per run — resist a second. A test that only lifts the line-coverage number without killing a mutant is exactly the vanity test this loop exists to replace.
```

---

## 5. Bug Hunting

Defect discovery is the *only* job here. Nothing gets refactored, no coverage target chased, no threat hardened.

```text
Act as a veteran TypeScript engineer doing a defect hunt on training-log. Your ONLY mandate: find and fix real bugs — logic errors, edge-case failures, silent wrong outputs, crashes. You are NOT refactoring, NOT adding coverage for its own sake, NOT doing security work.

A real bug produces, on a plausible input: a wrong training weight or rep target, a mis-classified cycle or week state, a missed or invented PR, corrupted persisted/imported data, or a throw where the app should degrade. A line that merely looks risky but is provably correct on every reachable input is NOT a bug — no defensive code for it.

HUNT IN LAYERS. Name the triggering input before deciding a defect is real.

A — 5/3/1 math (src/lib/calc.ts → calc.test.ts)
  - roundToNearest5 and the Math.max(barWeight, …) floor: can any TM produce a set below the bar, or round the wrong way?
  - calcPlates in BOTH modes — `paired` halves (target − base), `total` does not. Probe a target whose accumulated `remaining` lands just inside/outside the 0.01 tolerance, a target below `base` (→ null), and an exactly-`base` target (→ []).
  - calcWarmup: a TM where two warmup percentages round to the SAME weight from different raw values (must collapse to one), and a TM low enough that a warmup rounds up to ≥ workingWeight (must break, not emit a set at or above the work set).
  - estimated1RM / targetReps under Wathan: the reps===1 short-circuit; ratio exactly at 0.488 vs just above; the floor-of-2; todayWeight ≥ prev1RM. seedE1Rm's median on an even-length window and on an empty list.
  - applySupplementalOverride / applyMainCascadeToSupplemental index math when more sets are logged than computed, or when the template has no source set.

B — cycle state (src/lib/cycle.ts, tm-recommendations.ts)
  - Both cycle shapes. With hasDeloadWeek=false the terminal week is 3; verify advancement, TM progression, and getRecentAmraps's `week !== 4` deload filter all behave when week 4 never exists.
  - computeClosedThroughWeek / syncClosedThroughWeek: a reopened week (fresh pending row beside an old completed row) must stay open; archiving or adding a lift mid-cycle must not reopen a frozen week or prematurely close a live one.
  - CYCLE_START_TOLERANCE_MS (60_000): probe a TM timestamp exactly at the boundary — the comparators must not let one bump count as both auto-progression and manual bump.
  - getCycleDoublingCandidates: latest-per-week dedup after a redo; a MISSING week vs a logged 0-rep AMRAP are different inputs and must not collapse to one branch.
  - getNextSessionAdvancingIfDone with no cycle, no active lifts, or an all-archived roster — assert a defined result or the intended throw.

C — PR detection (src/lib/pr.ts): strict `>` on both reps-at-exact-weight and e1RM; an exact tie is not a PR; the first-ever AMRAP returns e1RmPr=true; excludeSetId prevents self-comparison; reps < 1 is never a PR and never a record.

D — persistence (src/db/sqlite-table.ts, sqlite-client.ts): the reentrant txDepth guard invoked from inside an open transaction; Query.last() without orderBy (throws by design); a valid-but-nonexistent column in orderBy; bulkAdd([]); null round-trips through the date/bool/json field lists (null in, null out — not "null", not 0).

E — store + session lifecycle (src/store/workout-store.ts, src/lib/session.ts): each PERSISTED_VALIDATORS branch against a wrong-typed value; a partially-written blob; STORAGE_VERSION mismatch dropping rather than throwing; deleteLastCrossSetFor when no set matches the liftId; discardPendingSession's status check (INSIDE the transaction on purpose — no await gap); reconcileActiveSession when the stored session is gone or already completed.

F — import/export (src/lib/export-import.ts): validateImportShape must reject BEFORE any clear() runs; top-level array; string where a number is expected; duplicate ids; a table key absent entirely (still wiped, by design); export → re-import round-trip on a DB with zero sessions; the legacy single_leg → legs category migration.

CONFIRMATION DISCIPLINE
- Math: compute expected vs actual by hand and state the concrete numbers in the commit — "estimated1RM(100, 1) must return 100 via the reps===1 short-circuit but returned 103.3" beats "fixed e1RM bug".
- Framework/engine behavior: confirm against the INSTALLED source under node_modules or reproduce it in a test. No speculative defensive code.

FIX DISCIPLINE
- Minimal change at the defect site. No opportunistic refactoring; if the fix requires understanding a neighboring abstraction, understand it — do not rewrite it.
- Every confirmed fix gets a regression test that FAILS on the pre-fix code. Verify both directions (stash the fix, watch it fail, restore) before moving to the next suspect.

TRIAGE: anything under § Intentional behavior is deliberate — log it as "confirmed intentional — not a bug" and move on. A fix needing a schema change, a program-constant change, or a persisted-shape change is out of scope; stop and note it.

DONE WHEN: build, lint, and test are green. If a fix broke an existing assertion, decide whether that assertion pinned the BUG (update it and say so) or your fix is wrong (revert). Commit each fix or tight cluster with the concrete defect, the triggering input, and expected-vs-actual.
```

---

## 6. Design System & UI

The app already has a coherent design system: dense terminal/brutalist monospace, 14 CSS-variable tokens, 11
swappable themes. The job is never to invent or import a look — it is consistency inside the one that exists.

```text
Act as an expert frontend engineer and typographer working on training-log (Solid.js + Tailwind CSS v4). The app ALREADY has a complete design system. Make changes idiomatic to it and leave the UI more coherent than you found it. This is a visual/UX pass: logic in src/lib, src/store, and src/db stays put.

MENTAL MODEL FIRST
- Solid, not React: <Show>/<For>/<Index> + signals, no hooks, no component kit, no animation library. @solidjs/router's <A> with activeClass/inactiveClass. Tailwind v4 configured through `@theme` in src/index.css — there is no tailwind.config.js.
- Tokens (the DNA): exactly 14 CSS custom properties — --color-{bg, surface, surface-high, border-dim, border, text, text-dim, muted, faint, on-accent, accent, warn, danger, info}. Declared TWICE and kept in lockstep: the `@theme` block in src/index.css (Tailwind's defaults, generating bg-bg, bg-surface, text-text, text-muted, text-faint, border-border, text-accent, text-warn, text-danger, text-info, text-on-accent …) AND the THEMES map in src/store/settings-store.ts, where ELEVEN themes — oled, oled-light, rosepine, frappe, macchiato, mocha, latte, solarized-dark, gruvbox, nord, dracula — each override every var at runtime through applyTheme(). Consume tokens only through the Tailwind utilities.
- Primitives — reuse, do not reinvent: Rule (the `--- LABEL ---` divider) and SectionLabel (its lighter eyebrow sibling); ToggleChip (the one-of-N toggle idiom); Stepper, SetReadout, SetLogControls/FieldRow, PlateDisplay, DurationInput, NotesField, NotesText, ExerciseEditor; BottomNav, Toast; ConfirmationDialog + useConfirmation, LiftSetupModal, CycleCompleteModal, TmRecommendationModal; InlineConfirm; SetRow, CrossBlockLog, AccessoryLog, AccessoryPicker, AmrapTargets, RestTimer. AppShell lives in App.tsx.
- House idiom: font-mono throughout; UPPERCASE + tracking-widest for labels and buttons; normal case for body; sharp corners (0 radius, rare rounded-sm); border/border-2 structure with NO drop shadows — depth comes from surface/border layering; accent for active/focus/primary; hard hover flips (border/text → accent).

THE CARDINAL RULE
Every color is one of the 14 tokens, used via its Tailwind utility. NEVER hardcode a color — not a hex (text-[#4ade80]), not an arbitrary palette class (bg-zinc-800, text-green-400), not an inline style={{ color }}. A hardcoded color looks fine in the theme you are testing and is silently wrong in the other ten. The codebase is currently clean of these; keep it that way. If you genuinely need a new token, add it to src/index.css `@theme` AND all eleven THEMES entries in the same change, with a per-theme value that holds contrast — never just the dark value. (The one legitimate inline-color site is the Settings theme-swatch preview, which renders t.vars['--color-…'] on purpose. Do not "fix" it.)

SCOPE — confirm with the user which you are doing before writing code: (a) restyle a specific screen/component, (b) refactor accumulated one-off styles into tokens/primitives, or (c) build a new screen in-style. Then propose a short plan that centralizes tokens, maximizes primitive reuse, and removes duplication.

CRITERIA
1. Token discipline. An existing hardcoded color is a bug — tokenize it. Collapse one-off spacings into the shared idiom.
2. Primitive reuse over duplication. A bordered section is Rule/SectionLabel plus the standard card idiom, not a bespoke div. A number-with-label is SetReadout. A +/- control is Stepper. A one-of-N toggle is ToggleChip. Extend a primitive's props before forking it.
3. Accessibility across ALL ELEVEN themes. The accent swings from lime to teal to purple by theme — verify contrast in oled-light and latte, do not assume. Keep ≥44px touch targets, visible accent focus rings (never strip focus styles), BottomNav's env(safe-area-inset-bottom) handling, and aria-hidden on decorative numerals.
4. Motion: CSS only — transition-colors, hover:scale-*, duration-200/300. Snappy and flat. src/index.css already applies a blanket prefers-reduced-motion override app-wide, so per-site guards are unnecessary; do not remove it.
5. Typography stays monospace. Do NOT introduce a webfont: the CSP has no font-src, so an external <link> is blocked at runtime and a custom face would have to be self-hosted and bundled.
6. Mobile-first. Base styles target the phone; layer md:/lg:. Keep content clear of the fixed BottomNav, which shares the bottom strip with the rest-timer card and Toast. Check 320 / 768 / 1024.

SCOPE GUARDS — a change needing any of these is out of scope; stop and note it:
- No change to computed 5/3/1 output, DB schema, or the persisted store shape.
- No hardcoded colors, and no new token unless index.css `@theme` and all eleven THEMES move together.
- No new runtime dependency (animation lib, font, icon set, UI kit). No external CDN, inline <style>, or inline <script> — the CSP forbids it, and index.html + public/_headers + the vite preview headers stay mirrored (Pass 2).
- No removal of focus styles, touch-target size, or safe-area handling for the sake of looks.

VERIFICATION — a green unit run does NOT prove it looks right.
1. build, lint, test. Component tests render real DOM; assert on structure, token classes, and ARIA, not on copy allowed to be reworded. If a restyle broke a test pinning brittle prose, re-point that test at meaningful structure.
2. Drive the real app and LOOK. `pnpm debug:browser` walks the setup wizard and screenshots; for anything deeper, write a throwaway Playwright script inside the project directory modeled on scripts/debug-browser.js (it resolves the bundled chromium — there is no system Chrome here). Toggle themes in Settings — at minimum oled, oled-light, and latte — to confirm no hardcoded color leaked and contrast holds. Spot-check a 320px width.
3. Commit with the design intent (what was tokenized or unified, and why), not a list of class diffs.
```

---

## 7. Schema & Migration

The only pass allowed to change `src/db/schema.ts`; every other pass defers here. A column added in one place
and forgotten in another is `.claude/COMMON_MISTAKES.md` #1, and it fails only on already-deployed OPFS
databases — never in tests, which always start from a fresh `SCHEMA`.

```text
Act as a veteran TypeScript engineer making a schema change to training-log. The DB is SQLite-Wasm persisted in each user's OPFS; there is no server and no migration runner. SCHEMA is applied with CREATE TABLE IF NOT EXISTS on every boot, then every statement in ADDITIVE_MIGRATIONS runs inside a swallowed try/catch — a fresh install gets the new shape from SCHEMA, an existing install gets it from the migration. Both paths must land on the same shape.

EVERY SCHEMA CHANGE TOUCHES ALL OF THESE, IN ONE COMMIT
1. src/db/schema.ts — add the column to SCHEMA (fresh installs) AND append a matching `ALTER TABLE … ADD COLUMN` to ADDITIVE_MIGRATIONS (deployed installs). Add a new table to ALL_TABLES too, or __resetForTest leaks rows across tests.
2. src/types/domain.ts — mirror the field. New columns are optional (`?`) unless every existing row is backfilled: an ALTER TABLE gives existing rows NULL.
3. src/db/index.ts — register non-trivial serialization on that table's SQLiteTable instance (dateFields / boolFields / jsonFields). A Date or boolean without its field list round-trips as an ISO string or an integer.
4. src/lib/export-import.ts — add the column to that table's COLS allowlist or it is silently dropped from every backup; add a new table to both COLS and importSpec (which drives the destructive clear AND the restore).
5. Consumers: settings defaults in src/store/settings-store.ts (SETTINGS_DEFAULTS plus loadSettings's per-field fallback), seed data in src/db/seed.ts, and any pure helper resolving the new field.

RULES
- ADDITIVE_MIGRATIONS is APPEND-ONLY. Never edit or reorder a shipped entry — deployed DBs have already run it, and the ALTER will throw (harmlessly swallowed) rather than re-apply.
- Prefer a nullable column plus a resolver over a backfill. Precedent: plateMode/implementBase are both NULL by default, with resolveLiftLoading / resolveExerciseLoading falling back to the legacy usesBarbell flag, so no existing row was touched.
- An index that can FAIL against existing data (a UNIQUE index over rows that may already hold duplicates) goes in ADDITIVE_MIGRATIONS, never in SCHEMA — SCHEMA's exec is unguarded and a failure there breaks every boot for that user. The accessoryNotes unique index is the precedent.
- A destructive migration (DROP TABLE / DROP COLUMN) is allowed only when the target holds no training history and nothing reads it. `DROP TABLE IF EXISTS liftAccessories` is the only precedent — it held assignments, not logged sets. State that reasoning in the commit.
- Renaming a column is two shipped steps, not one: add the new column and dual-write/read first; drop the old one only after users have booted through the intermediate version. In a single-user local-first app, prefer not renaming.

VERIFICATION — tests always start from a fresh SCHEMA, so they CANNOT catch a missing migration.
1. build, lint, test.
2. Add a test asserting the new field round-trips through its SQLiteTable (write a typed value, read it back typed) and survives an export → import cycle.
3. Exercise the UPGRADE path explicitly, not just the fresh-install path: run the app against a pre-existing OPFS database (`pnpm dev` in a browser profile that already holds data, or `pnpm debug:browser:nowipe`) and confirm no "no such column" error and that existing rows read back with the intended default. This step is the whole point of the pass — do not skip it.
4. Commit with the column/table, both the SCHEMA and migration edits, and what existing rows resolve to.
```
