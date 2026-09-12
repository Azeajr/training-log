# Deep code review tracker

## Resume here

**Single agent only. Do not spawn or delegate to sub-agents, including sequentially.**
Review one bounded batch per session, save progress here, and stop. The user wants
an exhaustive review spread across sessions because the previous parallel review
exhausted usage limits. This document is the handoff; do not reload entire session
transcripts on ordinary continuation.

**Next batch: B05b — finish the session/resume and Workout slice in one pass.** Review
`src/lib/session.ts`, `src/lib/session.test.ts`, `src/screens/Workout.tsx`, and
`src/screens/Workout.test.tsx`, concentrating on the stale completed-session → SKIP
path already reproduced below, completion/skip/exit ordering, save-failure retries,
and session reconciliation. Do not broaden into other screens or libraries until
these four files are closed. B04b and B05a are complete; use their evidence instead
of rereading unchanged settings/store files. This is deliberately the next batch so
the unfinished work is completed together rather than split again.

Latest run: **two sequential batches completed; 4 additional files marked deep**
(2 implementation files, 2 test files). **21 files deep in total.** 74 focused
tests passed in this continuation before B05b was interrupted, plus 5 isolated
checks. F01/F03 reconfirmed; new findings F07–F12 and the stale-session lead is now
F13. No application changes or sub-agents.

## Previous session summary — 2026-09-11

The original request was a project code review. An initial pass reported three
substantive findings (F01–F03 below), 1,094 passing existing tests, and passing lint
and type checking. Two temporary regression tests reproduced F01 and F03 and were
removed. The assistant reported an unchanged working tree after that initial pass.

The user then requested an exhaustive, effectively line-by-line review of every
relevant source file, including bugs, edge cases, invariants, reliability,
performance, concurrency/state, library/API usage, high-risk maintainability, and
test gaps. Suspicious behavior should be traced across files and reproduced where
practical. Application code must not be modified; report substantive findings with
severity, location, impact, and recommended fix.

The assistant split screens, libraries/stores, and components across three agents
while reviewing persistence/startup/tooling itself. Usage-limit errors interrupted
the work, including after a continuation. No final exhaustive report or auditable
file-by-file completion ledger was recovered. A progress message said component
coverage was complete, but the detailed agent reports are encrypted in the local
rollout files available here. That claim is preserved as **reported coverage**, not
silently promoted to verified file-level completion. Reading a file or running its
tests alone does not prove a deep review.

Further progress messages mentioned startup seeding, overlapping saves, accessory
editing, and a completed workout remaining editable after reload and being marked
skipped. These are leads until their evidence is recovered or reproduced. A local
service-worker probe recorded `OFFLINE after HTTP503: 503 SERVER ERROR`; a production
Vite build also exited successfully. Neither proves browser/offline integration
coverage. This tracker creation session did not rerun those checks or review code.

Source: local Codex session `01a090ca-aabc-78e1-9097-f8a7f3da7b90`, rollout under
`~/.codex/sessions/2026/09/11/`, with child sessions ending `f9ed`, `cafd`, and `f360`.
The readable initial report and later progress messages are the basis of this
summary; inaccessible report contents have not been reconstructed by guesswork.

## Findings carried forward

F01–F10 have evidence recorded in the completed batches below. L01 is resolved
into F07; L02–L04 still retain the previous session's leads. See each batch for
verification limits and historical versus fresh evidence. Review completion and bug resolution are separate states; no fix is
claimed here.

| ID | Severity / evidence | Location | Trigger and impact | Recommended next action |
|---|---|---|---|---|
| F01 | High; reconfirmed B03a component/SQLite probe | `src/screens/HistoryEdit.tsx:214` | Swap accessory B→C, then A→B, save: a later card deletes B's newly saved sets/notes. | Verify current behavior; delete all replaced originals before writing replacements; retain a regression description. |
| F02 | High; confirmed in B01a with isolated production-source probe | `src/db/sqlite.worker.ts:42`; startup callers | Persistent-storage failure falls back to an in-memory DB; startup ignores `persistent: false`, so apparently saved workouts disappear on reload. | Trace failure end-to-end; surface persistence failure and require recovery or explicit temporary-mode acknowledgement. |
| F03 | Medium; reconfirmed B04a real-SQLite probe | `src/lib/export-import.ts:105` | Settings allowlist drops `hasDeloadWeek: false`; imported null defaults to enabled and changes three-week cycles to four-week cycles. | Verify current allowlist; preserve the field and cover export/import round trip. |
| F04 | High; confirmed startup/error-path probe | `src/db/sqlite-client.ts:12–28`; `src/main.tsx:10–21` | Worker load/crash events cannot reject readiness and init has no deadline. Reported init/seed/settings rejections also have no startup catch. The app remains on LOADING with no recovery UI. | Handle worker errors, bound initialization, reject pending RPCs, and render a startup error/retry path. |
| F05 | High; confirmed at production client API with real SQLite | `src/db/sqlite-client.ts:51–54` | Independent overlapping transactions are treated as nested using a global depth counter. One resolves successfully, then its writes disappear when the other rolls back. | Serialize independent transactions and writes; scope nested calls to an explicit transaction context. Audit UI reachability in B03/B05. |
| F06 | Medium; confirmed with injected BEGIN failure | `src/db/sqlite-client.ts:56–58` | BEGIN rejects before the try/finally, leaving depth positive. Later transaction callbacks run without BEGIN/ROLLBACK, retaining partial writes after failure. | Restore depth on every BEGIN exit; invalidate/recover the connection when transaction state is uncertain. |
| F07 | High; B02a real-SQLite regression | `src/db/seed.ts:51–54` | Startup with fewer than four lifts deletes survivors and creates defaults with new IDs, orphaning surviving training maxes/session history and losing customization. A smaller roster is supported by onboarding. | Seed only truly uninitialized installs; preserve existing lift IDs and intentional roster choices; test restart after customizing/removing defaults. |
| F08 | High; B04a importJson regression | `src/lib/export-import.ts:114–130`, `163–178` | A valid JSON object with no recognized backup tables (e.g. unrelated document) passes validation and successfully clears all tables. Settings asks for overwrite confirmation, but the file is never established to be a backup. | Validate a recognized backup envelope/table set and supported versions before clearing; preserve legacy formats explicitly. |
| F09 | Medium; B04a CSV regression | `src/lib/export-import.ts:202`, `224–230` | Timed/distance accessory rows export without duration or distance columns, silently discarding their measured performance in CSV. | Include both measurements and units, and cover timed/distance rows in export tests. |
| F10 | Medium; B03a component regression | `src/screens/HistoryEdit.tsx:328–333`; `src/lib/calc.ts:35` | Stored `cross` sets are loaded but never rendered because the edit type list excludes them. Users cannot correct cross-lift weight/reps in history. | Render cross-lift sets with movement labels and editable controls; test persistence of cross-set edits. |
| F11 | Medium; B04b isolated restore check | `src/store/settings-store.ts:286–301`; import callers | Importing a backup with no settings row leaves the previous in-memory settings active until a reload, even though the database is empty. A restored theme is similarly stored in memory without immediate CSS application. | Reset settings state to defaults when no row exists and apply the resolved theme after import/restore. |
| F12 | Medium; B05a isolated persistence check | `src/store/workout-store.ts:116–132` | A localStorage quota/write failure escapes the reactive persistence effect. The render path has no catch or user-visible persistence status, so active-workout recovery can silently stop. | Catch persistence failures, surface degraded recovery state, and define retry/cleanup behavior. |
| F13 | High; B05b isolated Workout probe | `src/screens/Workout.tsx:620–626`; `src/lib/session.ts:11–20` | A stale in-memory pending session can point to a completed DB row; the Workout SKIP handler updates it to `skipped` without reconciling status. This can rewrite a completed workout after reload/resume. | Call `reconcileActiveSession` before SKIP/COMPLETE/EXIT, or make status transitions conditional in one transaction; add a reload/resume regression test. |
| L01 | Resolved into confirmed F07 | `src/db/seed.ts` and startup | Startup seeding risk mentioned; exact failure case unavailable. | Inspect seed idempotency, partial failure, and startup ordering; reject or substantiate. |
| L02 | Lead; progress message only | Stores and save callers; exact location pending | Overlapping saves and accessory editing risks mentioned. | Trace write ordering, stale state, and failure recovery; do not report as confirmed yet. |
| L03 | Resolved into confirmed F13 | `src/screens/Workout.tsx` and session/store logic | Completed workout can remain editable after reload and then be marked skipped. | Reproduce completion → reload → skip; record exact location, persisted state, and impact. |
| L04 | Lead with prior isolated probe | `src/service-worker.ts`; exact line pending | HTTP 503 navigation response appears to replace a good cached shell; later offline navigation returns the cached error. | Check response validation and cache writes; reproduce in browser where practical before final severity. |

