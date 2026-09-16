# Deep code review — fix ledger

**State of every finding opened by `docs/deep-code-review.md`.** That document is the
evidence record and is **frozen**: it explains why each finding exists, and its
central claim is that no application or test file was changed during the review.
Writing fix state into it would corrupt that claim. This document is the state.

## Totals

| | Count |
|---|---|
| Findings | **101** (F01–F101; F95–F101 opened during fix work) |
| `open` | **23** |
| `wip` | 0 |
| `fixed` | **75** — F01, F02, F03, F04, F05, F06, F07, F08, F13, F14, F15, F16, F17, F18, F22, F24, F25, F26, F27, F28, F29, F30, F31, F32, F33, F34, F35, F36, F37, F38, F41, F42, F44, F45, F47, F49, F51, F52, F54, F55, F56, F57, F58, F59, F60, F61, F63, F64, F65, F66, F67, F69, F71, F73, F74, F75, F76, F77, F78, F79, F84, F85, F86, F87, F89, F90, F91, F92, F93, F94, F95, F96, F97, F99, F101 |
| `fixed-by` | **3** — F43, F62, F98 |
| `wontfix` | 0 |
| `blocked` | 0 |

**By severity: 14 High / 52 Medium / 35 Low.**

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
| C1 | No single-flight guard on an async `onClick` | F33 ✅, F34 ✅, F41 ✅, F51 ✅, F55 ✅ — **cluster closed** | **F33** (done) — the guard belongs in `Modal` as `busy?: boolean` (settled in B08a; a per-call-site guard cannot close the Escape path) |
| C2 | Single-slot or snapshotted state standing in for per-item state | F51 ✅, F52 ✅, F54 ✅, F55 ✅, F57 ✅, F63 ✅ — **cluster closed** | None — per-file fixes |
| C3 | State seeded once and never re-synced, or re-synced over the user | F49 ✅, F54 ✅, F56 ✅, F63 ✅ — **cluster closed** | None — `DurationInput.tsx:18-23` is the counter-example done right |
| C4 | Cleanup or a default bound to something that can stop existing | F57 ✅, F58 ✅, F62 ✅ — **cluster closed** | None — per-file fixes |
| C5 | Uneven keyboard and screen-reader access | F59 ✅, F60 ✅, F61 ✅, F64 ✅ — **cluster closed** | None — in each case a neighbouring file did it correctly |
| C6 | Unvalidated external data written to durable storage or trusted as control flow | F03 ✅, F08 ✅, F65 ✅, F66 ✅, F67 ✅ — **cluster closed** | **F65** for the service-worker half (F65/F66 are the same `response.ok` gate) |
| C7 | A change made and its description not updated | F76 ✅, F84 ✅, F89 ✅, F90 ✅, F91 ✅, F92 ✅, F93 ✅ — **cluster closed** | None — independent doc edits |

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
| F01 | **High** | B03 | — | `src/screens/HistoryEdit.tsx` | `fixed` | `50dd4ba` · `HistoryEdit.test.tsx` chained-swap case | **Ordering, not deletion.** `persistAccessory` deleted its own `originalExerciseId` rows and then wrote its replacements, per card in sequence — so a swap chain (card A goes B→C while card B goes A→B) had one card's cleanup delete rows another card had just written. Split into two passes: every replaced original is cleared before anything new is written, which removes the ordering dependence entirely. |
| F02 | **High** | B01 | — | `src/db/sqlite.worker.ts` | `fixed` | `5358262` · `startup.test.ts` F02 case + browser probe | The worker already reported `persistent: false` correctly; nothing read it. Startup now treats it as an outcome the caller must handle and shows a blocking **STORAGE UNAVAILABLE** screen with RELOAD / CONTINUE WITHOUT SAVING — the explicit temporary-mode acknowledgement the finding asked for. Verified in a real browser by patching the built worker to report non-persistent. |
| F03 | Medium | B04 | C6 | `src/lib/export-import.ts` | `fixed` | `fe36572` · `export-import.test.ts` ×2 | `hasDeloadWeek` added to the settings column allowlist. It survived neither export nor import, and the restored null defaults to **enabled** — silently turning a three-week cycle into a four-week one, which is the shape the whole program hangs off. Round-tripped both ways in the tests. |
| F04 | **High** | B01 | — | `src/db/sqlite-client.ts` | `fixed` | `5358262` · `rpc.test.ts` ×5, `startup.test.ts` ×6 | Worker `onerror`/`onmessageerror` now reject readiness and every pending call; `init` has a 30s deadline; a dead worker rejects later calls instead of queueing against it. `main.tsx` has a catch and renders a **COULDN'T START** screen with RETRY. Verified in a real browser by 404ing the worker script: the page reaches the error screen instead of sitting on LOADING. |
| F05 | **High** | B01 | — | `src/db/sqlite-client.ts` | `fixed` | `f3e2a6d` · `transaction.test.ts` ×3 | **Root cause was the inference, not the arithmetic.** A depth counter cannot tell a nested call from an unrelated concurrent one once the outer body has awaited. Fixed by removing the question: `transaction()` now serializes, and `bulkAdd` no longer opens one of its own, so nothing nests. `txDepth` deleted. |
| F06 | Medium | B01 | — | `src/db/sqlite-client.ts` | `fixed` | `f3e2a6d` · `transaction.test.ts` ×2 | Deleted with the counter it corrupted — there is no depth to get stuck above zero. BEGIN now runs inside the queued turn, and the queue is handed on in a `finally` even when a caller never got a turn. |
| F07 | **High** | B02 | — | `src/db/seed.ts` | `fixed` | `50dd4ba` · `seed.test.ts` ×5 | Lifts are seeded only into a genuinely **empty** table. Re-seeding whenever the count was below `LIFTS.length` treated a short roster as a partial seed — but a smaller roster is a supported onboarding choice, so those users had their survivors deleted and the defaults re-created with **new ids** on every startup, orphaning the training maxes and sessions that referenced them. An existing test pinned the old behaviour and was deliberately inverted. |
| F08 | **High** | B04 | C6 | `src/lib/export-import.ts` | `fixed` | `fe36572` · `export-import.test.ts` ×4 | `validateImportShape` now establishes the file **is** a backup before anything destructive runs. It only inspected tables that were present, so a document carrying none of them passed completely and the import then cleared every table and restored nothing. Settings did ask for overwrite confirmation — about a file never established to be a backup. **One** recognised table is the bar, deliberately: a sparse or legacy backup still imports; a file with no recognised table at all does not. |
| F09 | Medium | B04 | — | `src/lib/export-import.ts` | `open` | — | — |
| F10 | Medium | B03 | — | `src/screens/HistoryEdit.tsx` | `open` | — | — |
| F11 | Medium | B04 | — | `src/store/settings-store.ts` | `open` | — | — |
| F12 | Medium | B05 | — | `src/store/workout-store.ts` | `open` | — | — |
| F13 | **High** | B05 | — | `src/screens/Today.tsx` | `fixed` | `1b793dc` · `session.test.ts` ×5, `Workout.test.tsx` ×4, `Today.test.tsx` ×3 | **The store outlives its row, so every path that acts on it has to ask the row.** A kill during the post-complete modal chain leaves the store saying `pending` over a finished session — the chain never reassigns `activeSession`, so that is what it says throughout. SKIP rewrote a completed workout as `skipped`; COMPLETE appended a second copy of every accessory set and overwrote the saved date and notes; Today's RESUME banner was a plain `<A href>` that walked past the reconciliation START already did. `finalizePendingSession` holds the status check and the writes in one transaction and reports whether this call ended the session. COMPLETE keeps its post-commit phase resumable: on an already-completed row it skips the save and still offers the TM prompts and the cycle roll-up, which is exactly what a killed chain interrupts. |
| F14 | **High** | B05 | — | `src/screens/Workout.tsx` | `fixed` | `34188d4` · `serial-queue.test.ts` ×6, `Workout.test.tsx` ×3 | **Serialized rather than identified.** Log, edit and undo share a positional model — `loggedSets[i]` is plan position `i`, and a rollback means "remove the last one" — which is only true with one mutation in flight. A failed earlier LOG popped a *later* successful set; an undo racing an insert ran before the row id came back, deleting nothing and orphaning the row. All set mutations now run through one `createSerialQueue`, and `runFinishing` drains it before COMPLETE reads the store or flips the status. Per-operation ids were the alternative; serializing wins because a hole in a positional list has no honest representation, and these are single-row local writes. |
| F15 | **High** | B05 | — | `src/screens/Workout.tsx` | `fixed` | `34188d4` · `Workout.test.tsx` ×3, `SaveFailureBanner.test.tsx` ×3 | **A retry is bound to what it meant, not to where it sat.** RETRY replayed a positional handler against live state: after a manual LOG it duplicated the slot and misassigned the row id, and after an EXIT it wrote the old set into the new session, because the closure read `workout.activeSession` at replay time. Each retry now captures its session; a log retry applies only while the cursor is still on its slot, an edit retry re-finds its row by database id. The banner is scoped to the session on screen and withdraws a superseded retry, saying so. The gap records stay unscoped on purpose — they outlive the session so History can flag it. |
| F16 | Medium | B06 | — | `src/screens/Today.tsx` | `fixed` | `7ef055f` · `session.test.ts` ×6, `Today.test.tsx` ×2 | **Both halves, because a component flag only covers one.** `startOrResumePendingSession` does the read and the create in one transaction, so a second tab loses the race instead of creating a second row; `useSingleFlight` covers the second tap and disables the button while held. `launchSession` is awaited rather than `void`-ed — that `void` was the window. Existing installs already carry duplicates, so the helper recovers them: the attempt with the most logged sets wins, ties break on oldest id so the choice is stable, losers are retired as `skipped` rather than deleted. |
| F17 | Medium | B06 | — | `src/screens/Today.tsx` | `fixed` | `7ef055f` · `Today.test.tsx` ×3 | **Selection generation.** TM and assistance defaults were published by whoever landed last, so a slow zero-TM Deadlift result could overwrite a valid Bench TM — disabling START and warning about a missing training max under Bench's name. `loadLiftDetail` takes a generation and publishes only while current, clears the outgoing lift's numbers instead of leaving them under a new name, and START is disabled until the selection resolves. `launchSession` re-reads the TM inside the operation. Four existing tests raced that read deliberately and now wait for it. |
| F18 | **High** | B06 | — | `src/screens/Today.tsx` | `fixed` | `ac0c73b` · `session.test.ts` ×5, `Today.test.tsx` ×4 | **Resuming is not starting.** Every resume went through `startSession`, which resets the store to empty; Workout derives all progress from those arrays, so a session with four saved sets looked untouched and the next LOG inserted a duplicate warmup set 1. A backup restore reaches this every time. `hydrateSessionState` rebuilds the store from the saved rows in plan order (the list is positional, so any other order points every logged set at the wrong row), keeps the database ids so a later edit or undo addresses the saved row, and splits cross sets out of the linear cursor. **Assistance work is deliberately not rebuilt** — it lives in the store and is only written at COMPLETE, so for a pending session there is nothing saved; the fix seeds the lift's defaults and says so rather than implying the earlier attempt logged none. |
| F19 | Medium | B06 | — | `src/screens/History.tsx` | `open` | — | — |
| F20 | Medium | B06 | — | `src/screens/History.tsx` | `open` | — | — |
| F21 | Medium | B06 | — | `src/screens/History.tsx` | `open` | — | — |
| F22 | **High** | B06 | — | `src/components/stats/RecordsPanel.tsx` | `fixed` | `013e0f9` · `Stats.test.tsx` ×3 | **Ownership rule settled: completed sessions, plus the one being logged.** Stats filtered nothing but `liftId`, so skipped and abandoned work set permanent records History would never show. Now reads `baselineWorkingSets`. |
| F23 | Medium | B06 | — | `src/components/stats/RecordsPanel.tsx` | `open` | — | — |
| F24 | Medium | B07 | — | `src/lib/calc.ts` | `fixed` | `ef4ca49` · `calc.test.ts` ×6, `Settings.test.tsx` ×2 | **Ordering made an invariant at the domain edge.** Nothing enforced `firstBell <= secondBell` and the steppers clamped each field independently at `>= 30`. Inverted, it broke the timer twice: `restStatus` tests `secondBell` first, so the first bell never fired and the screen read "SECOND BELL" at 60s while the countdown ran toward 240; and `restNotificationTargets` armed both at absolute times under one `tag`, so the tray showed the second bell first and the later first bell *replaced* it — the surviving notification was the earlier checkpoint's (B09b/P26). `restThresholds` now **sorts** rather than clamps: the user configured two durations and got the fields the wrong way round, so both are kept. The steppers carry the other bell along instead of refusing the step, so every setting stays reachable and the inversion cannot be entered at all. |
| F25 | Medium | B07 | — | `src/lib/calc.ts` | `fixed` | `b585a09` · `calc.test.ts` ×6 | **The fallback made it worse, not safer.** The Wathan inverse is unbounded and a discount expands it by `1/scale`: recent 225×12 against a 185 TM asked for 95 / 155 / 345 reps, tapped straight into the reps field. Because the value was non-null, the documented "callers fall back to the TM-implied goal" never fired — `off` returned null and degraded, the three discount settings did not. `amrapTargetReps` caps at 30 and both readouts go through it. A wrapper, not a change to `targetReps`: that stays the honest answer to "how many reps reach this e1RM"; what is worth *showing* is the readout's call. The TM path is capped too — it looks bounded by construction, but the AMRAP weight is user-editable. |
| F26 | Low | B07 | — | `src/lib/calc.ts` | `fixed` | `b585a09` · `calc.test.ts` ×3 | `roundToNearest5` rounded the float a percentage multiply produced rather than the value it meant. `0.70` is the only multiplier that lands short of a .5 boundary — 175 × 0.70 is 122.49999999999999 — so week 2 set 1 gave **120** while the identical 122.5 via `0.50` gave **125**. TM 325 week 2 → 225 instead of 230, across all ten BBS sets too. Snapped to 6dp before the half-up step: orders of magnitude below the smallest plate, orders above the ~1e-14 multiply error. |
| F27 | Low | B07 | — | `src/lib/calc.ts` | `fixed` | `d499c98` · `calc.test.ts` ×7, `PlateDisplay.test.tsx` ×6 | **Greedy replaced with an exact search.** Largest-first with no backtracking stranded a remainder even when an exact load existed: with 2×45 and 4×25, a 50/side load took the 45 and could not make the last 5, though 25+25 works. Reachable because the plate stepper allows any count down to 0. Memoized on (plate index, remainder) over a handful of types — heaviest-first with the first solution taken, so greedy's answer is preserved wherever greedy was right (a 45–500lb sweep over `DEFAULT_PLATES` pins it) and this only ever *adds* answers. Arithmetic moved to hundredths. `PlateDisplay` now distinguishes all three outcomes — `null` rendered nothing, so an unmakeable load looked identical to a set with no plate hint. |
| F28 | Low | B07 | — | `src/lib/calc.ts` | `fixed` | `ef4ca49` · `calc.test.ts` ×9, `export-import.test.ts` ×3 | **Three lookups, three different failures.** `week` is typed `1|2|3|4` but read straight off session rows, which come from imports and hand-edited backups. `calcMainSets` threw a `TypeError` (blank Workout screen — no route error boundary); `calcBbsSets` returned ten NaN sets, loggable and persistable, because the guard was `=== null` and an unknown week looks up `undefined`; `calcSupplementalSets` guarded `main.length === 0` then indexed `main[1]` unguarded. All total now, and `getSupplementalLabel` stops emitting `BBS 10 × 5 NaN% TM`. Also rejected at the import edge **before** the destructive clear, so a bad row never lands and the user keeps what they had. |
| F29 | Low <br><sub>test quality</sub> | B07 | — | `src/lib/calc.ts` | `fixed` | `b585a09` · `calc.test.ts` seed case | The test asserted `reps` by round-tripping through `est1RM`, which is rounded to 2dp for display while `reps` derives from the unrounded seed. Wathan can round the reported figure just *above* the value that produced the reps (847 such pairs over a 60–400lb sweep) — cosmetic in the product, load-bearing in a test that would have stopped meaning anything the moment its inputs changed. Now a literal, plus the same value re-derived from the seed itself. No product change. |
| F30 | Medium | B07 | — | `src/lib/calc.ts` | `fixed` | `d499c98` · `calc.test.ts` ×3, `workout-compose.test.ts` ×19 | **A mode that silently did nothing.** `BBS_PERCENTAGES[4]` was `null`, so week 4 composed **0** supplemental sets under `deloadSupplemental: 'deload'` — byte-identical to `'skip'` — while every other template composed five, and the label went null so nothing on screen explained it. Settings offers three modes and promises "run it at deload %". Week 4 is **0.50**: BBS's sibling BBB has always run a flat 50% on every week including the deload, and it continues this ladder's own trend against the week's top main set (0.85→0.60, 0.90→0.70, 0.95→0.80, so 0.60→0.50). The alternative — making `deload` mean `skip` for BBS and saying so — keeps a mode that does nothing, which is harder to explain than a percentage. `'deload'` had **no test at all**; all three modes are now covered across all six templates. |
| F31 | Low | B07 | — | `src/lib/workout-compose.ts` | `fixed` | `95fda65` · `dedupe-cross-blocks.test.ts` ×6, `lift.test.ts` | **A UI rule with nothing behind it.** Logged cross sets carry only the movement's `liftId`, never a block identity, so one logged set marked set 1 of *every* block on that movement done and overrode the remainder of both. `LiftSetupModal` filtered the picker; `liftSupplementals` had only `idx_liftSupplementals_liftId`, so an imported backup restored duplicates verbatim. Unique index on `(liftId, movementLiftId)` preceded by a reconcile, in `ADDITIVE_MIGRATIONS` for the same reason as the two unique indexes above it. The twin is **deleted**, not renamed as in the exercise dedupe: a block is a prescription, and the sets reference the movement, so the survivor still owns all of them. Import reconciles rather than rejects. |
| F32 | Low | B07 | — | `src/lib/workout-compose.ts` | `fixed` | `95fda65` · `workout-compose.test.ts` ×6, `Workout.test.tsx` ×4 | **The two restore tails made symmetric.** Logged self-supplemental sets survive their plan disappearing (`extraFsl` restores them even when `effectiveSupplementalWeek` is null); `composeCrossSets` was a `flatMap` over the blocks, so with no block there was no output. Removing a cross block mid-session, or switching to `skip` during a week-4 session, made logged cross work vanish from the screen while its rows kept counting toward History, PRs and Stats. Orphaned sets are now appended, renumbered from 1 so the block cursor still reads — and because the page renders one section *per block*, `loadData` synthesizes a block for each orphaned movement, labelled "logged · no longer prescribed" rather than `getCrossLabel`'s "SQUAT 0 × 0 0% TM". |
| F33 | **High** | B07 | C1 | `src/screens/Workout.tsx` | `fixed` | `10967b6` · `cycle.test.ts` ×3, `Modal.test.tsx` ×4, `TmRecommendationModal.test.tsx` ×2 | **C1 owner.** Two halves. UI: `Modal` gained `busy`, suppressing Escape and `← BACK` — the paths no call site can gate — and the three post-session modals single-flight their handlers via `useSingleFlight`. DB: `advanceCycleIfComplete` now re-reads the cycle **inside** its transaction and aborts if another caller already advanced. That guard only holds because **F05** serialized transactions first. |
| F34 | Medium | B07 | C1 | `src/lib/cycle.ts` | `fixed` | `10967b6` · `cycle.test.ts` ×2, `CycleCompleteModal.test.tsx` ×4 | `applyCycleDoubling` now derives its target from the **summary row** instead of re-reading the live TM, so repeating it is idempotent (205→210 however many taps), and skips a write that would be a no-op. Fold-back keyed on `liftId`: `TmChange` carries the id, because `lifts.name` has no UNIQUE constraint and two lifts named "Bench" rewrote each other. `deloadTms` is **deliberately not** made idempotent — see note. |
| F35 | Medium | B07 | — | `src/lib/cycle.ts` | `fixed` | `96c4493` · `cycle.test.ts` ×4 | **The invariant has to hold however the shape changes.** Retiring the sessions a cycle shrink orphans lived only in `Settings.handleCycleShapeChange`; a backup import changes `hasDeloadWeek` too, and its envelope is the weakest one we have. `retireWeeksPastFinalWeek` is now called from `advanceCycleIfComplete` and from `getNextSessionAdvancingIfDone` before either reads the cycle's sessions — the latter because a stranded row is stranded whether or not the cycle is finishable. Retired as `skipped`, consistent with what Settings already chose: the sets were still lifted. Completed deload days are untouched. |
| F36 | Low | B07 | — | `src/lib/training-max.ts` | `fixed` | `10967b6` · `training-max.test.ts` ×2 | B12d decision applied: highest `id` wins at equal `setAt`. One `isNewer` helper shared by `getCurrentTm` and `getAllCurrentTms`, which previously resolved the same tie to opposite rows. |
| F37 | Medium | B07 | — | `src/lib/pr.ts` | `fixed` | `013e0f9` · `pr.test.ts` cross-history case | Not in the planned chunk — fixed as a consequence of the shared reader. The "no history at all" guard tested the lift's **own** session rows and returned before the cross query ran, so a movement trained entirely as cross work was scored against nothing. It is now decided on every qualifying session, cross-only included. Both previously pinned behaviours preserved. |
| F38 | Medium | B07 | — | `src/lib/pr.ts` | `fixed` | `013e0f9` · `pr.test.ts` ×4 | The three readers now share one rule via `lib/performance.ts`. The live-session clause is what lets the toast and the History badge agree while the toast still works mid-workout — `pr.ts:78-84` asserted that invariant and did not hold it. |
| F39 | Medium | B07 | — | `src/lib/tm-recommendations.ts` | `open` | — | — |
| F40 | Low | B07 | — | `src/lib/tm-recommendations.ts` | `open` | — | — |
| F41 | Low | B07 | C1 | `src/lib/exercise.ts` | `fixed` | `da34448` · `exercise.test.ts` ×3 | Application rule became a storage invariant: `idx_exercises_name_nocase` on `exercises(TRIM(LOWER(name)))`. Placed in **`ADDITIVE_MIGRATIONS`, not `SCHEMA`** — `init()` runs `SCHEMA` unguarded on *every* boot, so a DB already holding duplicates would fail to start; as a migration the error is swallowed and that DB skips the index. Same reasoning as `idx_accessoryNotes_session_exercise`. The constraint failure is translated back to `ExerciseNameConflictError` so a lost race reads like a deliberate duplicate. |
| F42 | Low | B07 | — | `src/lib/exercise-history.ts` | `fixed` | `013e0f9` · `exercise-history.test.ts` ×2 | `getLiftHistory` matched the lift's **own** sessions only, so cross work logged on another lift's day was invisible — while counting toward the same lift's PR toast, Stats record and AMRAP seed. Now resolved through `baselineSets`. |
| F43 | Medium | B07 | — | `src/lib/lift.ts` | `fixed-by` | `013e0f9` · reader half only | **Reader half only.** `db.sets.where('liftId')` had no session join, so sets orphaned by `archiveLift` scored permanent records no screen could display; `baselineSets` resolves cross work through its session and drops orphans. **`archiveLift`'s missing cascade is NOT fixed** — that is a separate defect and stays open as F99. |
| F44 | Low | B07 | — | `src/lib/lift.ts` | `fixed` | `50dd4ba` · `lift.test.ts` ×2 | `deleteLift` now completes the cascade: the lift's sessions and all their child rows, plus its `assistanceDefaults`. "Hard-delete a lift and everything attached to it" has to mean it — the doc comment scoped the function to pre-history use, but nothing enforced that. |
| F45 | Low | B07 | — | `src/lib/cleanup.ts` | `fixed` | `50dd4ba` · `cleanup.test.ts` ×4 | **Configuration counts as use.** "In use" meant "has a surviving logged set", so CLEANUP archived an exercise the user had just set as a lift's assistance default and given a training max — the slot then resolved to nothing. A live `assistanceDefaults` reference or an accessory TM now protects it, and the plan carries `exerciseNamesToArchive` so the confirmation can say what it is about to do rather than reporting a bare count afterwards. |
| F46 | Low | B08 | — | `src/components/modals/ModalAsyncStates.tsx` | `open` | — | — |
| F47 | Low <br><sub>med w/F34</sub> | B08 | — | `src/components/modals/CycleCompleteModal.tsx` | `fixed` | `10967b6` · `CycleCompleteModal.test.tsx` focus case | `initialFocus="container"` on `CycleCompleteModal`. The rule for that prop is now "first control performs a write", not "first control says DELETE" — the first focusable was `+X LBS`, which armed a training-max write under the next Enter keypress. |
| F48 | Medium | B08 | — | `src/hooks/use-confirmation.ts` | `open` | — | — |
| F49 | Low | B08 | C3 | `src/components/modals/LiftSetupModal.tsx` | `fixed` | `e28c3a0` · `LiftSetupModal.test.tsx` ×3 | A `loaded` flag gates the equipment controls, following the modal's own `saving()` precedent. The form rendered interactive while showing **defaults**, and `load()` then replaced `plateMode`/`implementBase` with the stored values — so a choice made in that window was silently undone, and a lift stored as `none` displayed the wrong mode until the query landed. `ToggleChip` and `Stepper` gained a `disabled` prop. `LiftSetupModal` had no test file. |
| F50 | Medium | B08 | — | `src/components/modals/LiftSetupModal.tsx` | `open` | — | — |
| F51 | Medium | B08 | C1,C2 | `src/components/workout/SaveFailureBanner.tsx` | `fixed` | `da34448` · `SaveFailureBanner.test.tsx` ×3 | `retrying` is a set of ids, not one `number | null` slot. It tracked in-flight state for a **list**, so retrying B re-enabled A while A was still in flight, and whichever settled first cleared the marker for both — on the one path whose purpose is recovering a set already lost once. |
| F52 | Medium | B08 | C2 | `src/screens/Workout.tsx` | `fixed` | `92e93aa` · `Workout.test.tsx` cross-identity case | **The documented rule applied.** `<Index>` for the cross-block list, per `COMMON_MISTAKES.md` #6 — `crossSections()` rebuilds its wrappers every evaluation and `<For>` keys by reference, so each re-derive remounted every block. Logging a set in one block reverted a weight dialled into another (202.5lb → 195lb in the test). Closes the **wontfix-vs-fix question**: it was a documented hazard that one site escaped, so the docs were right and the code was wrong — fixed, not excused. |
| F53 | Low <br><sub>cosmetic</sub> | B08 | — | `src/components/workout/AmrapTargets.tsx` | `open` | — | — |
| F54 | Medium | B08 | C2,C3 | `src/components/workout/AccessoryPicker.tsx` | `fixed` | `92e93aa` · `AccessoryPicker.test.tsx` F54 case | The SET TRAINING MAX buffer is seeded on every open via `openTmSheet`. It was component state outliving the sheet, and Escape returns to the list rather than closing the picker, so SAVE wrote the previous exercise's dialled number as the new one's TM — and an accessory TM drives every prescribed weight for that exercise from then on. |
| F55 | Medium | B08 | C1,C2 | `src/components/workout/AccessoryPicker.tsx` | `fixed` | `da34448` · `AccessoryPicker.test.tsx` ×2 | Both commit paths single-flight via `useSingleFlight`, and `alreadyAdded` is now derived **live** from `workout.activeAccessories` rather than snapshotted into `rows()` at load time, so the guard can see an add made by the previous tap. |
| F56 | Low | B08 | C3 | `src/components/workout/AccessoryLog.tsx` | `fixed` | `e28c3a0` · `AccessoryLog.test.tsx` ×3 | Closed from both sides. The log controls are withheld until `props.exercise` resolves — `type()` fell back to `'reps'`, so logging in that window wrote `reps: n, duration: null` for a **timed** exercise. And `exercises` is now fetched with the session and lift rather than on the last await, since it depends on nothing ahead of it while `workout.activeAccessories` is hydrated synchronously from localStorage. |
| F57 | Medium | B08 | C2,C4 | `src/components/workout/RestTimer.tsx` | `fixed` | `92e93aa` · `RestTimer.test.tsx` ×3 | Single owner for the sentinel: an in-flight `pending` promise so a concurrent caller joins rather than requesting a second, and a release that nulls **before** awaiting. Visibility handling is now symmetric — release on hide, request on show — rather than requesting on show while trusting the browser's own release. The existing five wake-lock tests could not catch this: they shared **one** `mockSentinel`, so "release was called" was true even when two others leaked. |
| F58 | Medium | B08 | C4 | `src/components/forms/Stepper.tsx` | `fixed` | `f418767` · `Stepper.test.tsx` ×5 | Two independent stops, each with its own test. The repeat now ends **from inside** when the clamped value stops changing — a button disables itself exactly when the value pins at its bound, and a disabled button dispatches no pointer events, so nothing outside could ever stop it. Release is also listened for on the **window**, so a pointer that wanders off the control still ends the press. `Stepper.test.tsx` had 17 cases and none touched the long-press path. |
| F59 | Low | B08 | C5 | `src/components/forms/DurationInput.tsx` | `fixed` | `26981f0` · `AccessoryLog.test.tsx`, `DurationInput.test.tsx` ×2 | `fieldLabel` passed at all three call sites. It existed for exactly this — "so two duration inputs on one screen don't both announce as bare minutes/seconds" — and none of them used it. Tested at the **call site**, not just the component: a component-level test passes whatever the call sites do. |
| F60 | Medium <br><sub>WCAG 2.1.2, Level A</sub> | B08 | C5 | `src/components/forms/NotesField.tsx` | `fixed` | `26981f0` · `NotesField.test.tsx` ×4 | Tab interception gated on `listMode()`, as the Enter handler already was. **Behaviour change, taken deliberately:** Tab re-tabbing is now a list-mode feature, so three existing tests were updated to enable list mode. WCAG 2.1.2 permits a non-standard exit only if the user is advised of it, and the ←/→ escape chips render only in list mode — so outside it there was no advice and no exit. |
| F61 | Medium <br><sub>WCAG 2.1.1, Level A</sub> | B08 | C5 | `src/components/forms/SetReadout.tsx` | `fixed` | `26981f0` · `SetReadout.test.tsx` ×7 | A real `<button>` when the row is tappable. This is the app's only affordance for editing an already logged set, so as a bare `div` correcting a mislogged set was pointer-only. The trailing slot stays **outside** the button — it holds an `InlineConfirm`, and nesting interactive content makes the inner control unreachable. `SetReadout` had no test file. |
| F62 | Medium | B08 | C4 | `src/components/workout/AccessoryLog.tsx` | `fixed-by` | F61 · `AccessoryLog.test.tsx` ×2 | **Closed as a side effect of F61**, not by a change of its own. The undo control sits in `SetReadout`'s trailing slot, which F61 moved **outside** the new `<button>` — so its click is no longer inside the row's click target and cannot bubble into it. Verified rather than assumed: the confirmation renders and the row stays a readout. All three `InlineConfirm` call sites were checked; none is inside a clickable parent any more. `InlineConfirm`'s `stopPropagation` default is still arguably wrong but is now unreachable, so it is left alone rather than changed without a failing test. |
| F63 | Medium | B08 | C2,C3 | `src/components/stats/RecordsPanel.tsx` | `fixed` | `92e93aa` · `RecordsPanel.test.tsx` ×2 | Request identity: a token per load, results dropped when superseded, and `setLoading(true)` on entry. `History.tsx:612` passes a live signal, so switching lift is the ordinary path — the panel published whatever settled **last** rather than what was asked for last, and never returned to the loading state. `RecordsPanel` had no test file at all. |
| F64 | Low | B08 | C5 | `src/components/layout/Rule.tsx` | `fixed` | `26981f0` · `Rule.test.tsx` ×5 | The dash fill is wrapped in `aria-hidden` inside `Rule`, so all 16 call sites get it — the fix that had been applied once at a call site now lives in the component. `Modal` keeps its own `aria-hidden`, but for a different reason now: its `sr-only` heading is the `aria-labelledby` target, so without it the title is announced twice. |
| F65 | **High** | B09 | C6 | `src/service-worker.ts` | `fixed` | `9daa584` · leg F | **Amended — the stated impact never reproduced.** The missing `ok` check was real but masked by **F95**: the cache write never ran, so no 503 could poison anything. Repairing F95 alone would have activated this for real, so both landed in one change. Leg F asserts both halves. |
| F66 | Medium | B09 | C6 | `src/service-worker.ts` | `fixed` | `9daa584` · leg G | **The live half of the pair.** Reproduced exactly as written: a 502 enters the cache-first precache and is served from it thereafter. Cache-first, so it is never re-fetched. |
| F67 | Medium <br><sub>needs device</sub> | B09 | C6 | `src/lib/notifications.ts` | `fixed` | `fe36572` · `notifications.test.ts` ×2 — **platform claim still unverified** | `firePage` wraps the constructor and falls back to `ServiceWorkerRegistration.showNotification`. Unwrapped, the `TypeError` escaped the timer tick uncaught: no notification, and nothing reporting that none fired — while this module designates the page as the **reliable** path. An explicit permission denial is still respected rather than routed around. **What is NOT settled:** whether the constructor actually is unavailable on Android Chrome or in an iOS PWA. That needs a real device (installed PWA, permission granted, tab hidden, one rest bell) and this machine cannot answer it, per the project rule on mobile claims. The fallback is correct either way; the severity is not established. |
| F68 | Low | B09 | — | `src/workers/timer.worker.ts` | `open` | — | — |
| F69 | Medium | B10 | — | `vite.config.ts` | `fixed` | `bc77574` · `pnpm test:coverage` green on ratcheted thresholds | `include` widened from three directories to `src/**`. `components`, `db`, `hooks`, `service-worker.ts` and `workers` were **not measured at all** — 22 of the 23 findings this review opened in those areas lived where the gate could not see. Measured over the whole tree the real figures are **88.79 / 78.27 / 88.18 / 91.17**, so thresholds are re-baselined to **85 / 76 / 85 / 88** — just under actual, so the gate bites on every metric instead of leaving three with ~9 points of slack. |
| F70 | Medium <br><sub>needs Lighthouse</sub> | B10 | — | `vite.config.ts` | `open` | — | Conditional severity; installability impact worth a Lighthouse check. |
| F71 | Medium | B10 | — | `tsconfig.json` | `fixed` | `bc77574` · deliberate type errors caught in both projects | `tsconfig.e2e.json` added to the solution file's `references`, and `tsconfig.node.json` widened to `playwright.config.ts`, `eslint.config.js`, `stryker.config.mjs` and `scripts/**`. Verified rather than assumed: a deliberate type error in `tests/e2e/app.spec.ts` and another in `playwright.config.ts` are both now caught by `tsc -b`, and neither was before. |
| F72 | Low | B10 | — | `vite.config.ts` | `open` | — | — |
| F73 | Medium <br><sub>supply chain</sub> | B10 | — | `.github/workflows/deploy.yml` | `fixed` | `9daa584` · rule 1(b) | `wrangler` is now a lockfile-pinned devDependency (4.131.2) invoked via `pnpm exec`. `allowBuilds` for `esbuild`/`workerd` set to **false** — verified unnecessary, so this removes two lifecycle-script executions the old `--allow-build` flags permitted. |
| F74 | Medium | B10 | — | `.github/workflows/ci.yml` | `fixed` | `bc77574` · new `e2e` CI job | A third CI job runs `test:e2e` on every PR and every push to main, uploading the Playwright report on failure. Landed **with** F85 and F78 — wiring a failing suite into CI, or one that tests the dev server, returns it to exactly the state that produced these findings. |
| F75 | Low | B10 | — | `.github/workflows/ci.yml` | `fixed` | `bc77574` · `push` trigger added | `push: branches: [main]` added, with the concurrency group falling back to `github.ref` since `pull_request.number` is empty on a push. Committing on main is an accepted workflow here, and it previously got **no** checks unless the commit happened to touch a deploy path. |
| F76 | Low <br><sub>docs</sub> | B10 | C7 | `CLAUDE.md` | `fixed` | `04cc34a` · rule 1(b) — claims re-checked against the workflows | `CLAUDE.md` and `QUICK_START.md` said "CI never runs lint or tests". `deploy.yml` runs `check:ci` **before** deploying and `ci.yml` runs it on every PR, plus the `verify-sw` job. Both now say what the workflows do, and call out that `test:coverage` — not plain `test` — is what gates, which is why **F69**'s `include` scope matters at the gate. |
| F77 | Low | B10 | — | `eslint.config.js` | `fixed` | `bc77574` · 0 → 64 rules on `scripts/*.js` | A `**/*.{js,mjs}` block extending `js.configs.recommended` with node globals. `eslint --print-config scripts/debug-browser.js` resolved **0** rules before and **64** now; ~400 lines of Playwright-driving Node were checked by nothing. Passes clean. |
| F78 | Medium | B10 | — | `playwright.config.ts` | `fixed` | `bc77574` · 32/32 against a production build | `webServer` is `pnpm build && vite preview` on 5175, not `pnpm dev`. **`freshStart` no longer needs `__e2eResetDb`** — Playwright gives every test its own context, and a context has its own storage partition, which is already a clean install and is exactly what `verify-notify-hardening.js` relies on. Exposing the reset hook in production was the alternative and was rejected: it is a destructive global. |
| F79 | Medium | B10 | — | `scripts/verify-notify-hardening.js` | `fixed` | `9daa584` · rule 1(b) | `verify:sw` script added; new `verify-sw` CI job on every PR. Two harness defects had to be fixed first — **F96** and **F97**. |
| F80 | Low | B10 | — | `scripts/debug-browser.js` | `open` | — | B12: documented at `.claude/QUICK_START.md:36-38`. Known state — decide fix vs wontfix. |
| F81 | Medium | B10 | — | `public/favicon.svg` | `open` | — | — |
| F82 | Low | B10 | — | `public/demo-seed.json` | `open` | — | Decided in B12d; documented as `.claude/COMMON_MISTAKES.md` #7. Known state — decide fix vs wontfix. |
| F83 | Low | B10 | — | `.gitignore` | `open` | — | — |
| F84 | Low | B10 | C7 | `scripts/migrate-history.py` | `fixed` | `04cc34a` · `seed-migration-parity.test.ts` ×3 | **Structural, not a re-sync.** `migrate-history.py` now reads `src/db/seed.ts` instead of restating it, so the two cannot drift. Drift was worse than recorded: the script had **18** exercises against seed's **27**, and id 3 was `"Curls"` vs `'Bicep Curls'` — a migration would import a duplicate that **F41** shows cannot then be renamed. The script hard-fails if parsing yields too few rows; the test re-introduces the original drift and catches it. |
| F85 | Medium | B11 | — | `tests/e2e/app.spec.ts` | `fixed` | `bc77574` · 32/32 passing | Was 6 failed / 26 passed. Four causes, not the three recorded: the wizard went 3 steps → 2; `SessionBar` splits FINISH from COMPLETE SESSION; `Stepper` gained `fieldLabel` so `+` is no longer the accessible name; and **`getByText('MAIN')` now matches two elements** (the session bar lists segments by the same labels) — a strict-mode violation F85 did not record. One spec also asserted a finish control that cannot exist in its state: after logging a set the rest timer owns the strip it shares with the session bar. |
| F86 | Low | B11 | — | `test-results/.last-run.json` | `fixed` | `bc77574` · untracked + ignored | `test-results/` and `playwright-report/` ignored, and `test-results/.last-run.json` untracked. The committed copy read `{"status":"passed"}` — a stale green receipt in a repo where the suite did not pass and nothing ran it. |
| F87 | Medium | B11 | — | `src/test-setup.ts` | `fixed` | `bc77574` · `rest-timer-protocol.test.ts` ×7 | **One implementation, not two.** The protocol moved to `workers/rest-timer-protocol.ts` and both the Worker entry point and `test-setup.ts`'s stub drive it — same shape as `createNotifyTimers`, which the page and service worker already share. The stub was the only implementation any test exercised, so the two had diverged on `pause` and on `start` without `restStartedAt`, and the stub would have blocked **F68**'s fix. The protocol now has the test file B09c asked for, including cases pinning both former divergences. |
| F88 | Low | B11 | — | `src/store/save-failure-store.ts` | `open` | — | — |
| F89 | Medium | B12 | C7 | `.claude/ARCHITECTURE_MAP.md` | `fixed` | `04cc34a` · rule 1(b) — inventories diffed against `ls` | Component and `lib/` inventories regenerated from the tree and verified complete by script (every file in `src/components/*/` and `src/lib/` now appears). `detectAmrapPRs` → `detectPRs`; the **Rest** pattern corrected from the replaced `{ normal, transition, failNudge, failMax }` / `FAIL_NUDGE_RATIO` model to the real `{ firstBell, secondBell, failedBell }`; the `icon-192/512.png` lines dropped (they never existed). `hooks/use-single-flight.ts` added. |
| F90 | Medium | B12 | C7 | `README.md` | `fixed` | `04cc34a` · rule 1(b) — checked against `pr.ts` | All four descriptions corrected. The in-code one mattered most: `RecordsPanel` claimed to be "intentionally broader than the AMRAP-only PR toast", a distinction that stopped existing when the toast widened — and both readers now share `baselineWorkingSets`, which is **F38**. Landed after F38, so the docs describe post-F38 behaviour. |
| F91 | Medium | B12 | C7 | `ROADMAP.md` | `fixed` | `04cc34a` · rule 1(b) — claims checked against the code | "No open items" replaced with the review's actual Security and Tech Debt findings, split into fixed and open. Both overstated mitigations corrected: the supply-chain bullet now records that the deploy step bypassed all three controls until F73, and the PWA bullet that `cleanupOutdatedCaches` does nothing in `injectManifest` mode — that wrong claim was in **three** places (`ROADMAP`, `vite.config.ts:48`, `ARCHITECTURE_MAP`), all fixed. |
| F92 | Low | B12 | C7 | `docs/INDEX.md` | `fixed` | `04cc34a` · count verified by script | `COMMON_MISTAKES.md` has **11** entries, not "Ten" — the count is dropped from the description entirely so it cannot drift again. The `Last Updated` stamp was already refreshed when the ledger was first indexed. |
| F93 | Low | B12 | C7 | `docs/INDEX.md` | `fixed` | `04cc34a` · verdicts checked against the records | Both index entries and the swe-hardening header corrected. That record's header read "Runtime legs … listed as TODO below" directly above a table marking all five **PASS**; the amendment says so explicitly rather than quietly rewriting it. Landed with **F79** having wired the harness into CI, which is the same reader question — "has this actually been verified?" |
| F94 | Medium | B12 | — | `src/db/schema.ts` | `fixed` | `50dd4ba` · `index-coverage.test.ts` ×2 | `idx_sets_liftId`. Cross sets are attributed by their own `liftId`, so every record reader scans `sets` by it — including `detectPRs`, which runs on the **logging path** after each set. **`ADDITIVE_MIGRATIONS` only**, not `SCHEMA`: `sets.liftId` is itself an additive column, so `SCHEMA` runs before it exists and the index fails with "no such column". Asserted via `EXPLAIN QUERY PLAN`, not assumed. |
| F95 | **High** | — | C6 | `src/service-worker.ts` | `fixed` | `9daa584` · leg F | **Opened during fix work, not by the review.** The navigation handler's shell refresh never executed: `response.clone()` ran inside the `caches.open(...).then()` callback, after `return response` handed the body to the navigation, so it threw "body is already used" and `void` swallowed it. The cached shell was frozen at whatever `install` precached; network-first refresh had never run once. Masked F65 and would have activated it if repaired alone. |
| F96 | Medium | — | — | `scripts/verify-notify-hardening.js` | `fixed` | `9daa584` · all 7 legs | **Opened during fix work.** The harness the review called "already exists, already passes" failed **all six legs**: `completeSetupWizard` drove a three-step wizard with `data-testid` selectors, and the wizard is now two steps with no testids in a production build. F79's own thesis, demonstrated — a dormant capability decays. |
| F97 | Medium | — | — | `scripts/verify-notify-hardening.js` | `fixed` | `9daa584` · exit 0 in 22s | **Opened during fix work.** The 200s watchdog `setTimeout` was never cleared or unref'd, so a fully passing run sat for 200s and then `process.exit(3)`. Wiring the harness into CI without this would have failed every build. |
| F98 | Low | — | — | `src/db/seed.ts` | `fixed-by` | F07 · `seed.test.ts` | Closed by removing the code, not by wrapping it: the `clear()` + `bulkAdd()` pair only existed on the re-seed path F07 deleted. There is no longer a window in which the roster is empty. |
| F99 | Medium | — | — | `src/lib/lift.ts` | `fixed` | `50dd4ba` · `lift.test.ts` ×2 | `archiveLift` routes through the shared cascade instead of re-implementing it — it deleted the session **row** only, leaving sets, accessorySets and accessoryNotes pointing at a sessionId nothing resolves. Completed sessions are still untouched, since archiving is reversible. |
| F100 | Low | — | — | `src/lib/cycle.ts` | `open` | — | **Noted during C1, not fixed.** `deloadTms` cannot be made idempotent: it is relative (`weight × 0.9` of whatever is current) and nothing records that a training-max row came from a deload rather than from the user, so the library cannot distinguish a second tap from a second cycle's deload. Its only guard is single-flight at the modal, which is now in place. A real fix needs the `source` provenance column **F39** asks for; folding these two together is the cheaper path. |
| F101 | Low | — | C1 | `src/db/schema.ts` | `fixed` | `50dd4ba` · `dedupe-exercise-names.test.ts` ×3 | Duplicate names are reconciled **before** the unique index is re-attempted, so the installs that silently kept no guarantee now get one. Later twins are suffixed with their id rather than merged or deleted — they carry logged history through `accessorySets`. Idempotent: on a healthy database the UPDATE matches nothing. |

