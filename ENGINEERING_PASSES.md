# Engineering Passes

Reusable autonomous-execution prompts, **adapted to this repo** (`training-log`: a Solid.js + TypeScript +
SQLite-Wasm offline-first PWA for 5/3/1 strength training; `npm` / `vitest` / `playwright` / `stryker`,
deployed static to Cloudflare Pages). Each is a full loop — the agent reviews, implements, verifies through
the toolchain, commits, and pushes. Pick a pass, paste its prompt, let it run.

Repo shape the prompts assume:
- `src/lib/*.ts` — pure business logic, the analysis core. Takes a `TrainingDB` or plain inputs, returns
  plain data. `calc.ts` (5/3/1 math: percentages, warmups, jokers, FSL/SSL/BBB/BBS, AMRAP targets, plate
  math, rounding), `cycle.ts` (cycle advancement + TM progression + doubling candidates), `tm-recommendations.ts`
  (post-session bump + cycle-end doubling eligibility), `training-max.ts`, `exercise.ts`, `cleanup.ts`,
  `export-import.ts`, `pr.ts`, `format.ts`. NO DOM, NO I/O — the highest-value test surface.
- `src/store/*.ts` — Solid `createStore`/`createSignal` global reactive state (`workout-store` persisted to
  localStorage via a version-gated `createEffect`, `settings-store`, `toast-store`). NOT Zustand, NOT React.
- `src/db/` — the ONLY I/O boundary. `schema.ts` is the single source of truth (`SCHEMA`,
  `ADDITIVE_MIGRATIONS`, `ALL_TABLES`); `sqlite.worker.ts` (prod: Web Worker + OPFS SAH pool, 10s RPC
  timeout) and `sqlite-test-client.ts` (test: in-process, no Worker/OPFS) both import from it. `sqlite-table.ts`
  is the shared query layer (`SQLiteTable<T>` + `WhereClause`/`Query<T>`, date/bool/json serialization,
  `assertIdent` guard). Vitest aliases `/sqlite-client$/ → sqlite-test-client`.
- `src/screens/*.tsx` — one page per route (Today, Workout, History, HistoryEdit, Setup, Settings).
- `src/components/*.tsx` — layout / modals / forms / ui / workout components.
- `src/lib/**/*.test.ts(x)`, `src/screens/**`, `src/store/**` — co-located Vitest suites (468+ tests),
  run against the real SQLite engine via the in-process client (no DB mocks). Coverage gated ≥80%
  (line/branch/fn/stmt) on `lib`/`screens`/`store`; Stryker mutation ≥80% on `lib` (`npm run test:mutation`).
- `tests/e2e/` — Playwright specs.
- Design constraints live in `.claude/ARCHITECTURE_MAP.md` (boot order, layering) and
  `.claude/COMMON_MISTAKES.md` (schema-drift, destructive import, positional lift IDs, persisted-store
  staleness). Threat model + shipped mitigations are in `ROADMAP.md` § Security.

## Quick pick