## Batch rules and completion evidence

1. Load this summary and only the selected batch's files/dependencies. Use one agent.
2. Default limit: up to three implementation files plus directly related tests,
   or roughly 1,000 implementation lines, whichever comes first. A large file may
   span batches; record reviewed line ranges and next symbol. These are work limits,
   not a promise of a particular account-usage percentage.
3. Read the selected code carefully, trace relevant callers/callees, inspect tests
   for missing behavior, and use focused tests or small reproductions when useful.
   Record cross-file questions for a later batch when resolving them would expand scope.
4. Keep application code unchanged. Put probes in `/tmp` or an isolated temporary
   checkout; do not retain product/test changes during this review. Documentation
   updates to this ledger are authorized. Never remove unrelated user changes.
5. Update the ledger after each completed file and before ending a session. For each
   reviewed file record commit/blob identity, full-file or exact range, behavior and
   invariants traced, related tests/dependencies, findings or substantive negative
   conclusions, and unresolved checks. Persist useful evidence without dumping logs.
6. Stop after the selected batch. Do not automatically start the next batch, run an
   exhaustive suite repeatedly, or continue solely to finish the repository in one
   session. Record the exact next action. A focused passing test is not full coverage.
7. Before resuming, compare the current revision/working diff with recorded reviewed
   revisions. Reopen changed files and affected interactions as `stale`; add new
   relevant tracked files. Preserve evidence for unchanged files.
8. Final completion requires every in-scope file marked `deep` at its applicable
   revision, cross-file questions resolved or explicitly blocked, findings reconciled,
   and appropriate final integration checks. A confirmed bug may remain open when
   its file review is complete. Do not claim exhaustive completion with pending work.

Status meanings: `pending` = no reliable deep-review record; `partial` = prior
specific inspection/finding, full review unproven; `reported` = prior component-area
completion claim without recoverable per-file evidence; `deep` = evidence recorded;
`stale` = changed since review; `blocked` = exact missing evidence/dependency recorded.
At tracker creation no file was marked `deep`; completed batches now add evidence
below. Prior reported coverage alone never becomes a completion claim.

## Queue

Queue areas may take several batches. Select a small slice using the limits above;
area membership is not permission to review the entire area in one session.

| Area | Scope | Starting concern |
|---|---|---|
| B01 | DB worker/client and startup | F02 persistence failure |
| B02 | Schema, tables, seed, DB tests | L01; transaction and migration invariants |
| B03 | History editing and tests | F01; replacement/deletion ordering |
| B04 | Export/import and settings store | F03; validation and round trips |
| B05 | Workout store, session logic, workout screen | L02/L03; lifecycle and save ordering |
| B06 | Other screens and screen tests | Navigation, failure states, state consistency |
| B07 | Calculation, progression, composition and other libraries/tests | Numeric boundaries and domain invariants |
| B08 | Components, hooks, related tests | Recover reported coverage through bounded verification; edits and async state |
| B09 | Service worker, timers, notifications and tests | L04; offline and notification lifecycle |
| B10 | Build/deploy/config/scripts/public assets | Deployment assumptions and operational failures |
| B11 | E2E, test infrastructure, domain types and remaining stores | Integration gaps and shared contracts |
| B12 | Documentation/data relevance and final reconciliation | Scope accounting and cross-file closure |

## File ledger

Inventory baseline: `f8026941549518159866831bba07012794b62007`, captured 2026-09-12 with a clean working tree before
creating this tracker. The baseline identifies the current inventory, not a proven
revision for the previous session. Each row is an individual tracked file; tests
have their own rows. Add review evidence below and put its batch ID in the last
column as work is completed.