## Remaining work, batched

All seven clusters (C1–C7) are closed. What is left is individually rooted, so
these batches group by **what a fix would touch**, not by a shared root cause.
Every `open` finding belongs to exactly one batch — `batches.test.ts` fails if
that stops being true, so a new finding cannot quietly land outside the plan.

Batch membership is a judgement call and is meant to be revised; the partition
being *complete* is not.

| # | Batch | n | High | Groups because |
|---|---|---|---|---|
| 1 | The gate | 0 | 0 | **Closed** — was 9 |
| 2 | Destructive paths | 0 | 0 | **Closed** — was 8, two High |
| 3 | Session lifecycle | 0 | 0 | **Closed** — was 7, four High |
| 4 | calc numerics | 0 | 0 | **Closed** — was 9 |
| 5 | Async read identity | 5 | 0 | The same shape as F63, already solved once |
| 6 | Config and assets | 6 | 0 | Build, PWA and repo hygiene |
| 7 | Remainder | 12 | 0 | Genuinely individual |

**Order: 2 → 1 → 3 → 4 → 5 → 6 → 7.** Batches 1, 2, 3 and 4 are closed.

Not 1 first, despite the case for it. F01 and F07 destroy user data *today* and
are small and isolated — putting a nine-finding infrastructure batch ahead of
them means a user loses history while the tooling gets fixed. And the gate is
not actually blocking: each fix in this pass has been verified by a targeted
failing test and by reverting the fix to confirm the test catches it. The gate
matters for **regression over time**, not for per-fix confidence — important,
not urgent.

