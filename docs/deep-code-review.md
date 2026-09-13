# Deep code review tracker

## Resume here

**Single agent only. Do not spawn or delegate to sub-agents, including sequentially.**
Review one bounded batch per session, save progress here, and stop. The user wants
an exhaustive review spread across sessions because the previous parallel review
exhausted usage limits. This document is the handoff; do not reload entire session
transcripts on ordinary continuation.

**Next batch: B06c — Setup screen and its tests.** Review `src/screens/Setup.tsx`
and `src/screens/Setup.test.tsx`, starting with onboarding roster/TM writes, import,
validation, partial failures and navigation. Reuse B02a/B04a/B04b evidence for seed,
import and settings; do not reopen unchanged dependencies or begin B06c here.
Settings (1,069 implementation lines) will need a separately bounded slice later.

Latest run: **B06b complete; 2 additional files marked deep** (History implementation
and tests). **29 files deep in total.** All 30 existing History tests passed.
Eight disposable checks passed (6 bug assertions, 2 positive controls); a separate
failure-injection run passed its 2 behavioral assertions but **exited 1 with 2
expected unhandled rejections**. F10 now includes hidden cross sets in History.
New confirmed findings F19–F21 cover wrong-session detail, stale list/calendar
results and misleading empty-state failure handling. Only this tracker changes;
no application fixes or sub-agents. This card authorizes commit, push and PR;
operator acceptance remains a separate native Kanban review step.

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