| File | Queue | Status | Evidence / resume note |
|---|---|---|---|
| `.claude/ARCHITECTURE_MAP.md` | B12 | pending | — |
| `.claude/COMMON_MISTAKES.md` | B12 | pending | — |
| `.claude/QUICK_START.md` | B12 | pending | — |
| `.claude/completions/README.md` | B12 | pending | — |
| `.claude/sessions/README.md` | B12 | pending | — |
| `.claudeignore` | B10 | pending | — |
| `.github/dependabot.yml` | B10 | pending | — |
| `.github/workflows/ci.yml` | B10 | pending | — |
| `.github/workflows/deploy.yml` | B10 | pending | — |
| `.gitignore` | B10 | pending | — |
| `AMRAP_TARGET_REPS_ANALYSIS.md` | B12 | pending | — |
| `CLAUDE.md` | B12 | pending | — |
| `ENGINEERING_PASSES.md` | B12 | pending | — |
| `README.md` | B12 | pending | — |
| `ROADMAP.md` | B12 | pending | — |
| `docs/INDEX.md` | B12 | pending | — |
| `docs/archive/README.md` | B12 | pending | — |
| `docs/design/plate-loading-model.md` | B12 | pending | — |
| `docs/ui-consistency-review.md` | B12 | pending | — |
| `docs/verification/2026-06-27-deload-toggle.md` | B12 | pending | — |
| `docs/verification/2026-08-09-rest-timer-notifications.md` | B12 | pending | — |
| `docs/verification/2026-08-09-swe-hardening.md` | B12 | pending | — |
| `eslint.config.js` | B10 | pending | — |
| `index.html` | B10 | pending | — |
| `package.json` | B10 | pending | — |
| `playwright.config.ts` | B10 | pending | — |
| `pnpm-lock.yaml` | B10 | pending | — |
| `pnpm-workspace.yaml` | B10 | pending | — |
| `public/_headers` | B10 | pending | — |
| `public/demo-seed.json` | B10 | pending | — |
| `public/favicon.svg` | B10 | pending | — |
| `public/icons.svg` | B10 | pending | — |
| `scripts/debug-browser.js` | B10 | pending | — |
| `scripts/migrate-history.py` | B10 | pending | — |
| `scripts/verify-notify-hardening.js` | B10 | pending | — |
| `src/App.tsx` | B01 | deep | B01b — app shell and training-max helpers (1/5); evidence below |
| `src/components/forms/DurationInput.test.tsx` | B08 | reported | Area claim only |
| `src/components/forms/DurationInput.tsx` | B08 | reported | Area claim only |
| `src/components/forms/ExerciseEditor.tsx` | B08 | reported | Area claim only |
| `src/components/forms/ExerciseSetsBlock.tsx` | B08 | reported | Area claim only |
| `src/components/forms/LiftSetsByType.tsx` | B08 | reported | Area claim only |
| `src/components/forms/NotesBlock.tsx` | B08 | reported | Area claim only |
| `src/components/forms/NotesField.test.tsx` | B08 | reported | Area claim only |
| `src/components/forms/NotesField.tsx` | B08 | reported | Area claim only |
| `src/components/forms/NotesText.test.tsx` | B08 | reported | Area claim only |
| `src/components/forms/NotesText.tsx` | B08 | reported | Area claim only |
| `src/components/forms/PlateDisplay.tsx` | B08 | reported | Area claim only |
| `src/components/forms/SetLogControls.tsx` | B08 | reported | Area claim only |
| `src/components/forms/SetReadout.tsx` | B08 | reported | Area claim only |
| `src/components/forms/Stepper.test.tsx` | B08 | reported | Area claim only |
| `src/components/forms/Stepper.tsx` | B08 | reported | Area claim only |
| `src/components/layout/BottomNav.tsx` | B08 | reported | Area claim only |
| `src/components/layout/Rule.tsx` | B08 | reported | Area claim only |
| `src/components/layout/SectionLabel.tsx` | B08 | reported | Area claim only |
| `src/components/layout/SubLabel.tsx` | B08 | reported | Area claim only |
| `src/components/layout/Toast.tsx` | B08 | reported | Area claim only |
| `src/components/layout/WeekBadge.tsx` | B08 | reported | Area claim only |
| `src/components/modals/AccessoryTmModal.tsx` | B08 | reported | Area claim only |
| `src/components/modals/ConfirmationDialog.tsx` | B08 | reported | Area claim only |
| `src/components/modals/CycleCompleteModal.tsx` | B08 | reported | Area claim only |
| `src/components/modals/ExerciseHistoryModal.test.tsx` | B08 | reported | Area claim only |
| `src/components/modals/ExerciseHistoryModal.tsx` | B08 | reported | Area claim only |
| `src/components/modals/LiftHistoryModal.test.tsx` | B08 | reported | Area claim only |
| `src/components/modals/LiftHistoryModal.tsx` | B08 | reported | Area claim only |
| `src/components/modals/LiftSetupModal.tsx` | B08 | reported | Area claim only |
| `src/components/modals/Modal.test.tsx` | B08 | reported | Area claim only |
| `src/components/modals/Modal.tsx` | B08 | reported | Area claim only |
| `src/components/modals/ModalAsyncStates.tsx` | B08 | reported | Area claim only |
| `src/components/modals/TmRecommendationModal.test.tsx` | B08 | reported | Area claim only |
| `src/components/modals/TmRecommendationModal.tsx` | B08 | reported | Area claim only |
| `src/components/stats/RecordsPanel.tsx` | B08 | reported | Area claim only |
| `src/components/ui/InlineConfirm.test.tsx` | B08 | reported | Area claim only |
| `src/components/ui/InlineConfirm.tsx` | B08 | reported | Area claim only |
| `src/components/ui/ToggleChip.tsx` | B08 | reported | Area claim only |
| `src/components/workout/AccessoryLog.tsx` | B08 | reported | Area claim only |
| `src/components/workout/AccessoryPicker.test.tsx` | B08 | reported | Area claim only |
| `src/components/workout/AccessoryPicker.tsx` | B08 | reported | Area claim only |
| `src/components/workout/AmrapTargets.test.tsx` | B08 | reported | Area claim only |
| `src/components/workout/AmrapTargets.tsx` | B08 | reported | Area claim only |
| `src/components/workout/CollapsibleSection.test.tsx` | B08 | reported | Area claim only |
| `src/components/workout/CollapsibleSection.tsx` | B08 | reported | Area claim only |
| `src/components/workout/CrossBlockLog.tsx` | B08 | reported | Area claim only |
| `src/components/workout/RestTimer.test.tsx` | B08 | reported | Area claim only |
| `src/components/workout/RestTimer.tsx` | B08 | reported | Area claim only |
| `src/components/workout/SaveFailureBanner.test.tsx` | B08 | reported | Area claim only |
| `src/components/workout/SaveFailureBanner.tsx` | B08 | reported | Area claim only |
| `src/components/workout/SessionBar.tsx` | B08 | reported | Area claim only |
| `src/components/workout/SetRow.test.tsx` | B08 | reported | Area claim only |
| `src/components/workout/SetRow.tsx` | B08 | reported | Area claim only |
| `src/db/index.ts` | B02 | deep | B02a — schema, seed, and DB mappings (2/5); evidence below |
| `src/db/schema.ts` | B02 | deep | B02a — schema, seed, and DB mappings (2/5); evidence below |
| `src/db/seed.test.ts` | B02 | deep | B02a — schema, seed, and DB mappings (2/5); evidence below |
| `src/db/seed.ts` | B02 | deep | B02a — schema, seed, and DB mappings (2/5); evidence below |
| `src/db/sqlite-client.ts` | B01 | deep | B01a; full file; findings/evidence below |
| `src/db/sqlite-table.test.ts` | B02 | deep | B02b — table layer and test client (3/5); evidence below |
| `src/db/sqlite-table.ts` | B02 | deep | B02b — table layer and test client (3/5); evidence below |
| `src/db/sqlite-test-client.ts` | B02 | deep | B02b — table layer and test client (3/5); evidence below |
| `src/db/sqlite.worker.ts` | B01 | deep | B01a; full file; findings/evidence below |
| `src/hooks/use-confirmation.ts` | B08 | pending | — |
| `src/index.css` | B10 | pending | — |
| `src/lib/accessory-tm.test.ts` | B07 | pending | — |
| `src/lib/accessory-tm.ts` | B07 | pending | — |
| `src/lib/assistance.test.ts` | B07 | pending | — |
| `src/lib/assistance.ts` | B07 | pending | — |
| `src/lib/audio-cues.test.ts` | B09 | pending | — |
| `src/lib/audio-cues.ts` | B09 | pending | — |
| `src/lib/calc.test.ts` | B07 | pending | — |
| `src/lib/calc.ts` | B07 | pending | — |
| `src/lib/cleanup.test.ts` | B07 | pending | — |
| `src/lib/cleanup.ts` | B07 | pending | — |
| `src/lib/cycle.test.ts` | B07 | pending | — |
| `src/lib/cycle.ts` | B07 | pending | — |
| `src/lib/exercise-history.test.ts` | B07 | pending | — |
| `src/lib/exercise-history.ts` | B07 | pending | — |
| `src/lib/exercise.test.ts` | B07 | pending | — |
| `src/lib/exercise.ts` | B07 | pending | — |
| `src/lib/export-import.test.ts` | B04 | deep | B04a — backup import/export and tests (5/5); evidence below |
| `src/lib/export-import.ts` | B04 | deep | B04a — backup import/export and tests (5/5); evidence below |
| `src/lib/format.test.ts` | B07 | pending | — |
| `src/lib/format.ts` | B07 | pending | — |
| `src/lib/lift.test.ts` | B07 | pending | — |
| `src/lib/lift.ts` | B07 | pending | — |
| `src/lib/notifications.test.ts` | B09 | pending | — |
| `src/lib/notifications.ts` | B09 | pending | — |
| `src/lib/notify-timers.test.ts` | B09 | pending | — |
| `src/lib/notify-timers.ts` | B09 | pending | — |
| `src/lib/performance.ts` | B07 | pending | — |
| `src/lib/plate-loading.test.ts` | B07 | pending | — |
| `src/lib/plate-loading.ts` | B07 | pending | — |
| `src/lib/pr.test.ts` | B07 | pending | — |
| `src/lib/pr.ts` | B07 | pending | — |
| `src/lib/rest-timer-worker.test.ts` | B09 | pending | — |
| `src/lib/rest-timer-worker.ts` | B09 | pending | — |
| `src/lib/session.test.ts` | B05 | partial | B05b next; helper reviewed only through caller trace |
| `src/lib/session.ts` | B05 | partial | B05b next; helper reviewed only through caller trace |
| `src/lib/tm-recommendations.test.ts` | B07 | pending | — |
| `src/lib/tm-recommendations.ts` | B07 | pending | — |
| `src/lib/training-max.test.ts` | B07 | deep | B01b — app shell and training-max helpers (1/5); evidence below |
| `src/lib/training-max.ts` | B07 | deep | B01b — app shell and training-max helpers (1/5); evidence below |
| `src/lib/workout-compose.test.ts` | B07 | pending | — |
| `src/lib/workout-compose.ts` | B07 | pending | — |
| `src/main.tsx` | B01 | deep | B01a; full file; findings/evidence below |
| `src/screens/History.test.tsx` | B06 | pending | — |
| `src/screens/History.tsx` | B06 | pending | — |
| `src/screens/HistoryEdit.test.tsx` | B03 | deep | B03a — history editor and tests (4/5); evidence below |
| `src/screens/HistoryEdit.tsx` | B03 | deep | B03a — history editor and tests (4/5); evidence below |
| `src/screens/Settings.test.tsx` | B06 | pending | — |
| `src/screens/Settings.tsx` | B06 | pending | — |
| `src/screens/Setup.test.tsx` | B06 | pending | — |
| `src/screens/Setup.tsx` | B06 | pending | — |
| `src/screens/Stats.test.tsx` | B06 | pending | — |
| `src/screens/Stats.tsx` | B06 | pending | — |
| `src/screens/Today.test.tsx` | B06 | pending | — |
| `src/screens/Today.tsx` | B06 | pending | — |
| `src/screens/Workout.test.tsx` | B05 | partial | B05b next; focused finish-path tests sampled, full file pending |
| `src/screens/Workout.tsx` | B05 | partial | B05b next; finish/resume path traced, full file pending |
| `src/service-worker.ts` | B09 | partial | L04 probe |
| `src/store/save-failure-store.test.ts` | B11 | pending | — |
| `src/store/save-failure-store.ts` | B11 | pending | — |
| `src/store/settings-store.test.ts` | B04 | deep | B04b — settings and import integration (1/3); evidence below |
| `src/store/settings-store.ts` | B04 | deep | B04b — settings and import integration (1/3); evidence below |
| `src/store/toast-store.test.ts` | B11 | pending | — |
| `src/store/toast-store.ts` | B11 | pending | — |
| `src/store/workout-store.test.ts` | B05 | deep | B05a — workout store and persistence (2/3); evidence below |
| `src/store/workout-store.ts` | B05 | deep | B05a — workout store and persistence (2/3); evidence below |
| `src/test-setup.ts` | B11 | pending | — |
| `src/types/domain.ts` | B11 | pending | — |
| `src/vite-env.d.ts` | B11 | pending | — |
| `src/workers/timer.worker.ts` | B09 | pending | — |
| `stryker.config.mjs` | B10 | pending | — |
| `tests/e2e/app.spec.ts` | B11 | pending | — |
| `tests/e2e/fixtures.ts` | B11 | pending | — |
| `tests/e2e/helpers.ts` | B11 | pending | — |
| `tests/e2e/workout.spec.ts` | B11 | pending | — |
| `tsconfig.app.json` | B10 | pending | — |
| `tsconfig.e2e.json` | B10 | pending | — |
| `tsconfig.json` | B10 | pending | — |
| `tsconfig.node.json` | B10 | pending | — |
| `vite.config.ts` | B10 | pending | — |