Batch 1 goes second, before the session lifecycle, because batch 3 is the
riskiest work left and is the one place a working E2E suite and an honest
coverage gate are worth having first.

### 1 — The gate

*(all closed)*

Coverage measures a third of the codebase; `tests/e2e/**` is type-checked by
nothing; the E2E suite runs in no workflow and 6 of its 32 specs fail; the test
double diverges from what it stands in for. No application behaviour changes.

**F78 is the hard one** — the E2E suite is *structurally* bound to the dev
server by `helpers.freshStart`'s `__e2eResetDb` hook, which is `import.meta.env.
DEV`-only. Against a production build it never appears and every test hangs. A
redesign (context-per-test reset, as `verify-notify-hardening.js` already does),
not a config line.

### 2 — Destructive paths

*(all closed)*

**F01** (High): swap accessory B→C then A→B and save — a later card deletes B's
just-saved sets and notes. **F07** (High): startup with fewer than four lifts
deletes the survivors and re-creates defaults with new ids, orphaning the
training maxes and session history that referenced them.

With the cascade family (`F44`, `F99`), `seed.ts`'s non-atomic clear+bulkAdd
(`F98`), the missing index the mid-set PR check scans (`F94`), and the
duplicate-name reconcile that `idx_exercises_name_nocase` still needs (`F101`).

### 3 — Session lifecycle

*(all closed)*

Four High, and they interlocked: resume reconciliation, session hydration, save
ordering, retry identity, start single-flight, selection generation. The one
batch that had to be a single coherent pass rather than scattered fixes.

Two things it turned on. **F05** (transactions serialized) had to land first —
`finalizePendingSession` and `startOrResumePendingSession` are both
read-then-write guards that only hold because a second caller cannot interleave.
And the store/row split runs through all of it: the persisted workout store
outlives its database row, and every finding here is a place that trusted the
store without asking the row.

One deliberate non-fix, recorded rather than skipped: **assistance work is not
rehydrated on resume** (F18). It lives in the local store and is only written at
COMPLETE, so a pending session has nothing saved to rebuild. The fix seeds the
lift's defaults and discloses it instead of implying the earlier attempt logged
none.

### 4 — calc numerics

*(all closed)*

Nine findings, billed as pure functions and no UI. Seven of them were; two were
not, and the batch was the cheaper for knowing which.

The through-line is **totality**. Five of the nine were a lookup or a formula
that had no answer for some input it could actually receive — an out-of-range
`week`, a bell pair in the wrong order, a BBS deload with no percentage, a plate
load greedy could not reach, a rep target with no ceiling — and in every case
the missing answer surfaced as something worse than an error: a blank screen,
NaN weights that persist, a mode that silently does nothing, a readout that
vanishes, a 345-rep target tapped straight into the reps field.

Two reached past `calc.ts` as predicted by their own findings. **F31** needed a
unique index and a reconcile migration, because the UI rule it depended on had
nothing behind it. **F32** needed the Workout screen as well as the composer:
restoring orphaned cross sets is useless while the page renders one section per
*block*, so a block has to be synthesized for them.

Three product decisions taken here rather than deferred, each recorded on its
row: BBS deloads at **0.50** (matching BBB, and continuing the ladder's trend)
rather than `deload` quietly meaning `skip`; the AMRAP target caps at **30
reps**; and a duplicate cross block is **deleted** rather than renamed, because
unlike a duplicate exercise it carries no history of its own.

### 5 — Async read identity

`F10` `F19` `F20` `F21` `F23`

Late results published over newer ones, and loading states never re-entered —
the same defect `F63` had. `RecordsPanel`'s request-token fix is the template.

### 6 — Config and assets

`F70` `F72` `F80` `F81` `F82` `F83`

### 7 — Remainder

`F09` `F11` `F12` `F39` `F40` `F46` `F48` `F50` `F53` `F68` `F88` `F100`

Individually rooted. `F39` and `F100` are the pair worth doing together — both
want the training-max provenance column.

## Open leads

Leads L01–L05 and L07 resolved into findings; see `deep-code-review.md:245`.

| ID | State | Blocker |
|---|---|---|
| L06 | `blocked` | **Authorization.** Needs a failure-injection pass across Today's load/start/abandon paths — different work from reading code, never authorized. Source inspection only (B06a). |

---

**Created**: 2026-09-15 · seeded from `docs/deep-code-review.md` at the review's completion.