F01–F21 have evidence recorded in the completed batches below. L01 is resolved
into F07 and L03 into F13; L02 is partly substantiated by F14/F15, while L04/L05
and L06 remain leads. See each batch for
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
| F10 | Medium; B03a edit probe; B06b History display probe | `src/screens/HistoryEdit.tsx:328–333`; `src/screens/History.tsx:321`; `src/components/forms/LiftSetsByType.tsx:21`; `src/lib/calc.ts:34–35` | Both display and edit type lists exclude stored `cross` sets. History can badge a session for a cross-movement PR yet hide that work in its expanded detail; users also cannot correct those sets in the editor. | Render cross sets with movement labels in both read-only and editable history; preserve B03a edit evidence and cover displayed work/PR attribution and persisted edits. |
| F11 | Medium; B04b isolated restore check | `src/store/settings-store.ts:286–301`; import callers | Importing a backup with no settings row leaves the previous in-memory settings active until a reload, even though the database is empty. A restored theme is similarly stored in memory without immediate CSS application. | Reset settings state to defaults when no row exists and apply the resolved theme after import/restore. |
| F12 | Medium; B05a isolated persistence check | `src/store/workout-store.ts:116–132` | A localStorage quota/write failure escapes the reactive persistence effect. The render path has no catch or user-visible persistence status, so active-workout recovery can silently stop. | Catch persistence failures, surface degraded recovery state, and define retry/cleanup behavior. |
| F13 | High; B05b Workout/SQLite probes; B06a real-router entry probe | `src/screens/Today.tsx:220–226`; `src/screens/Workout.tsx:189–207`, `574–597`, `620–626` | A stale pending store resumes a completed DB row. Today's RESUME link bypasses START's reconciliation and reaches live Workout controls. SKIP changes the row to skipped; COMPLETE appends duplicate accessory sets and overwrites saved date/notes. EXIT already protects completed data. | Reconcile every resume entry and on route entry; perform status-conditional, idempotent completion/skip in a serialized transaction. Preserve a separate resumable post-commit phase instead of replaying the save. |
| F14 | High; B05b delayed-write component probes | `src/screens/Workout.tsx:302–308`, `333–362`, `413–440`, `470–477` | Set mutations overlap without operation identity: a failed earlier LOG pops a later successful set (linear and same-movement cross paths); undo before add settles leaves a DB row with no valid logged store entry. | Serialize dependent mutations or reconcile each result/rollback by stable operation ID; gate undo/edit/finalization on pending saves and bind completions to the originating session. |
| F15 | High; B05b retry component probes | `src/screens/Workout.tsx:333–361`, `376–389`, `413–439`; `src/components/workout/SaveFailureBanner.tsx:25–36` | RETRY replays a positional handler against live workout state. After manual LOG it duplicates the old slot, advances the cursor incorrectly and misassigns its DB ID; after EXIT/start it writes the old set into the new session. | Bind immutable session/set identity to retry; verify applicability and make retries idempotent. Scope banners to their originating session and retire superseded callbacks, retaining unresolved gap records as appropriate. |
| F16 | Medium; confirmed B06a delayed-insert component/SQLite probe | `src/screens/Today.tsx:80–122`, `125–148`, `352–354` | START has no in-flight guard. Two clicks before insertion settles both see no pending session and create distinct pending rows for the same lift/cycle/week. Completing the active one leaves the hidden pending attempt holding the week open. | Single-flight the entire start/resume/abandon/seed/navigation operation; atomically select-or-create one pending attempt for a slot, preserving historical redo rows. Define recovery for existing duplicate pending rows; a component flag alone does not address cross-tab calls. |
| F17 | Medium; confirmed B06a deferred-selection component probes | `src/screens/Today.tsx:45–47`, `74–77`, `125–127`, `254–259`, `352–354` | Lift selection changes immediately while old TM/defaults remain; late reads overwrite the latest selection. A valid Bench TM can be replaced by a delayed zero-TM Deadlift result, disabling Bench, or Bench can display Deadlift's assistance. START during loading accepts a no-TM lift using the previous lift's enabled button. | Key TM/defaults/loading by selection generation and publish only current results; clear or hide stale values, disable START while unresolved, and validate the captured target's TM inside the start operation. |
| F18 | High; confirmed B06a Today→Workout/SQLite probe | `src/screens/Today.tsx:87–91`, `116–121`; `src/store/workout-store.ts:135–137`; `src/screens/Workout.tsx:179–187`, `189–259`, `333–353` | Reusing a pending SQL session without matching local workout state resets the cursor/logged arrays instead of restoring its saved sets. Workout derives progress only from those empty arrays; the next LOG inserts another warmup set 1 alongside the already-saved row. Backup restore or absent local recovery state can reach this path. | Distinguish fresh sessions from recovery; hydrate persisted main/cross sets with stable IDs and reconstructed cursors before logging, reconcile defaults and available notes/accessories, and explicitly disclose state that was never backed up. Preserve existing rows and test pending-backup recovery. |
| F19 | Medium; B06b sequential and delayed-detail component/SQLite probes | `src/screens/History.tsx:540–556`, `294–321`; `src/components/forms/LiftSetsByType.tsx:21–27` | Open A then B without collapsing A: old detail is attached to B immediately. Same-type set arrays are captured nonreactively by the child, so B's final notes/e1RM can accompany A's weights even after B finishes loading. A late A response can also replace B's notes. EDIT still targets B, not the displayed A data. | Key detail/loading/error state by session ID and request generation; clear old detail on a new selection, discard stale responses, and make the grouped set arrays reactive (or remount them by detail identity). Test both sequential and reordered reads. |
| F20 | Medium; B06b delayed lift/month/day component/SQLite probes | `src/screens/History.tsx:391`, `431–449`, `495–519` | Late lift reads replace the current lift's list; late month reads erase the selected month's badges; late day-row builds put A's sessions under selected day B. Each async operation writes unkeyed global result signals without checking the current selection. | Use generation-keyed results for list mode/lift, month and selected day; publish only matching results, clear or explicitly mark old data while loading, and invalidate detail when its owning view changes. Include mode-switch and unmount coverage in the repair. |
| F21 | Medium; B06b injected DB/storage failures, expected nonzero diagnostic run | `src/screens/History.tsx:391`, `495–502`, `693–696` | Rejected initial roster query or denied optional `history-lift` storage read escapes as an unhandled rejection while saved sessions are presented as “No completed sessions yet.” No error/retry state explains the failure. Mode changes can retry a transient DB failure; a persistent preference-read failure continues blocking automatic selection. | Catch owned load promises, distinguish loading/error/empty states, expose retry, and guard optional lift-preference reads/writes as already done for view mode. Extend fault coverage to month/day/detail/PR loads without conflating this with startup F04. |
| L01 | Resolved into confirmed F07 | `src/db/seed.ts` and startup | Startup seeding risk mentioned; exact failure case unavailable. | Inspect seed idempotency, partial failure, and startup ordering; reject or substantiate. |
| L02 | Partly resolved into F14/F15 | `src/screens/Workout.tsx`; accessory components still pending B08 | Overlapping set saves and stale retries now reproduced. The earlier unspecified accessory-editing concern has not been independently recovered; F01 remains separate. | Use F14/F15 evidence for Workout save ordering; inspect remaining accessory component behavior in B08 without inventing missing historical evidence. |
| L03 | Resolved into confirmed F13 | `src/screens/Workout.tsx` and session/store logic | Completed workout can remain editable after reload and then be marked skipped. | Reproduce completion → reload → skip; record exact location, persisted state, and impact. |
| L04 | Lead with prior isolated probe | `src/service-worker.ts`; exact line pending | HTTP 503 navigation response appears to replace a good cached shell; later offline navigation returns the cached error. | Check response validation and cache writes; reproduce in browser where practical before final severity. |
| L05 | Lead; B05b caller inspection only | `src/screens/Workout.tsx:523–551`; `src/lib/cycle.ts:108–133`; TM modal callbacks | Post-session accept/dismiss callbacks are outside runFinishing; modal controls do not await/disable competing callbacks. Concurrent progression may use the same pre-transaction cycle snapshot. | B07/B08: probe rapid accept/dismiss and double acceptance with delayed DB writes; verify progression idempotency and modal error recovery before assigning severity. |
| L06 | Lead; B06a source inspection only, no injected failure | `src/screens/Today.tsx:43–71`, `113–122`, `135–148`, `174–192`; `src/components/workout/AccessoryPicker.tsx:118–143` | Today fires load/start without a catch or local error state; defaults load after startSession, and selection/cross-preview failures have no local recovery UI. The default-mode picker also swallows persistence failure before reporting a successful pick, while launch rereads the DB. Exact user-visible failure and retry outcomes remain unprobed. | In a separately authorized follow-up, inject failures at initial load, abandon/delete, session insert, default seeding, cross-preview, and default-picker persistence. Check partial state, promise ownership, recoverability and late settlement after navigation; keep B08 component review separate. |

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
| `src/lib/session.test.ts` | B05 | deep | B05b — full file; helper status/rollback evidence below |
| `src/lib/session.ts` | B05 | deep | B05b — full file; helper status/rollback evidence below |
| `src/lib/tm-recommendations.test.ts` | B07 | pending | — |
| `src/lib/tm-recommendations.ts` | B07 | pending | — |
| `src/lib/training-max.test.ts` | B07 | deep | B01b — app shell and training-max helpers (1/5); evidence below |
| `src/lib/training-max.ts` | B07 | deep | B01b — app shell and training-max helpers (1/5); evidence below |
| `src/lib/workout-compose.test.ts` | B07 | pending | — |
| `src/lib/workout-compose.ts` | B07 | pending | — |
| `src/main.tsx` | B01 | deep | B01a; full file; findings/evidence below |
| `src/screens/History.test.tsx` | B06 | deep | B06b — all 632 lines; 30 existing tests passed; test gaps and probes below |
| `src/screens/History.tsx` | B06 | deep | B06b — all 726 lines; F10 display evidence, F19–F21 confirmed; limits below |
| `src/screens/HistoryEdit.test.tsx` | B03 | deep | B03a — history editor and tests (4/5); evidence below |
| `src/screens/HistoryEdit.tsx` | B03 | deep | B03a — history editor and tests (4/5); evidence below |
| `src/screens/Settings.test.tsx` | B06 | pending | — |
| `src/screens/Settings.tsx` | B06 | pending | — |
| `src/screens/Setup.test.tsx` | B06 | pending | — |
| `src/screens/Setup.tsx` | B06 | pending | — |
| `src/screens/Stats.test.tsx` | B06 | pending | — |
| `src/screens/Stats.tsx` | B06 | pending | — |
| `src/screens/Today.test.tsx` | B06 | deep | B06a — all 368 lines; 22 existing tests passed; test gaps and controls below |
| `src/screens/Today.tsx` | B06 | deep | B06a — all 377 lines; F13 entry confirmed, F16–F18 confirmed, L06 recorded |
| `src/screens/Workout.test.tsx` | B05 | deep | B05b — all 1755 lines; 94 existing tests passed; evidence below |
| `src/screens/Workout.tsx` | B05 | deep | B05b — full file; F13 expanded, F14/F15 confirmed; evidence below |
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