## Scope exclusions

- `test-results/.last-run.json`: generated run status; excluded from line-by-line
  source review. Test configuration and test source remain in scope.
- Untracked/generated `node_modules/`, `dist/`, `coverage/`, `logs/`, `reports/`,
  browser artifacts, and local agent configuration: not application source.
- Local `training-log-*.json` backups: personal data, excluded from source review;
  use synthetic fixtures for import tests. Tracked `public/demo-seed.json` is in scope.
- `pnpm-lock.yaml`: inspect dependency consistency/relevant versions with the build
  configuration; no implied audit of all vendored dependency internals.
- Tracked documentation is queued for relevance/behavior-contract checks, not marked
  reviewed merely because it is documentation. Record any narrower exclusion and reason.
- This tracker is review bookkeeping; it does not require recursively reviewing itself.

## Batch evidence and handoff

### 2026-09-12 — context recovery and tracker creation

Recovered initial findings, progress messages, historical check results, and
usage-limit interruptions. Inventoried tracked files; no new deep code review,
fixes, or test runs. Detailed prior agent reports were encrypted, so no per-file
completion was inferred. Next action: B01 as specified at the top.

For each future batch append:

- **Date / batch / revision:**
- **Files and ranges completed:**
- **Behavior, invariants, and dependencies traced:**
- **Checks and outcomes:** exact command or reproducible steps; distinguish historical
  checks, fresh passes, expected failing probes, and checks not run.
