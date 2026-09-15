# Deep code review — fix ledger

**State of every finding opened by `docs/deep-code-review.md`.** That document is the
evidence record and is **frozen**: it explains why each finding exists, and its
central claim is that no application or test file was changed during the review.
Writing fix state into it would corrupt that claim. This document is the state.

## Totals

| | Count |
|---|---|
| Findings | **98** (F01–F98; F95–F98 opened during fix work) |
| `open` | **87** |
| `wip` | 0 |
| `fixed` | **11** — F02, F04, F05, F06, F65, F66, F73, F79, F95, F96, F97 |
| `fixed-by` | 0 |
| `wontfix` | 0 |
| `blocked` | 0 |

**By severity: 14 High / 51 Medium / 33 Low.**

> **Count correction.** `deep-code-review.md:34` says "12 high". Counted directly
> from its own findings table, **13** rows carry High: F01, F02, F04, F05, F07,
> F08, F13, F14, F15, F18, F22, F33, F65. No amendment anywhere in that document
> lowers any of them. The summary line is a miscount — the same class of error it
> already corrected once for the 134-vs-179 ledger-row total. Severities here are
> parsed from the findings table, not from the summary.

## States

| State | Means |
|---|---|
| `open` | Untouched. |
| `wip` | Being worked now. Not a claim of anything. |
| `fixed` | Code changed **and** a named regression test exists **and** a commit SHA is recorded. All three, or the state is not `fixed`. |
| `fixed-by` | Closed by another finding's fix. Evidence column names the owning ID. |
| `wontfix` | Deliberate. The decision and its reason are written in Notes. |
| `blocked` | The exact missing dependency is named in Notes. |

## Rules

1. **`fixed` requires a test that fails against the old code.** Same evidence bar
   the review held itself to. No such test → the state stays `wip`. **(b)** A
   config, workflow or tooling change that cannot carry a test records the
   verification command that was actually run in its place, and says so. This is
   a narrow exception for things with no runtime to assert against — never a
   way around (a) for application code.
2. **One fix row per cluster owner.** Where several findings share one root cause,
   the owner carries the fix and the rest become `fixed-by` pointing at it.
   Otherwise the rows drift apart. C1 and the F65/F66 pair have designated owners;
   the other clusters are patterns, not single-site fixes.
3. **A row is updated in the same commit as the code change it describes.** Ledger
   and code land together or neither lands.
4. **Severity is never edited here.** If a severity is wrong, amend
   `deep-code-review.md` and note the amendment in this row.
5. **Mobile claims follow the project rule** — an iOS/bfcache fix is not `fixed`
   on this machine's evidence alone. F67 is the live case.

## Clusters

Seven root-cause patterns from `deep-code-review.md:38-53`. A finding can sit in two.

| ID | Pattern | Members | Owner |
|---|---|---|---|
| C1 | No single-flight guard on an async `onClick` | F33, F34, F41, F51, F55 | **F33** — the guard belongs in `Modal` as `busy?: boolean` (settled in B08a; a per-call-site guard cannot close the Escape path) |
| C2 | Single-slot or snapshotted state standing in for per-item state | F51, F52, F54, F55, F57, F63 | None — per-file fixes |
| C3 | State seeded once and never re-synced, or re-synced over the user | F49, F54, F56, F63 | None — `DurationInput.tsx:18-23` is the counter-example done right |
| C4 | Cleanup or a default bound to something that can stop existing | F57, F58, F62 | None — per-file fixes |
| C5 | Uneven keyboard and screen-reader access | F59, F60, F61, F64 | None — in each case a neighbouring file does it correctly |
| C6 | Unvalidated external data written to durable storage or trusted as control flow | F03, F08, F65, F66, F67 | **F65** for the service-worker half (F65/F66 are the same `response.ok` gate) |
| C7 | A change made and its description not updated | F76, F84, F89, F90, F91, F92, F93 | None — independent doc edits |

## Suggested order

From `deep-code-review.md:55-69`, unchanged:

1. **F65** (High) — one 503 while online permanently poisons the offline shell.
   Fix with **F79**; **F78** is the precondition. Takes F66 with it.