### Historical checkpoint — continuation interrupted during B05b (resolved below)

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

### 2026-09-12 — B05b: session/resume and complete Workout slice

**Revision:** `eb3d7f908ebcbabb10c88cce93be00f3cfdaa2ed`. `git diff
f8026941549518159866831bba07012794b62007 HEAD -- src` was empty; prior application
evidence therefore remains applicable. Clean task worktree at start. Single agent
in the assigned Codex lane; no delegation, application edits, commits or pushes.

**Interruption point / scope:** The historical checkpoint above had reproduced
stale completed-session SKIP and run only 19 selected Workout tests. Neither helper
file nor either Workout file had full-file completion evidence. This continuation
closed exactly those four files, including the entire 1755-line Workout test file
(not merely the checkpoint's approximate “525+” lines).

| Completed file | Lines | Git blob |
|---|---|---|
| `src/lib/session.ts` | 1–43 | `efa391612222fbb72d04489e22df33516801deed` |
| `src/lib/session.test.ts` | 1–76 | `b705b8ca7d3d204d9dfee740f776d5984e2e47ea` |
| `src/screens/Workout.tsx` | 1–1089 | `d086b5c8bcc4bbe04770c34d40c19c81cf9eb7c3` |
| `src/screens/Workout.test.tsx` | 1–1755 | `abeb1457bca67c9ede8c17ccf396290188f9328c` |

**Behavior and invariants traced:**

- Both helpers: authoritative pending-row lookup, no-ID/missing/completed/skipped
  cases, child deletion order, transaction failure propagation and rollback. EXIT
  calls the status-guarded helper. Today's START calls reconciliation, but Workout
  does not; its loadData deliberately leaves completed rows editable. Comments at
  Workout:195–196 claiming COMPLETE is guarded and session:33–34 claiming Workout
  uses reconciliation are inaccurate. The transaction-local status read is useful
  but does not repair F05's globally shared transaction-depth isolation failure.
- Workout loading: session/lift fetch, dangling-row redirect, TM/template/cross-block
  loading and composition, movement-loading metadata, AMRAP/recent-history targets,
  exercise lookup. A missing lift returns without recovery; reads are fire-and-forget
  without catch, cancellation or session-generation checks. A late load can still
  publish stale data. These are explicit recovery/concurrency validation gaps, not
  additional reproduced findings. No deep completion is claimed for callee libraries.
- Every log/edit/delete handler, linear and cross cursors, optimistic state snapshots,
  ID assignment, rollback/retry closures, best-effort PR detection and rest ordering.
  F14 is a caller-level defect independent of F05: it reproduces with ordinary
  single-row writes, without overlapping transactions. Same-movement cross logging
  has the same rollback defect. Overlapping edits and finish-versus-pending-write
  outcomes remain regression cases for the same operation-lifecycle repair.
- Finish/skip/exit mutual exclusion, confirmation cancellation, accessory flattening
  (including duration/distance), note-only saves, transaction boundary, post-commit
  accessory/TM/cycle prompt sequence, accept/dismiss/deload/doubling callback wiring,
  store clearing and navigation. runFinishing protects only the three ending handlers
  while their promises are pending; it releases when a modal opens and does not guard
  the subsequent modal callbacks (L05). Completion/progression/delete rejections lack
  a local catch or failure banner; a failure after the completion transaction commits
  leaves stale pending store state and permits replaying that transaction (F13).
- Full render path: positional Index rows, type offsets, extra/legacy accessory slots,
  picker/history callbacks, section completion, joker/supplemental additions, segment
  accounting, reduced-motion-aware scroll handoff, notes, fallback and action controls.
  Cross rows use rebuilt reference-keyed sections; component-local edit/reset effects
  remain for B08, not an assumed functional failure. Week 4 checks here denote deload,
  not cycle completion; the latter delegates to the cycle helper's configured final week.

**Fresh checks and exact outcomes:**

1. `pnpm exec vitest run src/screens/Workout.test.tsx src/lib/session.test.ts`:
   **101/101 passed**, two files (94 Workout, 7 session), exit 0. This command first
   populated this worktree's node_modules from the existing pnpm store; no tracked
   manifest or lockfile changed. Inspected every test, not just test names or counts.
2. Created a disposable `git archive HEAD` source copy at
   `/tmp/training-review-b05b-0ltRmW`, symlinked task-worktree node_modules, and added
   only `src/screens/review-b05b.test.tsx` plus temporary config adjustments there.
   Initial execution with the temporary directory as Vite root failed before tests:
   external symlinked jest-dom resolved as an invalid `/@fs/...` module. Setting the
   temporary config's root to the task worktree, explicit absolute test/setup paths,
   and fs allow entries for both directories corrected harness resolution.
3. `pnpm exec vitest run --config /tmp/training-review-b05b-0ltRmW/vite.config.ts
   --reporter=verbose`: **8/8 passed**, exit 0. Seven assertions deliberately describe
   current bugs, not fixes. One control covers helper protection and rollback. The
   undo/delayed-add probe also emitted Solid's “computations created outside a
   createRoot or render will never be disposed” warning; no unhandled-error failure.

**Reproduction recipes / confirmed effects:**

- **F13 / SKIP:** completed SQLite session + stale pending store copy; render actual
  Workout, wait for LOG, open session options, SKIP LIFT → SKIP. Navigation succeeds;
  persisted status is now skipped. Reconfirms the prior probe.
- **F13 / COMPLETE:** completed session dated 2026-01-06 with saved notes and one
  accessory set; restore stale pending store with the same accessory set, render,
  FINISH. DB now contains two accessory rows, original notes become empty and date
  changes. Thus COMPLETE is not protected, despite its loadData comment. No duplicate
  note was needed; on migrated databases a repeated nonblank accessory note can
  instead fail the unique index and roll back the second transaction (source trace,
  not separately fault-probed). Terminal-state reconciliation plus an idempotent
  save/post-save phase is required; a plain preflight check alone cannot prevent races.
- **F14 / overlap:** defer the first db.sets.add, click the next active LOG and wait
  for its real SQLite ID, then reject the first. Store retains set 1 without an ID
  while SQLite contains only successfully saved set 2. Repeat within a Squat cross
  block: same result, independent of the linear cursor. Rollback pops the latest
  entry rather than the failed operation; the following cursor/undo/edit are wrong.
- **F14 / undo:** defer add, LOG then undo → yes, then release the real insert.
  Cursor stays at zero but SQLite contains the supposedly undone set; the late ID
  assignment has no corresponding valid logged-set data. Gate dependent actions or
  track pending operations by stable identity rather than mutable array positions.
- **F15 / same session:** fail LOG once, use ordinary LOG successfully, then press
  the still-present RETRY. SQLite has two set-number-1 rows, cursor is two, store
  slot 0 now has the retry row ID and appended slot 1 has none. The callback retained
  index zero but appends at the current tail. A successful ordinary LOG did not retire it.
- **F15 / next session:** fail LOG, EXIT through real confirmation, unmount, create
  session 2 and mount it, press the old banner's RETRY. The callback from session 1
  writes into session 2 because handleLog reads the current activeSession. The banner
  is global/unfiltered; clearSession does not clear its callbacks. Bind retry to the
  original session and operation, not merely to the old component closure/index.
- **Positive helper control:** completed/skipped sessions retain their child rows;
  missing ID is harmless. Inject a pending session deletion failure after child
  deletes; the transaction rejects and restores both session and children in SQLite.

**Test assessment / remaining validation:** Existing tests cover normal logging,
undo, templates/cascades/remounts, finish prompts, confirmation exclusion and one-shot
save/edit failure and immediate retry. Some branch tests only check cursor/count or
“no crash,” several comments reference obsolete line numbers/algorithms (including
an Epley formula comment although production uses Wathan). They omit stale COMPLETE/
SKIP, in-flight mutation ordering, retry after manual progress or session change,
post-commit failures and competing modal callbacks. Disposable probes fill the
specific evidence gaps above; they are not retained application regression tests.

Dependency reads were limited to relevant caller/callee contracts: Today:125–148,
workout-store mutation helpers, save-failure store/banner, SetRow callback wiring,
SessionBar finish control, TM modal callbacks, cycle:103–135 and schema note index.
Those files are not newly marked deep. F05/F06 production-client findings remain
open; Vitest aliases the client and does not test real Worker/OPFS timing, timeouts,
browser reload hydration, cross-tab behavior or browser modal interaction. No full
repository suite, lint, build or browser E2E was run for this documentation-only
review. F12 was not reprobed, as instructed.

**Outcome / exact next action:** B05b completes without a blocker; “complete” means
the bounded review, not bug resolution. Four partial ledger rows become deep;
F13 expanded, F14/F15 confirmed, L02 partly resolved, L05 recorded for B07/B08.
All four selected files have full-range evidence, with cross-file checks explicitly
carried forward. Only this tracker changed in the task worktree. Request operator
review of this handoff; do not mark the Kanban card accepted. Stop here. The next
review session should start B06a (Today and tests); repository-wide review remains
unfinished.

#### B05b review-response verification

The four requested handoff confirmations are recorded:

1. HEAD and the tracker remain pinned to
   `eb3d7f908ebcbabb10c88cce93be00f3cfdaa2ed`. Fresh `git hash-object`
   checks match all four blobs above, both in the task worktree and disposable
   probe copy; the application-source diff is empty.
2. F14/F15 remain confirmed high-severity findings for separate remediation,
   as acknowledged by the coordinator. Neither is fixed by this review-only task.
3. L05 remains unreproduced and belongs to B07/B08 validation; it does not block
   closure of the bounded B05b review.
4. In-process SQLite is not production Worker/OPFS coverage. Disposable probes
   remain under `/tmp`; F05/F06 remain open. Full-suite, lint, build, browser E2E,
   real reload/cross-tab and production storage checks were not run.

Both commands under **Fresh checks and exact outcomes** were rerun after review:
101 existing tests and 8 disposable probes passed again (exit 0). The same Solid
disposal warning appeared in the delayed-add/undo probe. Seven probes reproduce
defects; passing them does not mean the application is repaired. `git diff --check`
passed. No application changes, commits or pushes. The assigned worker's lifecycle
requires a native human-review handoff rather than marking the card accepted.

### 2026-09-12 — B06a: Today session selection, start/resume/abandon and tests

**Revision:** `6368a06796f72bfb4868b20243e3146de499ffe6`. Clean assigned worktree
at start, branch `training-log/t_4c88123b-b06a-deep-code-review-batch-next-tracker`.
`git diff eb3d7f908ebcbabb10c88cce93be00f3cfdaa2ed HEAD -- src` was empty.
The earlier application evidence remains applicable; no B05 full-file review was
reopened. One agent in the authorized Codex lane; no delegation or product fixes.

**Interruption point / scope confirmation:** Read the full 754-line tracker at this
revision, including the historical B05b interruption and its resolved continuation.
The card's 593-line description was historical, not this file's current length.
The Resume here section explicitly queued Today and its tests as B06a. B05b had
already closed all four session/Workout files, expanded F13 to COMPLETE, confirmed
F14/F15 and carried L05 forward. No new B06a interruption existed to recover.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/screens/Today.tsx` | 1–377 | `ac2cb6a5115a24dc2cb6c7f3136bcb2d0b6ecbc3` |
| `src/screens/Today.test.tsx` | 1–368 | `c4444aa879fd8bbe5c5ca4e3da7392bd0c21de23` |

**Behavior and invariants traced:**

- Initial load: next-slot lookup/cycle-advance side effect, ordered non-archived
  roster, week/cycle/lift selection, pending-row precedence over old terminal rows,
  TM/default loading and final loading-state release. The status rule matches the
  reopened-week contract. Multiple terminal rows use the first returned row, not
  an explicit newest ordering; completed-versus-skipped redo display remains a
  lower-priority ambiguity rather than an additional confirmed finding.
- Every start branch: same-lift **and** same-cycle/week check; authoritative pending
  reconciliation; dropping stale references; abandon confirmation and status-guarded
  child deletion; reuse of an existing pending attempt; completed/skipped redo
  confirmation; draft insert; store reset; fixed-slot seeding; navigation. Confirmed
  cancellation does not create a redo, and pending deletion precedes replacement.
  Abandon and redo are separate decisions: accepting abandon deletes the old attempt
  before a later redo confirmation, so cancelling redo does not undo that accepted
  deletion. The start operation is neither single-flight nor awaited through
  launchSession (F16/L06). Reusing a pending row is not equivalent to restoring its
  saved progress (F18).
- Every selection/render path: selected chip identity and persistent status colours,
  no-TM warning/disabled control, top main set and AMRAP marker, collapsed warmup/main
  disclosure, self/cross supplemental previews, assistance slots, default picker and
  active-session banner. Week 4 checks denote deload, not a hardcoded cycle length.
  Cross preview delegates effective-week/weight calculations to existing helpers,
  orders blocks, skips missing movements and uses the movement TM; it is resource-keyed
  by lift/week/deload mode, unlike the unguarded TM/default awaits (F17). Numerical
  boundary validation remains B07. The RESUME anchor is a separate entry that bypasses
  handleStart altogether (F13).
- Limited dependency traces, **not newly deep files**: cycle next-slot and week-owed
  rules (`cycle.ts:24–37`, `206–262`), assistance defaults/picks (`assistance.ts:91–120`,
  `147–181`), confirmation request/response ownership, training-max lookup, store
  reset and accessory construction, Workout's load/composition/LOG contracts,
  default-mode picker persistence/callbacks (`AccessoryPicker.tsx:118–165`), schema
  session/set identity, JSON export table reads and Settings import's clearSession.
  No uniqueness constraint prevents the reproduced duplicate session/set inserts.

**Fresh checks and exact outcomes:**

1. `pnpm exec vitest run src/screens/Today.test.tsx src/lib/session.test.ts`:
   **29/29 passed**, two files (22 Today, 7 session), exit 0. pnpm populated this
   worktree's node_modules from its existing store; no manifest/lockfile changed.
2. Archived tracked `src`, package.json and all four tsconfigs from HEAD into the
   disposable worktree-local `.review-b06a-IFGvnu` directory; symlinked this task's
   node_modules. Added only a temporary probe and minimal Solid/Vitest config there.
   Config retained the assigned worktree as root, explicit absolute probe/setup
   paths, both fs allow entries and the existing in-process SQLite alias. Copied
   Today source/test blobs matched the originals above before probing.
3. `pnpm exec vitest run --config .review-b06a-IFGvnu/vite.config.ts --reporter=verbose`:
   initial **8/8 passed**, then **10/10 passed** after adding two abandon controls,
   exit 0 both times. Final run is **6 bug assertions + 4 positive controls**, not ten
   repaired behaviors. The real-router link probe emitted jsdom's “Not implemented:
   Window's scrollTo() method” warning; no failed tests or unhandled-error report.
4. A verbose existing-test rerun while the disposable source directory was visible
   to normal discovery ran **58/58 across four files**, exit 0: it included duplicate
   copies of both selected test files, **not additional unique coverage**. Moved the
   disposable copy into ignored `node_modules/.cache/review-b06a-IFGvnu`, then reran
   `pnpm exec vitest run src/screens/Today.test.tsx src/lib/session.test.ts
   --reporter=verbose`: **29/29 across exactly two files**, exit 0.
5. `git diff --check` passed; tracked diff and status name only this tracker. The
   ledger count is **27 deep rows**, including the two newly closed Today rows.
   Disposable files are excluded from the commit. To rerun their exact config in
   this worktree, move the ignored copy back to `.review-b06a-IFGvnu`, execute command
   3, then return it to the ignored cache before using normal test discovery. This
   local cache is disposable; the revision and reproduction recipes below are the
   durable evidence, not a promise of permanent probe-file availability.

**Reproduction recipes / findings:**

- **F13, High, expanded entry evidence:** Persist a completed OHP row; put its stale
  pending copy in workout.activeSession; mount real Today and Workout routes under
  the actual Solid Router. Click SESSION IN PROGRESS — RESUME. The path changes to
  `/workout`, LOG renders, the store still says pending and the DB still says
  completed. Only useNavigate is mocked for imperative handlers; the anchor's
  router transition is real under jsdom. B05b remains the evidence for subsequent
  destructive SKIP/COMPLETE effects; those finish probes were not rerun here.
- **F16, Medium, confirmed:** Start with no sessions. Defer db.sessions.add before
  the real insert, click START twice, wait for both calls, then release. Two pending
  rows and two navigation calls result. Mark the active attempt completed and add
  completed rows for the other active lifts; the real next-slot helper still returns
  the original lift/week because the other pending attempt remains. No overlapping
  transaction is needed, so this is independent of F05. Cross-tab duplication and
  late seeding into another session are remaining lifecycle checks, not probed facts.
- **F17, Medium, confirmed in three probes:** With OHP TM 200, Bench TM 300 and no
  Deadlift TM, defer Deadlift's TM read, select Deadlift then Bench, settle Bench and
  release Deadlift. Bench stays selected but displays “No training max set for Bench”
  and START is disabled despite its real TM of 300. Separately, select Deadlift and
  START before its read resolves: a pending Deadlift row is created and navigation
  succeeds even though its authoritative TM is zero. Finally, give Deadlift and
  Bench distinct push defaults and valid TMs; defer Deadlift's default response,
  select Bench, then release. Bench displays Deadlift's pick while its persisted
  default is unchanged. These prove stale reads/UI gating, not wrong DB default
  writes or incorrect Workout weights (Workout rereads its own TM).
- **F18, High, confirmed:** Seed one pending session with a saved warmup set 1 and
  an empty workout store. START reuses that session ID but leaves loggedSets empty
  and currentSetIndex zero. Unmount Today, mount actual Workout and click LOG: SQLite
  now has two warmup/set-number-1 rows, while the store knows only the new row. The
  original saved row was **not deleted**; recovery hides progress and corrupts set
  identity by duplication. Source-traced reachability: JSON export includes pending
  sessions/sets (`export-import.ts:23–43`) but not the workout store, and Settings
  clears that store after import (`Settings.tsx:459–467`). The probe seeds the
  equivalent persisted/local state; it does not exercise the Settings import UI or
  a browser reload. The linear-set recovery defect is confirmed with a warmup;
  main/cross/notes/accessory recovery needs explicit regression coverage in the fix.
- **Positive controls:** A genuine persisted same-slot pending session resumes with
  its logged-set ID and cursor intact, without another session insert. START against
  a stale completed copy clears the reference and asks REDO; cancelling preserves
  the completed row and saved set. Accepted abandon of a pending session deletes
  its session, sets, accessory sets and accessory notes before launching the selected
  lift. Accepted abandon of a different stale completed session preserves its
  completed status, saved set and accessory note while starting the new lift.
- **L06, unconfirmed lead:** Error/partial-start and default-persistence behavior is
  source-inspected only. No rejected-load, rejected-abandon, seeding-failure or picker
  write-failure test was run; do not promote those potential effects to confirmed bugs.

**Test assessment / residual risk:** Read every line of Today.test.tsx. Existing
tests cover basic rendering, status chips/reopening, deload label, no-TM display,
cross-block presence, pending reuse, abandon and redo decisions. The “active session
matches” test seeds only a store reference, not the claimed DB row; navigation alone
does not prove resume rather than fresh launch. Several abandon tests select a lift
with no TM and immediately click the still-enabled START, inadvertently depending
on F17's timing window. Pending-reuse coverage checks only the session ID, not saved
set/cursor hydration; banner coverage checks presence, not reconciliation. beforeEach
omits exercise/accessory/default/notes/settings table resets, so expanded tests need stronger
isolation. No existing overlapping-start/selection, persisted-progress recovery,
three-week Today rollover, archived-roster, comprehensive preview or local failure
coverage was established. Disposable probes fill only the explicitly recorded gaps.

Production Worker/OPFS, real browser reload and cross-tab ordering remain untested;
F05/F06 and prior findings remain open. No full repository suite, lint, typecheck,
build or browser E2E was run for this documentation-only batch. No changes to the
selected source files or retained application tests, and no finding is fixed.

**Outcome / exact next action:** B06a completes cleanly without a review blocker;
both selected files are closed with full-range evidence. Three findings added,
F13's Today entry substantiated, L06 recorded. Commit only this tracker and request
native operator review; do not mark the Kanban task accepted. The card explicitly
requires post-review operator confirmation for push/PR, so publication has **not**
occurred in this phase. After acceptance and publication confirmation, push the
documentation branch and open its PR. Next review slice: B06b, History.tsx and
History.test.tsx as specified at the top; do not begin it here. Repository-wide
review remains unfinished. **hotspot: docs/deep-code-review.md —** this card owns
the continuation; serialize other tracker edits until its branch is reconciled.

### 2026-09-12 — B06b: History lists, calendar, detail, charts and tests

**Revision:** `20d38c3ae099293a5dd3a036f0dad395d755e28e`. Clean assigned worktree
at start, branch `training-log/t_8f0dedfd-deep-code-review-batch-per-docs-deep-cod`.
`git diff f8026941549518159866831bba07012794b62007 HEAD -- src` was empty;
the diff from B06a's revision contained only `.gitignore` and this tracker. Existing
deep application evidence, including B03a HistoryEdit, is unchanged and was not
reopened. Origin/main matched this revision at publication preflight. One agent in
the authorized Codex lane; no delegation, application edits or retained test edits.

| Completed file | Lines | Git blob |
|---|---|---|
| `src/screens/History.tsx` | 1–726 | `739a09444fe21126e1a0d3d06f5d9d19611f6816` |
| `src/screens/History.test.tsx` | 1–632 | `1ebf04247ca22aad4708452df09d9fda53be8e89` |

**Behavior and invariants traced:**

- Entire chart implementation: local dates, month arithmetic, clamped Catmull–Rom
  controls, empty/single/equal-date and equal-weight guards, primary flat extension,
  secondary path, deduplicated date ticks, coordinate scaling and point toggling.
  Curve controls remain inside each segment's bounding rectangle; only real points
  are smoothed. Primary TM and reversed session e1RM input are ascending by date.
  Wathan and high-rep discount are delegated to calc, not rederived here. The header
  hides zero-weight/zero-rep AMRAP summaries while the chart includes non-null zeros;
  active tooltip state is not reset on new data. These are unprobed chart consistency
  notes, not new confirmed findings. No graphical/browser/accessibility pass claimed.
- Session row identity, fold semantics, panel IDs, EDIT URL, reactive save-gap lookup,
  PR badge, notes and note-only accessories, exercise fallback names/modal arguments,
  grouped lift-set rendering and settings-dependent e1RM. F19 demonstrates that
  correct row/route identity alone does not ensure the displayed detail is its own.
  F10 extends to read-only History because the display order also excludes cross.
  Text interpolation does not introduce raw HTML from saved notes/exercise names.
- All load branches and preferences: mode read/validation and guarded mode writes,
  URL lift precedence, stored lift fallback, active/archived chip visibility, ordered
  lift lookup, TM lookup, completed-only list queries, newest-first date sort, AMRAP
  join and orphan-name fallback. Optional lift storage is unguarded unlike mode
  storage (F21); stored/URL IDs are parsed but not checked against the roster. A stale
  stored ID or hidden archived selection can produce an unselected-looking filter;
  automatic fallback and same-route search-param changes need regression coverage.
  Multiple AMRAP rows use the last returned row without an explicit best/latest
  rule; ordinary Workout cross rows are not AMRAP, so cross overwriting the AMRAP
  summary is **not** established. Duplicate/imported AMRAP policy remains B07 work.
- Calendar: completed-only inclusive local-month bounds, Sunday-aligned padded grid,
  outside-month disabled cells, today/selected states, density classes, day grouping,
  inline day rows and empty message. Month/day result identity is not bound to the
  selected header (F20). Within-day rows retain query order rather than applying the
  list's newest-first sort; equal-time list ties also have no explicit ID rule.
  No separate ordering bug is claimed without an agreed same-day ordering contract.
- PR loading runs once per mount over completed sessions and successful working
  sets; cross performance is attributed to its movement, badge to its parent
  session. Views share that set of IDs. PRs and list data are separate snapshots;
  there is no DB subscription. Ordinary editor navigation remounts History through
  distinct routes; a controlled remount after persisted changes refreshes the list.
  Concurrent external writes, live settings changes and production bfcache remain
  untested rather than presumed to refresh automatically.
- Limited dependency contracts, **not additional deep rows**: existing DB query/
  serialization evidence; `LiftSetsByType.tsx:19–48` and SetReadout prop rendering;
  calc's type-order constants and estimated1RM signature; `performance.ts:10–11`;
  `pr.ts:40–68`; date-format helpers; `save-failure-store.ts:105–106`; RecordsPanel's
  load path/archived filtering; Workout's logged `isAmrap` fields; App's History/edit
  routes and HistoryEdit's return URLs. RecordsPanel's own status filtering and
  async identity remain B08 questions, not silently completed by this caller review.

**Fresh checks and exact outcomes:**

1. `pnpm exec vitest run src/screens/History.test.tsx`: **30/30 passed**, exactly
   one file, exit 0. pnpm populated worktree node_modules using existing store
   packages; no manifest or lockfile changed. Read every test line, not only names.
2. Archived HEAD's `src`, package.json and all tsconfigs into
   `/tmp/training-review-b06b-XCQJv4`; symlinked this worktree's node_modules. A
   minimal Solid/Vitest config retains the task worktree as root, absolute temporary
   test/setup paths, both fs allow entries and the in-process SQLite alias. Source
   and test blob checks in the copy matched the table above. Only disposable files
   were written outside the assigned worktree, as permitted by the batch rules.
3. `pnpm exec vitest run --config /tmp/training-review-b06b-XCQJv4/vite.config.ts
   --reporter=verbose` initially passed **8/8**, exit 0. The later fault file is
   selected separately; the final ordinary-probe command uses the exact
   `review-b06b.test.tsx` filter. Six checks assert faulty behavior, two are positive
   controls. RecordsPanel and ExerciseHistoryModal are stubbed to bound scope;
   History, row/set rendering, Solid Router context and SQLite are real. Imperative
   navigation is a spy, not a browser transition. The F10 fixture was strengthened
   to establish that the displayed PR is specifically attributable to cross work.
4. `pnpm exec vitest run --config /tmp/training-review-b06b-XCQJv4/vite.config.ts
   review-b06b-failure --reporter=verbose`: **2 behavioral assertions passed, but
   command exited 1 with 2 expected unhandled rejections**, at History:496 and :499.
   This is deliberate failure-path evidence, **not a passing regression gate** and
   not a harness-resolution failure. The injected errors were not suppressed.
5. Final `pnpm exec vitest run --config
   /tmp/training-review-b06b-XCQJv4/vite.config.ts review-b06b.test.tsx
   --reporter=verbose`: **8/8 passed**, exit 0, including the strengthened F10
   fixture, with no unhandled-error report. `git diff --check` passed; only this
   tracker changed, selected source blobs still matched and no untracked files
   belonged in the PR. `python /tmp/training-review-b06b-XCQJv4/audit.py` verified
   **179 ledger rows, 29 deep, zero duplicate paths and zero unlisted tracked files**
   after applying the documented tracker/generated-status exclusions.

**Reproduction recipes / confirmed effects:**

- **F19 / ordinary sequential selection:** Seed completed Bench A with a 111lb main
  set and A-notes, and B with a 222lb main set and B-notes. Expand A and await its
  notes, then expand B directly. After B-notes arrive and continuations drain, B's
  panel still displays 111lb, not 222lb. Its EDIT handler targets B; SQLite B remains
  222lb. Root cause spans two sites: History keeps A's detail when setting expanded
  to B, and LiftSetsByType captures `typeSets` once in the reference-keyed type loop.
  B's arriving detail keeps the same `main` key, so that array does not refresh.
  Positive control: explicitly collapse A before expanding B; B correctly shows
  222lb. No timing injection is needed for this persistent wrong-weight display.
- **F19 / reordered detail:** Defer db.sessions.get(A), expand A then B and await
  B-notes. Release A: A-notes now appear inside B's still-expanded panel. A is folded.
  Both the request identity race and nonreactive child grouping need coverage; merely
  making the child reactive does not solve a late response from the wrong session.
- **F20 / lift:** Fully load Bench; defer OHP's trainingMaxes sortBy, select OHP,
  select Bench again and let Bench settle, then release OHP. The highlighted chip
  stays Bench but only OHP's session row is present. **Month:** with sessions in
  adjacent months, defer the Previous month's query, click Next and let the current
  month settle, then release Previous. Current header stays in place but its saved
  session badge disappears; both persisted sessions still exist. **Day:** defer
  day A's AMRAP join, select day B and await B's row, then release A. B stays selected
  while A's session replaces B's row. The probes assert final UI identity and real
  persisted state where relevant, not simply promise completion. Mode-switch races
  and settlement after unmount were source-traced only, not separately exercised.
- **F10 / hidden work:** Seed an earlier 444lb Bench performance, then a weaker
  111lb Bench session containing a first OHP cross performance of 333lb. The current
  session gets a PR badge from OHP's baseline record despite not beating Bench.
  Expand it: 111lb main is visible, but neither 333lb nor a Cross section appears.
  The cross row remains in SQLite. B03a remains the evidence for inability to edit
  cross rows; no editor probe was rerun and no deletion is alleged.
- **F21 / failure states:** With one completed session, reject only the initial
  lifts.orderBy('order').toArray call. The screen claims no completed sessions,
  exposes no alert/retry and leaves the saved row intact; changing to By date retries
  successfully. Separately throw from localStorage.getItem only for `history-lift`:
  the same false empty display persists despite healthy SQLite. Vitest reports each
  rejected load as unhandled. This validates two initial-load failures only; PR,
  month, selected-day, detail, exercise-name and preference-write rejection UI still
  need targeted regression tests. No real-browser storage denial was exercised.
- **Refresh/ordering control:** Seed completed sessions out of chronological order
  plus newer pending/skipped sessions. By date shows only completed rows newest
  first across lifts. Unmount, update the oldest completed date/notes and delete the
  newest row, then remount: order, notes and membership reflect SQLite. This models
  post-edit state, not the actual editor UI, browser Back or cross-tab invalidation.

**Test assessment / remaining risk:** The 30 existing tests cover chart legends,
degenerate input presence, basic expansion/collapse, notes/accessories, EDIT URL,
mode and lift selection, orphan names, current-day styling and density badges.
Many checks target branch execution or text presence rather than exact values;
the initial empty-state test can pass before loading, URL/storage tests select the
first lift anyway, and “expand one of two” never switches directly between them.
No existing test covers reordered loads, storage/read failure, chart geometry/
interaction, remembered mode validation, archived filter recovery, cross visibility,
PR attribution, numeric set order or remount after edits. Several suites omit
accessory/exercise table resets; expanded probes use explicit synthetic isolation.

No full repository suite, lint, typecheck, build or browser E2E was run locally for
this documentation-only batch. Production Worker/OPFS, RPC failure timing, multi-tab
changes and real browser navigation are not covered by in-process SQLite/jsdom.
F01–F21 remain open findings, not fixes. Cross-file questions above are explicit
follow-up coverage limits; B06b has no external blocker and closes only two files.

**Outcome / exact next action:** Two History ledger rows become deep, bringing the
total to 29; F19–F21 added at Medium, F10 expanded without duplicating its ID. Only
this tracker belongs in the commit/PR. This card explicitly authorizes publication,
unlike B06a's earlier pre-publication phase. Request native operator review after
push/PR verification; do not mark the card accepted or merge the PR. Stop this
bounded batch. Next session: B06c Setup and tests at the top; repository-wide review
is unfinished. **hotspot: docs/deep-code-review.md —** serialize other tracker edits
until this continuation is reconciled.