- **Findings:** ID, severity, current file/line, trigger, impact, recommended fix,
  evidence, and state (confirmed / needs verification / rejected / fixed elsewhere).
- **Open questions / remaining ranges:**
- **Ledger rows updated / exact next action:**


### 2026-09-12 — B01a: worker, client, startup entry point

**Revision:** `f8026941549518159866831bba07012794b62007`. Application files were
unchanged at batch start/end. Existing uncommitted tracker/index work was preserved.
Single agent; three implementation files deeply reviewed; no application edits.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/db/sqlite.worker.ts` | 1–87 | `adc1d8b67a1b6dc79113e0e105f00c0f4c5c00df` |
| `src/db/sqlite-client.ts` | 1–95 | `aef868ff2fca27ebba6fd4d7d4d4582c00575cbd` |
| `src/main.tsx` | 1–21 | `91c5a6aa08f0d1262d84d2f45a93f97a8e61436b` |

**Behavior and invariants traced:**

- Worker: WASM initialization, ten OPFS attempts and retry boundary, persistent vs
  in-memory readiness, schema/migration calls, parameter binding, query/run result
  replies, BEGIN/COMMIT/ROLLBACK, reset, and error-to-RPC propagation. F02 confirmed.
  SQL parameters are passed through bindings; synchronous SQL errors are returned
  with the request ID. Schema and migration contents are not covered by this batch.
- Client: request IDs, pending-map cleanup, readiness gating, operation timeouts,
  worker lifecycle, pagehide/bfcache distinction, transaction depth, commit/rollback,
  test stub, and DEV reset hook. F04–F06 confirmed. Ordinary transaction success was
  a passing control. A timeout rejects the caller without cancelling worker SQL;
  callers must not assume a timed-out write was rolled back. Follow this consequence
  with save retry behavior in B05 rather than claiming another UI finding here.
- Main: complete initialization chain through seed, settings, theme, root replacement,
  persistence effect setup, and render. The readiness object is passed to a seed
  function that accepts no parameters; its persistence flag is never checked.
  No terminal catch or error UI handles init, seed, or settings failure.
- Limited dependency reads (not full-file completion): `src/db/index.ts:36–43`
  reexports readiness and delegates transactions; `src/db/seed.ts:41–54` accepts no
  readiness parameter and rethrows seed failures; `src/store/settings-store.ts:286–302`
  awaits DB settings; `src/store/workout-store.ts:114–132` starts the storage effect;
  `src/App.tsx` has no persistence acknowledgement/recovery gate and starts the
  training-max presence refresh; `index.html:23` supplies the static LOADING shell.
  `vite.config.ts:13–20` aliases the production client away under Vitest.

**Fresh probes:** `rtk proxy node /tmp/training-review-b01/probe.cjs` exited 0.
The temporary harness transpiles the actual worker/client/schema/main sources with
installed TypeScript and runs installed SQLite WASM. Worker messaging uses an
in-process microtask bridge. OPFS failure is injected; retry delays are accelerated.
Main's seed/settings/render dependencies are stubs so its promise-chain behavior
can be observed. The initial harness run failed due to a mock default-export shape;
that harness error was corrected before the successful run. No product code changed.

Reproduction recipes (durable even if the temporary harness is removed):

1. **F02:** Make `installOpfsSAHPoolVfs` reject on every call while retaining the real
   SQLite `oo1` implementation. Initialize the actual worker/client: ten attempts,
   then readiness resolves `{persistent:false}`. Create `review_probe(value TEXT)`
   and insert a row; the query succeeds. Start another worker: its `sqlite_master`
   has no probe table. Feed the first readiness promise through main's actual chain
   with seed/settings/render stubs: render is called once despite false persistence.
2. **F04:** Reject main's readiness promise; capture the resulting chain rejection:
   render is not called and the LOADING root is unchanged. Instantiate the client
   with a silent worker: readiness remains pending, with no worker error/messageerror
   handlers. Code inspection establishes the absence of an init deadline; the probe
   only observes pending state over an event-loop turn, not an infinite wait.
3. **F05:** On a real SQLite connection start transaction A, insert `outer`, then
   await a controllable gate. Independently call transaction B, insert `independent`,
   and await B's successful resolution. Release A's gate and throw from A. After A's
   rollback, query for `independent`: zero rows, despite B already reporting success.
4. **F06:** Force a BEGIN rejection by opening a transaction via `client.run('BEGIN')`
   before calling `client.transaction`. Roll back that injected transaction via
   `run('ROLLBACK')`. Client depth remains 1. Invoke a subsequent transaction whose
   callback inserts `leaked` then throws: its promise rejects but the row remains.
   The forced open transaction is an error-path injection, not a demonstrated UI
   workflow; any rejected BEGIN reaches the same uncovered cleanup path.

**Limitations / remaining work:** No real-browser OPFS contention, worker-load
failure, browser reload, or bfcache test was run. F05 proves the client contract
failure, with UI overlap/retry paths still to trace in B03/B05. No full test suite,
E2E suite, lint, or build was rerun for this read-only review. Vitest's normal alias
means its DB tests do not directly validate this production worker/client path.
B02 must examine swallowed additive-migration errors, retry resource cleanup after
DB construction/schema failure, reset atomicity, and L01 seed behavior; these remain
questions, not additional confirmed findings. Startup localStorage-effect failures
remain for the store batch. No fixes are claimed.

**Handoff:** Three files marked deep, App marked partial. Next: B01b at the top;
then B02. Stop here instead of automatically starting another batch.


### 2026-09-12 — B01b — app shell and training-max helpers (1/5)

Revision: `f8026941549518159866831bba07012794b62007`. Single agent; application code unchanged.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/App.tsx` | 1–108 | `42c0212f46c00526c1946651406050e741202419` |
| `src/lib/training-max.ts` | 1–75 | `2d74522acf18c77e26af0cca2b7804abec6747da` |
| `src/lib/training-max.test.ts` | 1–144 | `03a46294259281df596c2531a3a5b1a96a8bc6ed` |