2. **F85 + F74** — E2E fails 6 of 32 and nothing runs it. Assertions *and* CI
   wiring, or it returns to the state that produced the finding.
3. **F69** — the coverage gate measures a third of the codebase; 22 of the 23
   findings from B08 and B09 live where it cannot see.
4. **F73** — `pnpm dlx wrangler` runs unpinned with a production token.
5. **F94** — one missing index on the table the mid-set PR check scans.

## Ledger

Evidence column format: `<sha>` · `#<pr>` · `<test name>`. All three for `fixed`.

| ID | Sev | Area | Cluster | Primary file | State | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| F01 | **High** | B03 | — | `src/screens/HistoryEdit.tsx` | `open` | — | — |
| F02 | **High** | B01 | — | `src/db/sqlite.worker.ts` | `fixed` | `<pending>` · `startup.test.ts` F02 case + browser probe | The worker already reported `persistent: false` correctly; nothing read it. Startup now treats it as an outcome the caller must handle and shows a blocking **STORAGE UNAVAILABLE** screen with RELOAD / CONTINUE WITHOUT SAVING — the explicit temporary-mode acknowledgement the finding asked for. Verified in a real browser by patching the built worker to report non-persistent. |
| F03 | Medium | B04 | C6 | `src/lib/export-import.ts` | `open` | — | Settings allowlist drops `hasDeloadWeek: false`; pairs with F08. |
| F04 | **High** | B01 | — | `src/db/sqlite-client.ts` | `fixed` | `<pending>` · `rpc.test.ts` ×5, `startup.test.ts` ×6 | Worker `onerror`/`onmessageerror` now reject readiness and every pending call; `init` has a 30s deadline; a dead worker rejects later calls instead of queueing against it. `main.tsx` has a catch and renders a **COULDN'T START** screen with RETRY. Verified in a real browser by 404ing the worker script: the page reaches the error screen instead of sitting on LOADING. |
| F05 | **High** | B01 | — | `src/db/sqlite-client.ts` | `fixed` | `f3e2a6d` · `transaction.test.ts` ×3 | **Root cause was the inference, not the arithmetic.** A depth counter cannot tell a nested call from an unrelated concurrent one once the outer body has awaited. Fixed by removing the question: `transaction()` now serializes, and `bulkAdd` no longer opens one of its own, so nothing nests. `txDepth` deleted. |
| F06 | Medium | B01 | — | `src/db/sqlite-client.ts` | `fixed` | `f3e2a6d` · `transaction.test.ts` ×2 | Deleted with the counter it corrupted — there is no depth to get stuck above zero. BEGIN now runs inside the queued turn, and the queue is handed on in a `finally` even when a caller never got a turn. |
| F07 | **High** | B02 | — | `src/db/seed.ts` | `open` | — | — |
| F08 | **High** | B04 | C6 | `src/lib/export-import.ts` | `open` | — | Envelope validation; precondition for F03/F28/F31/F41 import-restore paths. |
| F09 | Medium | B04 | — | `src/lib/export-import.ts` | `open` | — | — |
| F10 | Medium | B03 | — | `src/screens/HistoryEdit.tsx` | `open` | — | — |
| F11 | Medium | B04 | — | `src/store/settings-store.ts` | `open` | — | — |
| F12 | Medium | B05 | — | `src/store/workout-store.ts` | `open` | — | — |
| F13 | **High** | B05 | — | `src/screens/Today.tsx` | `open` | — | — |
| F14 | **High** | B05 | — | `src/screens/Workout.tsx` | `open` | — | — |
| F15 | **High** | B05 | — | `src/screens/Workout.tsx` | `open` | — | — |
| F16 | Medium | B06 | — | `src/screens/Today.tsx` | `open` | — | — |
| F17 | Medium | B06 | — | `src/screens/Today.tsx` | `open` | — | — |
| F18 | **High** | B06 | — | `src/screens/Today.tsx` | `open` | — | — |
| F19 | Medium | B06 | — | `src/screens/History.tsx` | `open` | — | — |
| F20 | Medium | B06 | — | `src/screens/History.tsx` | `open` | — | — |
| F21 | Medium | B06 | — | `src/screens/History.tsx` | `open` | — | — |
| F22 | **High** | B06 | — | `src/components/stats/RecordsPanel.tsx` | `open` | — | Ownership rule for "what counts as a record" — settle before F38/F43/F63. |
| F23 | Medium | B06 | — | `src/components/stats/RecordsPanel.tsx` | `open` | — | — |
| F24 | Medium | B07 | — | `src/lib/calc.ts` | `open` | — | Notification-layer tail confirmed in B09b (P26). |
| F25 | Medium | B07 | — | `src/lib/calc.ts` | `open` | — | — |
| F26 | Low | B07 | — | `src/lib/calc.ts` | `open` | — | — |
| F27 | Low | B07 | — | `src/lib/calc.ts` | `open` | — | — |
| F28 | Low | B07 | — | `src/lib/calc.ts` | `open` | — | — |
| F29 | Low <br><sub>test quality</sub> | B07 | — | `src/lib/calc.ts` | `open` | — | — |
| F30 | Medium | B07 | — | `src/lib/calc.ts` | `open` | — | — |
| F31 | Low | B07 | — | `src/lib/workout-compose.ts` | `open` | — | — |
| F32 | Low | B07 | — | `src/lib/workout-compose.ts` | `open` | — | — |
| F33 | **High** | B07 | C1 | `src/screens/Workout.tsx` | `open` | — | **C1 owner.** Guard location settled in B08a: `Modal` `busy?: boolean` prop suppressing Escape + `← BACK`. |
| F34 | Medium | B07 | C1 | `src/lib/cycle.ts` | `open` | — | — |
| F35 | Medium | B07 | — | `src/lib/cycle.ts` | `open` | — | — |
| F36 | Low | B07 | — | `src/lib/training-max.ts` | `open` | — | Decided in B12d: highest `id` wins at equal `setAt`. Fix is mechanical. |
| F37 | Medium | B07 | — | `src/lib/pr.ts` | `open` | — | — |
| F38 | Medium | B07 | — | `src/lib/pr.ts` | `open` | — | Folds into F22 shared-reader fix. |
| F39 | Medium | B07 | — | `src/lib/tm-recommendations.ts` | `open` | — | — |
| F40 | Low | B07 | — | `src/lib/tm-recommendations.ts` | `open` | — | — |
| F41 | Low | B07 | C1 | `src/lib/exercise.ts` | `open` | — | — |
| F42 | Low | B07 | — | `src/lib/exercise-history.ts` | `open` | — | Folds into F22/F38 shared-reader fix. |
| F43 | Medium | B07 | — | `src/lib/lift.ts` | `open` | — | Folds into F22/F38 shared-reader fix. |
| F44 | Low | B07 | — | `src/lib/lift.ts` | `open` | — | — |
| F45 | Low | B07 | — | `src/lib/cleanup.ts` | `open` | — | — |
| F46 | Low | B08 | — | `src/components/modals/ModalAsyncStates.tsx` | `open` | — | — |
| F47 | Low <br><sub>med w/F34</sub> | B08 | — | `src/components/modals/CycleCompleteModal.tsx` | `open` | — | Low alone, **Medium with F34**. Orthogonal to F34 — does not replace it. |
| F48 | Medium | B08 | — | `src/hooks/use-confirmation.ts` | `open` | — | — |
| F49 | Low | B08 | C3 | `src/components/modals/LiftSetupModal.tsx` | `open` | — | — |
| F50 | Medium | B08 | — | `src/components/modals/LiftSetupModal.tsx` | `open` | — | — |
| F51 | Medium | B08 | C1,C2 | `src/components/workout/SaveFailureBanner.tsx` | `open` | — | — |
| F52 | Medium | B08 | C2 | `src/screens/Workout.tsx` | `open` | — | B12: `.claude/COMMON_MISTAKES.md` #6 states this defect exactly and prescribes the fix. Known state — decide fix vs wontfix. |
| F53 | Low <br><sub>cosmetic</sub> | B08 | — | `src/components/workout/AmrapTargets.tsx` | `open` | — | — |
| F54 | Medium | B08 | C2,C3 | `src/components/workout/AccessoryPicker.tsx` | `open` | — | — |
| F55 | Medium | B08 | C1,C2 | `src/components/workout/AccessoryPicker.tsx` | `open` | — | — |
| F56 | Low | B08 | C3 | `src/components/workout/AccessoryLog.tsx` | `open` | — | — |
| F57 | Medium | B08 | C2,C4 | `src/components/workout/RestTimer.tsx` | `open` | — | — |
| F58 | Medium | B08 | C4 | `src/components/forms/Stepper.tsx` | `open` | — | — |
| F59 | Low | B08 | C5 | `src/components/forms/DurationInput.tsx` | `open` | — | — |
| F60 | Medium <br><sub>WCAG 2.1.2, Level A</sub> | B08 | C5 | `src/components/forms/NotesField.tsx` | `open` | — | — |
| F61 | Medium <br><sub>WCAG 2.1.1, Level A</sub> | B08 | C5 | `src/components/forms/SetReadout.tsx` | `open` | — | — |
| F62 | Medium | B08 | C4 | `src/components/workout/AccessoryLog.tsx` | `open` | — | — |
| F63 | Medium | B08 | C2,C3 | `src/components/stats/RecordsPanel.tsx` | `open` | — | — |
| F64 | Low | B08 | C5 | `src/components/layout/Rule.tsx` | `open` | — | — |
| F65 | **High** | B09 | C6 | `src/service-worker.ts` | `fixed` | `9daa584` · leg F | **Amended — the stated impact never reproduced.** The missing `ok` check was real but masked by **F95**: the cache write never ran, so no 503 could poison anything. Repairing F95 alone would have activated this for real, so both landed in one change. Leg F asserts both halves. |
| F66 | Medium | B09 | C6 | `src/service-worker.ts` | `fixed` | `9daa584` · leg G | **The live half of the pair.** Reproduced exactly as written: a 502 enters the cache-first precache and is served from it thereafter. Cache-first, so it is never re-fetched. |
| F67 | Medium <br><sub>needs device</sub> | B09 | C6 | `src/lib/notifications.ts` | `open` | — | Platform impact **needs a real iOS device**. Per project rule, do not claim verified without one. |
| F68 | Low | B09 | — | `src/workers/timer.worker.ts` | `open` | — | — |
| F69 | Medium | B10 | — | `vite.config.ts` | `open` | — | B12: scope is documented at `.claude/QUICK_START.md:22`. Known state — decide fix vs wontfix. |
| F70 | Medium <br><sub>needs Lighthouse</sub> | B10 | — | `vite.config.ts` | `open` | — | Conditional severity; installability impact worth a Lighthouse check. |
| F71 | Medium | B10 | — | `tsconfig.json` | `open` | — | — |
| F72 | Low | B10 | — | `vite.config.ts` | `open` | — | — |
| F73 | Medium <br><sub>supply chain</sub> | B10 | — | `.github/workflows/deploy.yml` | `fixed` | `9daa584` · rule 1(b) | `wrangler` is now a lockfile-pinned devDependency (4.131.2) invoked via `pnpm exec`. `allowBuilds` for `esbuild`/`workerd` set to **false** — verified unnecessary, so this removes two lifecycle-script executions the old `--allow-build` flags permitted. |
| F74 | Medium | B10 | — | `.github/workflows/ci.yml` | `open` | — | Fix with F85 — assertions without CI wiring returns to the state that produced the finding. |
| F75 | Low | B10 | — | `.github/workflows/ci.yml` | `open` | — | — |
| F76 | Low <br><sub>docs</sub> | B10 | C7 | `CLAUDE.md` | `open` | — | — |
| F77 | Low | B10 | — | `eslint.config.js` | `open` | — | — |
| F78 | Medium | B10 | — | `playwright.config.ts` | `open` | — | Precondition for F79/F65. |
| F79 | Medium | B10 | — | `scripts/verify-notify-hardening.js` | `fixed` | `9daa584` · rule 1(b) | `verify:sw` script added; new `verify-sw` CI job on every PR. Two harness defects had to be fixed first — **F96** and **F97**. |
| F80 | Low | B10 | — | `scripts/debug-browser.js` | `open` | — | B12: documented at `.claude/QUICK_START.md:36-38`. Known state — decide fix vs wontfix. |
| F81 | Medium | B10 | — | `public/favicon.svg` | `open` | — | — |
| F82 | Low | B10 | — | `public/demo-seed.json` | `open` | — | Decided in B12d; documented as `.claude/COMMON_MISTAKES.md` #7. Known state — decide fix vs wontfix. |
| F83 | Low | B10 | — | `.gitignore` | `open` | — | — |
| F84 | Low | B10 | C7 | `scripts/migrate-history.py` | `open` | — | — |
| F85 | Medium | B11 | — | `tests/e2e/app.spec.ts` | `open` | — | 6 of 32 E2E tests fail. Fix with F74. |
| F86 | Low | B11 | — | `test-results/.last-run.json` | `open` | — | — |
| F87 | Medium | B11 | — | `src/test-setup.ts` | `open` | — | — |
| F88 | Low | B11 | — | `src/store/save-failure-store.ts` | `open` | — | — |
| F89 | Medium | B12 | C7 | `.claude/ARCHITECTURE_MAP.md` | `open` | — | — |
| F90 | Medium | B12 | C7 | `README.md` | `open` | — | — |
| F91 | Medium | B12 | C7 | `ROADMAP.md` | `open` | — | — |
| F92 | Low | B12 | C7 | `docs/INDEX.md` | `open` | — | — |
| F93 | Low | B12 | C7 | `docs/INDEX.md` | `open` | — | — |
| F94 | Medium | B12 | — | `src/db/schema.ts` | `open` | — | Missing index on the table the mid-set PR check scans. Resolves L07(2). |
| F95 | **High** | — | C6 | `src/service-worker.ts` | `fixed` | `9daa584` · leg F | **Opened during fix work, not by the review.** The navigation handler's shell refresh never executed: `response.clone()` ran inside the `caches.open(...).then()` callback, after `return response` handed the body to the navigation, so it threw "body is already used" and `void` swallowed it. The cached shell was frozen at whatever `install` precached; network-first refresh had never run once. Masked F65 and would have activated it if repaired alone. |
| F96 | Medium | — | — | `scripts/verify-notify-hardening.js` | `fixed` | `9daa584` · all 7 legs | **Opened during fix work.** The harness the review called "already exists, already passes" failed **all six legs**: `completeSetupWizard` drove a three-step wizard with `data-testid` selectors, and the wizard is now two steps with no testids in a production build. F79's own thesis, demonstrated — a dormant capability decays. |
| F97 | Medium | — | — | `scripts/verify-notify-hardening.js` | `fixed` | `9daa584` · exit 0 in 22s | **Opened during fix work.** The 200s watchdog `setTimeout` was never cleared or unref'd, so a fully passing run sat for 200s and then `process.exit(3)`. Wiring the harness into CI without this would have failed every build. |
| F98 | Low | — | — | `src/db/seed.ts` | `open` | — | **Opened during fix work.** `_seedDatabase` does `db.lifts.clear()` then `db.lifts.bulkAdd(LIFTS)` as two statements. bulkAdd's own transaction never covered the `clear`, so this pair has never been atomic: a failure between them leaves the roster empty. Pre-existing and unchanged by the F05 work — noted rather than folded in, since it is a different defect from the one being fixed. Wrap the pair in `db.transaction`. |

## Open leads

Leads L01–L05 and L07 resolved into findings; see `deep-code-review.md:245`.

| ID | State | Blocker |
|---|---|---|
| L06 | `blocked` | **Authorization.** Needs a failure-injection pass across Today's load/start/abandon paths — different work from reading code, never authorized. Source inspection only (B06a). |

---

**Created**: 2026-09-15 · seeded from `docs/deep-code-review.md` at the review's completion.