| Pass | Use when |
|------|----------|
| [1. Structural Refactor](#1-structural-refactoring) | Code works but is clever / over-abstracted / hard to follow; maintainability without behavior change. |
| [2. Security Mitigation](#2-security-mitigation) | Concrete, local hardening against this PWA's real threat model — not security theater. |
| [3. High-Signal Testing](#3-high-signal-testing) | Coverage is thin or vanity; you want behavior tests that make refactoring safe. |
| [4. Mutation-Hardening Loop](#4-mutation-hardening-loop) | Run Stryker against `src/lib`, find tests that pass but don't actually pin behavior, kill survivors, ship. Repeat to ratchet the suite. |
| [5. Bug Hunting](#5-bug-hunting) | You suspect real defects ship silently — wrong weights, mis-classified cycles, missed PRs, crashes on bad input. Find, confirm, fix, and pin them; no refactoring, no coverage-chasing, no security work. |

Verification commands referenced by every pass (this repo):

```bash
# Build = typecheck + bundle (tsc -b is the compile/type gate; no separate typecheck script)
npm run build

# Lint
npm run lint

# Unit + component tests (Vitest, jsdom, real in-process SQLite — no DB mocks). Prints per-file coverage.
npm test
npm run test:coverage          # enforces the ≥80% gate on lib/screens/store

# Mutation score (Stryker, ≥80% on src/lib via inPlace + perTest). Slow — scope it (see Pass 4).
npm run test:mutation

# E2E (Playwright — needs the dev server or a build; the real Worker+OPFS path)
npm run test:e2e

# Browser smoke against a real OPFS DB (Puppeteer-style helper; --no-wipe keeps existing data)
npm run debug:browser
npm run debug:browser:nowipe

# Commit + push — Conventional Commits, NO Co-Authored-By trailer (project preference); trunk-based.
git commit -m "..." && git push origin main
# CI (.github/workflows/deploy.yml) builds + deploys to Cloudflare Pages on a push to main that
# touches src/public/config — it does NOT run the test suite, so tests are a LOCAL gate. A pass is
# done only when `npm run build && npm test` are green locally AND the deploy run is green:
gh run watch "$(gh run list -L1 --json databaseId -q '.[0].databaseId')" --exit-status
```

---

## 1. Structural Refactoring

```text
Act as a pragmatic, veteran TypeScript engineer working on training-log, a Solid.js + SQLite-Wasm offline-first PWA for 5/3/1 strength training. Perform a deep code review of src/lib/ (especially calc.ts, cycle.ts, tm-recommendations.ts, export-import.ts), src/store/ (workout-store.ts, settings-store.ts), and the query layer in src/db/sqlite-table.ts. Your dual mandate is to (1) hunt down and fix hidden bugs, logic errors, and edge-case failures, and (2) immediately implement structural changes that maximize maintainability, testability, and immediate obviousness.

Ruthlessly remove "clever" code, premature abstractions, and over-engineering. Do not change user-visible behavior, the persisted localStorage shape (without bumping STORAGE_VERSION), the DB schema, or any computed 5/3/1 weight/rep output.

Evaluate and modify against these criteria:
1. Correctness & Defensive Execution: Treat every line as a potential failure point. The highest-yield hunting ground is the 5/3/1 math and cycle state — a sign or boundary error here silently ships wrong training weights. Actively spot: roundToNearest5 / float-accumulation drift (plate math tracks `remaining` with a 0.01 tolerance — confirm it), the bar-weight floor (`Math.max(barWeight, ...)`), the week-4 deload special-cases (no AMRAP: `isAmrap = week !== 4 && i === 2`; BBS hidden; supplemental skips), the warmup dedup/break loop (drops sets ≥ working weight, collapses equal-rounded neighbors), the joker index-shift guard (shouldShowJokerButton hides once FSL has started so logged-set indices don't corrupt), Epley e1RM (`reps===1` short-circuit), and the cycle-advance TM-progression / doubling-candidate eligibility (CYCLE_START_TOLERANCE_MS distinguishes an auto-progression TM from a user bump — an off-by-one in ms or a `<` vs `<=` there mis-classifies bumps).
2. Verify before fixing: a suspected bug in framework API usage (Solid reactivity, @solidjs/router, @sqlite.org/sqlite-wasm) must be confirmed against the INSTALLED version first — read the source under node_modules, or reproduce empirically in a test. Do not add dead defensive code for behavior the library doesn't have.
3. YAGNI: Remove abstractions solving hypothetical future problems. Prefer simple, slightly repetitive code if it lowers cognitive load. (The query-builder collapse from five wrapper classes to two — WhereClause + Query<T> — is the house precedent: external API preserved, internals flattened.)
4. Locality of Behavior: Keep related logic together — a calc helper's inputs, math, and output shape in one readable flow; cache/transaction mutation next to its guard.
5. Explicit data flow: Remove hidden side effects and tight coupling. src/lib MUST stay pure (takes a TrainingDB or plain inputs, no DOM, no module-level I/O); the ONLY I/O boundary (SQLite Worker + OPFS) lives in src/db — keep it there. localStorage effects belong in the store's setup function, not at module init (the History/RestTimer side-effect-at-construction fixes are the precedent).
6. Structural flattening: Replace deep nesting and complex conditionals with early returns and linear paths.
7. Output discipline: Do not regress the layering — lib stays framework-free and unit-testable without a DOM; screens stay thin over lib + store.
8. Test before restructuring: check coverage for the path you're about to refactor (`npm run test:coverage` prints per-file missing lines/branches). If the suite doesn't reach it, first add ≤ 3 targeted tests for its current behavior so the refactor lands verified, not hopeful.

SCOPE GUARDS:
- The 5/3/1 prescription constants (MAIN_PERCENTAGES, MAIN_REPS, BBB_PCT, BBS_PERCENTAGES, warmup 40/50/60, threshold constants SESSION_TM_BUMP_THRESHOLD/CYCLE_DOUBLE_THRESHOLD) are program canon with test fixtures — changing a number is a BEHAVIOR change, out of scope. Restructure around them, never re-weigh them.
- Schema changes are out of scope for a refactor pass (see .claude/COMMON_MISTAKES.md #1 — they must touch SCHEMA + ADDITIVE_MIGRATIONS + ALL_TABLES + domain.ts + the SQLiteTable serialization together). If a fix seems to need one, stop and note it instead.
- Import is intentionally destructive (clear-then-bulkAdd in a transaction, COMMON_MISTAKES #2) — do not add partial-merge logic.

Honor the existing invariants: lib is pure and DOM-free; the persisted workout-store shape is version-gated by STORAGE_VERSION; lift IDs are positional (look up by name, never hardcode — COMMON_MISTAKES #3); the test client and prod worker share schema.ts and sqlite-table.ts verbatim.

EXECUTION WORKFLOW (run in order; do not stop until green):
1. Build/typecheck: `npm run build`.
2. Lint: `npm run lint`.
3. Test: `npm test`. If anything fails, or a bug fix broke an existing assumption, fix your implementation until it passes. For a math/cycle bug fix, pin the corrected behavior with a regression test in the matching src/lib/*.test.ts before moving on. If you touched a path the unit suite can't reach (real Worker/OPFS), spot-check with `npm run test:e2e` or `npm run debug:browser`.
4. Commit with a concise message explaining WHY the bug was fixed or the structural change was made (not what). No Co-Authored-By trailer.
5. Push `git push origin main`, then confirm the deploy run is green (`gh run watch ... --exit-status`). Remember CI does not run the tests — your local `npm test` is the regression gate.
```

---

## 2. Security Mitigation

```text
Act as a pragmatic, veteran security architect reviewing training-log: a static, client-authoritative offline-first PWA (Solid.js + SQLite-Wasm in OPFS) deployed to Cloudflare Pages. There is NO server, NO auth, NO backend — all data lives in the user's browser (OPFS-persisted SQLite + localStorage). The threat model is therefore: XSS = full read/write of the user's training DB, and supply chain (a tampered dependency or lockfile) is the realistic active threat. Implement concrete, local mitigations strictly for THIS model — no server-side auth, no session tokens, no rate limiting apply.

Several mitigations already shipped (see ROADMAP.md § Security) — verify they are intact and tighten their edges rather than re-inventing them:
1. Content-Security-Policy: a CSP must exist in BOTH index.html (<meta http-equiv>) and public/_headers (Cloudflare), and stay mirrored in the vite.config preview headers. It must keep `script-src 'self' 'wasm-unsafe-eval'` (SQLite Wasm needs it), `style-src 'self' 'unsafe-inline'` (Tailwind minimum), `worker-src 'self' blob:` (the PWA service worker + sqlite worker), plus `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`. Do not loosen these; flag any drift between the three copies.
2. SQL identifier hygiene: confirm `assertIdent` (`^[A-Za-z_][A-Za-z0-9_]*$`) still guards the SQLiteTable constructor, where()/orderBy(), and the column-key lists in add/put/update — so no caller (especially a bulkAdd fed from imported JSON) can interpolate an attacker-controlled identifier into the SQL string.
3. Untrusted import payload: importFromRawData is intentionally destructive (clear-then-bulkAdd in a transaction). Confirm the file-size cap (MAX_IMPORT_BYTES, ~50 MB) rejects BEFORE file.text() runs, non-object top-level JSON is rejected with a friendly error, and the per-table column allowlist (the pickCols / known-column pattern) drops unknown keys instead of letting them reach the INSERT column list. A malicious or malformed backup must fail safe, never throw a raw SQL error or graft extra columns.
4. Persisted-state tampering: workout-store loadFromStorage must reject a non-object persisted blob and copy only the explicit PERSISTED_KEYS allowlist into the reactive store (defense against a corrupted/tampered localStorage entry grafting fields after a future migration/XSS bug). STORAGE_VERSION mismatch must drop state, not throw.
5. URL/slug injection into SQL params: route slugs that become SQL parameters (e.g. HistoryEdit's :sessionId) must be coerced through `Number.isInteger(n) && n > 0` and redirect on failure, never bind NaN.
6. Supply chain / deploy: the deploy workflow must stay least-privilege (`permissions: contents: read`, `persist-credentials: false`) and keep `npm audit signatures` so a tampered lockfile is caught before deploy. PWA caching must keep `cleanupOutdatedCaches: true` and the user-controlled `registerType: 'prompt'` (skipWaiting/clientsClaim false) so a stale/tampered precache is evicted and updates aren't force-activated.

Do not add authentication, encryption-at-rest, or a heavy security framework — that contradicts the no-server, single-user, offline model and would be theater. Do not weaken offline-first behavior or the destructive-import contract.

EXECUTION WORKFLOW (run in order; do not stop until green):
1. Build/typecheck: `npm run build`.
2. Lint: `npm run lint`.
3. Test: `npm test`, and add tests for any new/tightened guard (oversized import, non-object payload, unknown-column strip, bad slug redirect, non-object persisted state, identifier rejection). The existing precedents live in src/db/sqlite-table.test.ts (identifier guard), src/lib/export-import.test.ts (import guards), src/store/workout-store.test.ts (hydration allowlist). Do not compromise core functionality for security theater.
4. Commit: the message must state the EXACT vulnerability mitigated and the method used. No Co-Authored-By trailer.
5. Push `git push origin main`, then confirm the deploy run is green (`gh run watch ... --exit-status`). CI does not run tests — your local `npm test` is the gate.
```

---

## 3. High-Signal Testing

```text
Act as a pragmatic, veteran TypeScript engineer extending the training-log test suite (Vitest + @solidjs/testing-library + in-process @sqlite.org/sqlite-wasm). Write tests optimized for high confidence, safe refactoring, and zero maintenance burden. No vanity/coverage-chasing tests; do not test Solid.js, @solidjs/router, or the SQLite engine themselves — pin OUR usage of them, not their behavior.

Route each test to the layer that owns it:
- src/lib/*.test.ts — the pure layer (the highest-value target). calc.ts (5/3/1 math), cycle.ts, tm-recommendations.ts, training-max.ts, exercise.ts, cleanup.ts (buildCleanupPlan), export-import.ts, pr.ts, format.ts. These need NO DOM and NO mocks — call the function and assert on the returned data.
- src/screens/*.test.tsx — screen components exercised end-to-end from DOM event → Solid store → real SQLite → rendered output, no DB layer mocked (Today, Workout, History, HistoryEdit, Setup, Settings).
- src/store/*.test.ts — the reactive stores: workout-store persistence/version-gating/hydration allowlist, settings-store theme apply, toast-store.
- src/db/*.test.ts — the query layer: SQLiteTable where/orderBy/add/put/update/delete/count, assertIdent guard, reentrant transactions, date/bool/json round-trips.

Enforce these principles:
1. Test behavior, not implementation: call the public functions/components as a consumer would and assert on OUTPUTS — computed set arrays (weight/reps/isAmrap), cycle-advance deltas, recommendation flags, rendered text, persisted DB rows. Don't assert on internal call sequencing.
2. Real instances over mocks: build real inputs and feed them through lib; build real DB state through the in-process test client. The DB engine in tests IS the production engine (only the Worker/OPFS transport differs) — there is nothing to mock. Reset state between tests with `__resetForTest()` from the test client (autouse fixture).
3. High-signal targeting: the 5/3/1 boundaries are where regressions actually live — warmup dedup/floor/break, the week-4 deload (no-AMRAP, hidden BBS/supplemental), roundToNearest5 edges, plate-math `remaining` float tolerance + the "can't make weight → null" return, joker increment thresholds and the shouldShowJokerButton index-shift guard, Epley `reps===1` short-circuit, AMRAP target back-calc, cycle-advance TM progression + the CYCLE_START_TOLERANCE_MS auto-vs-bump discriminator, doubling-candidate eligibility (all-3-weeks ≥10% AND no mid-cycle bump), PR detection (rep-PR at exact weight, e1RM-PR, first-ever baseline, exclude-self). Pick targets from evidence: `npm run test:coverage` prints per-file missing lines/branches — chase uncovered BRANCHES that encode a decision (a guard, a threshold gate, a fallback), not trivial passthroughs.
4. Clean state hygiene: guarantee isolation — `__resetForTest()` between tests; reset module-level store state; for localStorage-backed store tests, clear and set the key explicitly and exercise the STORAGE_VERSION mismatch path.
5. Defensive boundaries: malformed/oversized import payloads, non-object persisted state, bad route slugs, empty cycle/session sets, zero-prior-AMRAP PR baseline, schema additive-migration applied to an already-seeded DB. Assert the app degrades into a friendly/safe state, never a crash or a silent wrong-weight.
6. Assert meaning, not prose: pin computed numbers, counts, boolean flags, and DB row shapes — not exact toast strings or incidental formatting that's allowed to be reworded.
7. Mutation as the quality bar: for src/lib changes, the real target is the Stryker mutation score (≥80%, `npm run test:mutation`) — a test that doesn't kill a mutant of the line it "covers" is vanity. Prefer assertions specific enough to catch a flipped comparator or an off-by-one (see Pass 4 for the dedicated loop).

Match the existing files' style (Vitest, describe/it, parametrized cases for the four 5/3/1 weeks, the autouse reset fixture, shared synthetic fixtures — reuse them instead of inventing new ones; never seed tests from real user exports).

EXECUTION WORKFLOW (run in order; do not stop until green):
1. Build/typecheck: `npm run build`.
2. Lint: `npm run lint`.
3. Test: `npm test`. If new tests fail or break existing ones, debug and fix the TEST — unless you uncovered a real bug in src/lib / src/db / a screen, in which case fix the source and note it in the commit. Confirm the coverage gate still holds with `npm run test:coverage`.
4. Commit with a concise message describing the BEHAVIOR now covered. No Co-Authored-By trailer.
5. Push `git push origin main`, then confirm the deploy run is green (`gh run watch ... --exit-status`). CI does not run tests — your local `npm test` is the gate.
```

---

## 4. Mutation-Hardening Loop

This pass is designed to be run repeatedly. Each run points Stryker at one `src/lib` module, hunts the tests that
pass but don't actually constrain behavior (surviving mutants), and ships assertions that kill them — ratcheting
the suite toward tests that would catch a real regression. Over time this drives the pure layer toward genuinely
high-signal coverage instead of line-count coverage.

```text
Act as a pragmatic TypeScript engineer hardening the training-log test suite against mutation. Run Stryker against ONE module under src/lib, analyze the surviving mutants, and add or sharpen tests until they die — then ship. The goal is iterative: each run picks a different module and closes the previous run's weakest spot.

Set <module> to the src/lib file under test (e.g. calc.ts, cycle.ts, tm-recommendations.ts, pr.ts, cleanup.ts, export-import.ts). The Stryker config (stryker.config.mjs) mutates all of src/lib with inPlace + perTest analysis and an HTML report; the project gate is ≥80% mutation score on src/lib.

CONTEXT
- src/lib is pure (no DOM, no I/O) — every line is unit-testable with plain inputs, which is exactly what makes mutation testing tractable here.
- A surviving mutant means: Stryker changed the code (flipped `>=` to `>`, swapped `+` for `-`, returned an empty array, negated a boolean, replaced a constant with 0/1) and the existing tests STILL PASSED. That line is "covered" but not constrained — a real regression on it would ship silently.
- The richest mutant nests are exactly the 5/3/1 boundaries from Pass 3: comparators in warmup break/dedup, the week-4 `isAmrap`/BBS gates, plate-math thresholds, joker rep-minimum gates, CYCLE_START_TOLERANCE_MS comparisons, doubling-eligibility AND-chains, PR strict-greater-than checks.

PHASE 1 — RUN AND TRIAGE
1. Scope the run to keep it fast: temporarily narrow `mutate` in stryker.config.mjs to `['src/lib/<module>', '!src/lib/**/*.test.ts']`, or run `npm run test:mutation` and read only the <module> section of the HTML report. (Revert the config narrowing before committing — it is not a shipped change.)
2. List the surviving + no-coverage mutants for <module>. For each, record: the line, the mutation applied, and WHY the current tests don't catch it (assertion too loose? branch never exercised? only the happy path tested?).
3. Ignore mutants that are genuinely equivalent (the mutation produces identical behavior) — note them, don't chase them.

PHASE 2 — KILL THE SURVIVORS
For each real survivor, add or tighten a test in src/lib/<module-without-ext>.test.ts:
- Prefer an assertion specific enough to fail under the exact mutation (e.g. assert the precise rounded weight, not just "> 0"; assert the boundary case at the threshold AND one step either side; assert the empty-input return is [] not undefined).
- Reuse the existing parametrized fixtures and the four-week pattern; don't invent new synthetic data when an existing fixture exposes the line.
- Do NOT change src/lib source to make a mutant die — unless the mutant revealed a genuine bug (the "mutation" is actually a correct behavior the code should have had), in which case fix the source and note it in the commit.

PHASE 3 — VERIFY AND SHIP
Run in order; do not proceed past a failure:
1. Revert any temporary stryker.config.mjs narrowing.
2. Build/typecheck: `npm run build`.
3. Lint: `npm run lint`.
4. Test: `npm test` (fast gate), then `npm run test:mutation` and confirm the <module> survivors you targeted are now killed and the overall src/lib score did not regress below 80%.
5. Commit with a message naming the module hardened and the class of mutant killed (e.g. "test: kill warmup break/dedup comparator survivors in calc"). If you fixed a real source bug, lead with that. No Co-Authored-By trailer.
6. Push `git push origin main`, then confirm the deploy run is green (`gh run watch ... --exit-status`). CI does not run tests — your local `npm test` + mutation run is the gate.

GUARDRAILS
- Never commit a narrowed stryker.config.mjs — the full src/lib mutate glob is the shipped config.
- A test that only raises the line-coverage number without killing a mutant is exactly the vanity test this loop exists to replace — don't add it.
- If killing a mutant requires asserting an exact float, round in the assertion the same way the code does (roundToNearest5 / the 0.01 plate tolerance) — don't pin raw floating-point noise.
- One module per run keeps the mutation run fast and the diff reviewable; resist scope creep into a second module.
```

---

## 5. Bug Hunting

Where Pass 1 hunts bugs as a side effect of restructuring, this pass makes defect discovery the *only* job. Nothing
gets refactored, no coverage target gets chased, no threat gets hardened. The agent reads the source, reasons about
what can go wrong at each boundary, confirms a defect is real before touching it, applies the minimal fix, and pins it
with a regression test that fails on the pre-fix code. The discipline is the point: a suspected bug that turns out to be
intentional design (destructive import, positional lift IDs, the week-4 hidden sets) gets noted and left alone, not
"fixed" into a behavior change.

```text
Act as a pragmatic, veteran TypeScript engineer doing a defect hunt on training-log, a Solid.js + SQLite-Wasm offline-first PWA for 5/3/1 strength training. Your ONLY mandate is to find and fix real bugs — logic errors, edge-case failures, silent wrong outputs, and crashes. You are NOT refactoring, NOT adding coverage for its own sake, and NOT doing security hardening. Read the source, reason about what can go wrong, confirm the defect, fix it minimally, pin it with a regression test — in that order.

A "real bug" is code that, on a plausible input, produces a wrong training weight/rep, mis-classifies cycle state, misses or invents a PR, corrupts persisted/imported data, or throws where it should degrade. A line that merely looks risky but is provably correct on every reachable input is NOT a bug — do not add defensive code for it.

HUNT IN LAYERS, highest-value first. For each suspected defect, name the input that triggers it before you decide it is real.

PHASE A — 5/3/1 math boundaries (src/lib/calc.ts; pin in src/lib/calc.test.ts):
- roundToNearest5: behavior on inputs below bar weight and on any negative/zero input — does the result ever drop below the bar-weight floor (Math.max(barWeight, ...)) or round the wrong direction?
- calcPlatesPerSide: the null-return path when the target is NOT achievable with available plates. The loop tracks `remaining` against a `Math.abs(remaining) < 0.01` tolerance — probe a target whose half-difference lands just inside/outside 0.01 (float accumulation across several plate subtractions), and a target below the empty-bar weight.
- calcWarmup dedup/break: the dedup collapses a set when `weight === sets[sets.length - 1].weight` (rounded), and breaks when `weight >= workingWeight`. Construct a TM where two consecutive warmup percentages round to the SAME weight from DIFFERENT raw values (should collapse to one) AND a TM low enough that a warmup rounds up to ≥ workingWeight (should break, not emit a warmup at/above the work set).
- Week-4 deload gates, per supplement variant: shouldShowJokerButton returns false when `week === 4`; BBS is hidden in week 4 via `BBS_PERCENTAGES[4] === null` → calcBbsSets returns []. Confirm FSL/BBB/BBS each produce the correct week-4 set list (no AMRAP, no joker, BBS empty) and that NO variant leaks an AMRAP or supplemental set into the deload.
- estimated1RM (Epley): the `reps === 1 ? weight : weight * (1 + reps/30)` short-circuit. Check reps === 0 (should it ever be called with 0?) and large reps (20+) — does any downstream consumer assume a bounded e1RM?
- AMRAP target back-calc (calcAmrapTargets / targetReps): when the target e1RM is LOWER than the working weight, the back-calculated reps would be ≤ 0 — confirm the output is clamped/sane, not a negative or zero rep target presented to the user.

PHASE B — cycle state machine (src/lib/cycle.ts, src/lib/tm-recommendations.ts; pin in cycle.test.ts / tm-recommendations.test.ts):
- CYCLE_START_TOLERANCE_MS (= 60_000 in tm-recommendations.ts) discriminates an auto-progression TM from a user mid-cycle bump. Probe EXACTLY the boundary: a timestamp delta of exactly 60_000 ms — does `<` vs `<=` mis-classify it? A bump at the boundary must not be double-credited as both an auto-progression and a manual bump.
- getCycleDoublingCandidates AND-chain: the all-three-weeks eligibility when one week's AMRAP is MISSING vs. present-but-0 reps — these are different inputs and must not collapse to the same branch. Confirm a missing week blocks doubling and a logged 0-rep AMRAP is treated as a real (failing) result, not absent.
- TM progression when the user manually bumped the TM mid-cycle and THEN completed the cycle: the auto-vs-bump discriminator must not double-credit (one increment, not two).
- getNextSessionAdvancingIfDone on an EMPTY session list, and getCycleDoublingCandidates when all three AMRAP results are below CYCLE_DOUBLE_THRESHOLD — assert a safe, defined return, not undefined/throw.

PHASE C — PR detection (src/lib/pr.ts; pin in pr.test.ts):
- detectAmrapPRs at the boundaries: a rep-PR at EXACTLY the previous best weight (strict `>` vs `>=` on weight and on reps); an e1RM that EQUALS the previous record exactly (is that a PR or not — confirm the comparator matches intent); the first-ever baseline with no prior records (must return a PR, not a false "no PR"); the exclude-self path when the session under test IS the current record-holder (must not compare a record against itself and report "no PR").

PHASE D — query layer (src/db/sqlite-table.ts and the transaction guard in src/db/sqlite-client.ts; pin in sqlite-table.test.ts):
- Reentrant transaction: the `txDepth` guard in the client's transaction() method — call a transaction from WITHIN an already-open transaction and confirm it nests/joins correctly rather than opening a second real transaction or deadlocking.
- where() with an empty condition object; orderBy() with a column name that is not a real row column — does assertIdent reject it, or does a valid-but-nonexistent identifier produce a silent bad query / empty result?
- bulkAdd([]) with an empty array (no-op, no malformed SQL); date/bool/json column round-trips for NULL values (write null, read back null — not "null" string, not 0, not undefined).

PHASE E — store hydration (src/store/workout-store.ts; pin in workout-store.test.ts):
- loadFromStorage on a STORAGE_VERSION mismatch must DROP state, not throw. Probe a partially-written blob: valid JSON object but missing required keys, or an incomplete nested object.
- The PERSISTED_KEYS allowlist when localStorage holds a key that matches an allowlisted name but with a TYPE mismatch (a string where the store expects an object/array) — confirm the bad value can't graft a wrong-typed field into the reactive store.

PHASE F — import/export (src/lib/export-import.ts; pin in export-import.test.ts):
- importFromRawData on valid JSON of the WRONG shape: a top-level array instead of an object; string values where numbers are expected; negative IDs; duplicate IDs within one table. Each must fail safe (friendly rejection or dropped via the pickCols/COLS allowlist) — never a raw SQL error and never extra grafted columns.
- export → re-import round-trip on a DB with ZERO sessions (empty but valid backup must restore cleanly, not throw on an empty table).

CONFIRMATION DISCIPLINE — verify a suspected bug is real BEFORE fixing:
- Math errors: compute expected vs. actual by hand (or with a throwaway in-file scratch assertion) and state the concrete numbers explicitly in the commit message — "estimated1RM(weight 100, reps 1) must return 100 via the reps===1 short-circuit but returned 103.33" beats "fixed e1RM bug".
- Framework behavior (Solid reactivity, @solidjs/router, @sqlite.org/sqlite-wasm, the SQLite SQL semantics): confirm against the INSTALLED source under node_modules or reproduce empirically in a test. No speculative defensive code for behavior the library/engine doesn't actually have.

FIX DISCIPLINE — minimal change that corrects the defect:
- No opportunistic refactoring at or around the fix site. If the fix needs you to understand a neighboring abstraction, understand it — do not rewrite it.
- Every confirmed fix gets a regression test in the matching src/lib|db|store *.test.ts BEFORE you move to the next suspect. The test MUST fail on the pre-fix code and pass after — verify both directions (stash the fix, watch it fail, restore).

TRIAGE — recognize intentional design and leave it alone:
- The destructive import (clear-then-bulkAdd in a transaction, COMMON_MISTAKES #2), the positional lift-ID system (look up by name, COMMON_MISTAKES #3), and the week-4 deload hidden sets are DELIBERATE. If a suspected bug turns out to be one of these (or any documented invariant), note it in your working log as "confirmed intentional — not a bug" and move on without changing it.

SCOPE GUARDS (a fix that needs any of these is out of scope — stop and note it instead):
- No schema changes (SCHEMA + ADDITIVE_MIGRATIONS + ALL_TABLES + domain.ts + serialization move together — COMMON_MISTAKES #1).
- No changes to 5/3/1 program constants (MAIN_PERCENTAGES, MAIN_REPS, BBB_PCT, BBS_PERCENTAGES, warmup 40/50/60, SESSION_TM_BUMP_THRESHOLD/CYCLE_DOUBLE_THRESHOLD) — re-weighing a constant is a behavior change, not a bug fix.
- No change to the destructive-import contract, the persisted-store shape (without bumping STORAGE_VERSION), or src/lib purity (no DOM, no module-level I/O).

EXECUTION WORKFLOW (run in order; do not stop until green):
1. Hunt: walk PHASE A→F. Keep a short running log of each suspect: the triggering input, confirmed-bug vs. confirmed-intentional vs. out-of-scope.
2. For each CONFIRMED bug: write the failing regression test first, then apply the minimal fix, then confirm the test passes and no existing test regressed.
3. Build/typecheck: `npm run build`.
4. Lint: `npm run lint`.
5. Test: `npm test`. If a fix broke an existing assertion, decide whether the old assertion pinned the BUG (update it, and say so) or whether your fix is wrong (revert). For a path the unit suite can't reach (real Worker/OPFS), spot-check with `npm run test:e2e` or `npm run debug:browser`.
6. Commit each fix (or a tight cluster of related fixes) with a message stating the concrete defect and the input that triggered it — WHY it was wrong, with the expected-vs-actual values. No Co-Authored-By trailer.
7. Push `git push origin main`, then confirm the deploy run is green (`gh run watch ... --exit-status`). CI does not run tests — your local `npm test` is the regression gate.
```