Reviewed routes/lazy boundaries, onboarding presence gating, confirmation provider placement, bfcache veil/listener cleanup, all TM reads/writes, presence refresh, accessory selection, and each existing test. `rtk pnpm exec vitest run src/lib/training-max.test.ts`: 15/15 passed. No new confirmed substantive finding. F04 remains applicable to missing failure recovery; App also has no route error boundary, but a browser chunk-failure reproduction remains outstanding. The setup exemption avoids a redirect loop and null presence avoids a premature redirect. Dependency searches traced TM write notification sites and current-TM consumers; those caller files are not marked reviewed. Equal-date tie handling differs between getCurrentTm and getAllCurrentTms, but the latter has no production callers in the search, so this is a maintenance/test note, not a reported user-facing bug. Tests omit rejected/stale presence refresh, accessory helper cases, and App router/error/bfcache behavior. No real-browser verification. Next authorized slice: B02a.


### 2026-09-12 — B02a — schema, seed, and DB mappings (2/5)

Revision: `f8026941549518159866831bba07012794b62007`. Single agent; application code unchanged.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/db/schema.ts` | 1–145 | `1cae981afd7aa6283de6d2dbb22c2a5e256e9644` |
| `src/db/seed.ts` | 1–86 | `af5696f7d3090ec3441491d84e1c08416ae37931` |
| `src/db/index.ts` | 1–43 | `8540b8c6d214d771aff053981073bb2ca76ea567` |
| `src/db/seed.test.ts` | 1–148 | `a27dfbd2c3f01fe9c374a06688f33a280519890a` |

Reviewed every table/index/migration/table-list entry, DB field conversions, table mappings, transaction delegation, seed promise deduplication/retry, lift recovery, additive exercise seeding/category normalization, and settings preservation. 12/12 existing seed tests passed (`rtk pnpm exec vitest run src/db/seed.test.ts`). A temporary-copy regression confirms F07: seed one customized lift plus its TM/session, then call seedDatabase; its ID disappears while TM/session rows still refer to it. This is reachable after onboarding removes defaults to use fewer than four lifts (deleteLift is intended for that use). Fix by distinguishing first initialization from an intentional roster and preserving existing IDs/configuration during recovery. Existing partial-recovery tests assert only counts and miss identity/history preservation. L01 is now substantiated as F07.

Schema has no foreign keys, so the loss is not rejected by SQLite. The unique accessory-note migration explicitly tolerates legacy duplicates; record remediation/reader deduplication as a follow-up, not a newly discovered index omission. Additive migration errors are broadly swallowed by the already-reviewed worker; real storage fault/resource cleanup tests remain outstanding. No browser migration/OPFS test. Probe command: `rtk proxy node /home/spark343/github/training-log/node_modules/vitest/vitest.mjs run src/db/review-seed.test.ts` in `/tmp/training-review-five`; 1/1 passed (asserts the faulty behavior), in the successful combined probe run. Temporary harness setup first stalled through pnpm and then lacked referenced tsconfigs; cancelled pnpm, used installed Vitest directly, copied all tsconfigs, then encountered an external node_modules resolution error. Running the temporary config with the original project root, explicit temporary test includes, and allowed temporary source directory resolved it. The successful command was `rtk pnpm exec vitest run --config /tmp/training-review-five/vite.config.ts`: 4/4 probes passed across seed, table, and history. Next: B02b.


### 2026-09-12 — B02b — table layer and test client (3/5)

Revision: `f8026941549518159866831bba07012794b62007`. Single agent; application code unchanged.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/db/sqlite-table.ts` | 1–310 | `052b69694e7ed501312ff9e98009567a80894596` |
| `src/db/sqlite-test-client.ts` | 1–80 | `677c4dd28856c61aa6dbd547d85795706b2dacb8` |
| `src/db/sqlite-table.test.ts` | 1–83 | `575ec192da3894ffff7b22b80b8330b6ae1d0ea0` |

Reviewed serialization, identifier validation, query cloning/filter/order/first/last/delete, parameterized predicates, all CRUD methods, bulk grouping/chunking/atomicity, test-client readiness/transactions/termination/reset, and all focused tests. `rtk pnpm exec vitest run src/db/sqlite-table.test.ts`: 10/10 passed. Two temporary real-SQLite probes passed: a constraint failure in the second heterogeneous bulk group rolls back the first; query branches remain independent and date/false/empty-array values deserialize correctly. Included in the 4/4 successful temporary-config run documented in B02a. No additional confirmed finding. Test client duplicates F05/F06 depth issues and bypasses production RPC/OPFS, so passing these tests does not clear those findings. SQL identifiers reject punctuation; values are bound; empty anyOf is covered; update excludes primary-key changes. Grouping may reorder generated IDs, but exported rows carry explicit IDs; no application failure demonstrated. Tests omit worker timeouts and transaction overlap. Reset helper deletes rows/sequences but does not rebuild schema or reset transaction depth; fault-oriented tests need fresh clients. Broad storage-fault injection, old-schema upgrade fixtures, and worker resource cleanup remain open cross-batch validation, not implicit passes. Next: B03a.


### 2026-09-12 — B03a — history editor and tests (4/5)

Revision: `f8026941549518159866831bba07012794b62007`. Single agent; application code unchanged.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/screens/HistoryEdit.tsx` | 1–485 | `568d753e6b513d404c335e98b0ce8ab812a08759` |
| `src/screens/HistoryEdit.test.tsx` | 1–726 | `201c4c5ca9ca2064e5699e22ba7adfde7ab85233` |

Reviewed route-ID validation/loading, set ordering, accessory grouping including note-only records, add/remove/swap behavior, type-change resets, per-row persistence, transaction boundaries, navigation, saving controls, and all 726 test lines. `rtk pnpm exec vitest run src/screens/HistoryEdit.test.tsx`: 36/36 passed. F01 reconfirmed with actual component events and real SQLite in the temporary copy: seed Alpha and Bravo sets, swap Bravo→Charlie, then Alpha→Bravo, save; navigation reports success but Bravo has zero rows while Charlie has one. This confirms the deletion/write ordering issue independently of the production client's F05. Recommended fix remains deleting all replaced originals before writing any replacements in one transaction. Repro is `/tmp/training-review-five/src/screens/review-history.test.tsx`, run via the temporary config (1/1 passed in combined run, assertions describe current faulty behavior).

Duplicate-target picker guards work for simultaneously occupied cards but cannot protect re-used vacated IDs; existing swap tests cover only a single replacement. Notes are scoped by session/exercise, same-row edits preserve IDs, and removed accessories are cleared before inserts. Save uses finally without catch; load also lacks rejection handling. A failure therefore has no local explanation/retry guidance; track under broader recovery work rather than adding a duplicate startup finding. Missing/missing-lift sessions remain on Loading (an existing test even asserts this); no browser recovery check. Tests often assert presence/navigation rather than exact updated values, and omit chained replacements, rollback failures, edits during initial load, and shared-component input validation. Those are follow-ups for focused regression coverage; shared components are not marked reviewed by this batch. Next: B04a.


B03a addendum (same authorized slice): tracing `SET_TYPE_EDIT_ORDER` exposed F10.
A second temporary component test seeds a completed session with one `cross` set
(weight 321), waits for library loading through the picker, and confirms no 321
value or weight-edit control is rendered. Source inspection shows the type is
absent from the rendering loop. The two history probes both passed in the final
5/5 history/import probe run. Existing tests cover other set types but omit cross.
No claim is made that hidden cross rows are deleted; the defect is inability to edit.


### 2026-09-12 — B04a — backup import/export and tests (5/5)

Revision: `f8026941549518159866831bba07012794b62007`. Single agent; application code unchanged.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/lib/export-import.ts` | 1–278 | `2f61c9a9d13c3e036b3d96f284e0c9089630f214` |
| `src/lib/export-import.test.ts` | 1–898 | `153924b8a2af67ff4abf3fd944381d63cb2928e3` |

Reviewed all JSON export tables/version/date metadata, pending download retry handling, file-size/JSON/row/ID validation, allowlists, destructive clear/restore ordering, transaction use, date revival, category migration, presence refresh, CSV session/accessory/note rows, escaping, and download URL cleanup. Read all 898 existing test lines, including round-trip fixtures and malformed inputs. `rtk pnpm exec vitest run src/lib/export-import.test.ts`: 59/59 passed. Three isolated probes passed against actual source plus real SQLite: F03 restores hasDeloadWeek:false as null; F08 imports a File containing {"unrelated":"document"} and deletes an existing lift without error; F09 exports Hold(duration=123) and Carry(distance=456) rows with neither measurement nor corresponding header. All three are in `/tmp/training-review-five/src/lib/review-import.test.ts`. `rtk pnpm exec vitest run --config /tmp/training-review-five/vite.config.ts review-import review-history`: 5/5 passed (three import/export probes, two history probes). Assertions document the faulty behavior, not successful fixes.

F03/F08/F09 are confirmed. F08 recommendation preserves intentionally supported partial/legacy backups but rejects wholly unrecognized JSON before mutation; Settings.tsx:459–462 does show an overwrite confirmation, which does not validate backup identity. CSV probes stub download/browser APIs and inspect generated content, not an external spreadsheet. Round-trip tests omit hasDeloadWeek:false and CSV tests never assert timed/distance measurements. Positive existing tests cover explicit IDs, date/null revival, booleans/equipment fields, quotes and note-only rows, malformed arrays/rows/duplicate IDs, and file-size boundaries.

Remaining integration checks: imports during active workout state, concurrent export/write consistency (F05), browser download rejection/retry behavior, and user-visible handling when the post-commit presence refresh fails. The settings store and its tests remain pending B04b. No browser OPFS/end-to-end tests or broad suite/build rerun. Application files unchanged; all probes live in a disposable copy under /tmp. Five authorized batches are complete; stop here.


### 2026-09-12 — B04b — settings and import integration (1/3)

Revision: `f8026941549518159866831bba07012794b62007`. Single agent; application code unchanged.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/store/settings-store.ts` | 1–315 | `abf89a628b41915f045cdc079cea3cffcc1401e7` |
| `src/store/settings-store.test.ts` | 1–127 | `a9aa4f933a341ca832dcededc3991f8ff287ed8e` |

Reviewed all theme definitions/lookup, default values, load/update ordering, optional-field fallback, database failure propagation, and all settings tests. Limited caller trace: Settings.tsx:459–471 clears workout state then loads settings after import; Setup import also calls loadSettings. Neither reapplies theme there. 12/12 existing settings tests passed. Three temporary checks passed via `rtk pnpm exec vitest run --config /tmp/training-review-five/vite.config.ts review-settings-next`: missing-settings restore retains prior live restTimer1=999/barWeight=100 despite an empty settings table (F11); a failed DB update preserves the previous live value (positive control); restored oled-light remains visually OLED until theme application/reload (minor related UI discrepancy). F11 recommendation: reset to defaults when no row exists and apply the resolved theme as part of restore. Scope of F11 is live state vs restart, not loss of saved settings. F03 remains the independent dropped-deload-column finding. Tests do not reset the settings singleton between cases, and their theme-load test asserts the stored key but not CSS. Invalid theme keys inherited from Object.prototype also bypass the `in` check; input validation hardening remains a lead, without a user-flow reproduction. Next authorized slice: B05a workout store.


### 2026-09-12 — B05a — workout store and persistence (2/3)

Revision: `f8026941549518159866831bba07012794b62007`. Single agent; application code unchanged.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/store/workout-store.ts` | 1–250 | `93dffdf828ce795fc92282dee6ba4fa0e9eaae29` |
| `src/store/workout-store.test.ts` | 1–525 | `cf9066b8a50225681f8ec0a951555fb6d5cf1de2` |

Reviewed every state field, version/key/type validation, hydration fallback, fresh reset arrays, initial/every-change persistence effect, linear/cross cursors, rest state, fixed-slot replacement, accessory edits/removal/notes, and all 525 test lines. 43/43 existing tests passed (`rtk pnpm exec vitest run src/store/workout-store.test.ts`). An isolated Solid reactive-root test injects QuotaExceededError into localStorage.setItem and confirms the error escapes setupWorkoutPersistence (F12). Source main.tsx calls this inside render; there is no local catch or user-visible persistence status. First probe incorrectly spied on Storage.prototype even though test setup substitutes a plain object; corrected to spy on localStorage. Solid wrapped the injected DOMException as Unknown error, so the final assertion verifies thrown failure rather than a specific message. Final probe passed in the 2/2 persistence/resume run. No real-browser quota test or claim that SQLite data itself was deleted.

Positive observations: read/JSON failures fall back safely, unknown top-level keys/types are discarded, clearSession creates fresh arrays, cross sets do not affect the linear cursor, fixed slots replace while extras append. Hydration validates array containers but not entries or active-session fields; malformed nested values can still reach consumers (follow-up, no new product-flow finding). The store deliberately does not write SQL: accessory data waits for completion, making local persistence errors material for resume. Existing tests have no storage-write exception coverage, and do not test duplicate exercise IDs across slots; caller guards remain for component review. Next: B05b session helpers plus a bounded Workout screen slice.


### Checkpoint — continuation interrupted during B05b

The next session must continue with B05b as a single bounded pass. Do not start a
new area until these files are closed:

| File | Current state | Remaining work |
|---|---|---|
| `src/lib/session.ts` | Partially traced | Deep-review both helpers and all 76 test lines; verify transaction/status behavior and caller coverage. |
| `src/lib/session.test.ts` | Partially traced | Run the focused file and inspect missing concurrent/status cases. |
| `src/screens/Workout.tsx` | Partially traced | Finish the entire file, especially `loadData`, `handleComplete`, `handleSkip`, `handleExit`, retry/save-failure paths, and post-completion modal state. |
| `src/screens/Workout.test.tsx` | Partially traced | Read all 525+ lines, run the focused suite, and add only disposable probes under `/tmp` if needed. |

The confirmed F13 probe used the real SQLite test client and actual Workout source:
create a completed DB session, put a stale `pending` copy in `workout.activeSession`,
render Workout, open session options, click `SKIP LIFT`, and observe the DB status
change to `skipped`. The production `reconcileActiveSession` helper would return
`null` for this row, but Workout does not call it before line 624's unconditional
`db.sessions.update(..., { status: 'skipped' })`. Existing focused finish-path tests
pass, including the completed-session EXIT protection, because EXIT delegates to
`discardPendingSession`; that does not cover SKIP. Verify whether COMPLETE has the
same stale-status exposure before finalizing severity. The disposable probe files
are in `/tmp/training-review-five/src/screens/review-resume-next.test.tsx`.

The persistence probe for F12 is in `/tmp/training-review-five/src/store/review-persistence-next.test.ts`.
It injects a throwing `localStorage.setItem` into a Solid reactive root and confirms
the exception escapes `setupWorkoutPersistence`; the first attempt incorrectly
spied on `Storage.prototype`, then was corrected to spy on the test setup's plain
`localStorage` object. Do not spend the next batch redoing this probe.

The last focused command before interruption was
`rtk pnpm exec vitest run src/screens/Workout.test.tsx -t 'EXIT|SKIP|COMPLETE SESSION|active session row is gone'`;
it passed 19 selected tests (75 skipped by the filter in the run shown in the log).
Run the complete Workout and session files once in B05b, then record exact totals.
No product code changed. After B05b, update these partial rows to `deep`, reconcile
F13 against COMPLETE, and choose the next queue area from the tracker.
