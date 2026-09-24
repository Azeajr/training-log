# Training Log — Roadmap

## Done

### Long Names on a Narrow Phone (2026-09-24)

Checked at iPhone 13 mini size (375px) with lifts named Belt Squat, Chin-ups and
Hip Thrust, then with longer names such as Close-Grip Bench Press.

- **A long name gets an ellipsis, and what follows it stays.** Every `--- LABEL`
  header was one clipped line, so a long name pushed out whatever came after it,
  with no sign anything was missing: a lift's `. WEEK 4 . DELOAD`, or a PT run's
  `1/3`.
- **A finished cross-lift block's header no longer breaks mid-phrase.** With a
  long movement name, `5 × 10 75% TM` split into `75%` and `TM`, and `5 sets done`
  wrapped too. The name wraps first now, and the rest stays on one line.
- **The session bar fades at its right edge.** On a phone it is always wider than
  the screen, and a segment cut off mid-count (`FSL+BBB 0/`) looked broken rather
  than like a strip that scrolls. The cross-lift and assistance segments are past
  that edge.
- **A sheet's `← BACK` stays on one line.** Squeezed by the title beside it, it
  wrapped onto two lines and ran into the dashes.

### Same-Day PT Runs Can Be Told Apart (2026-09-24)

- **Each PT run shows when it happened, not only what day.** Running one routine
  several times a day always saved fine, but the history listed the runs by date
  alone, so three shoulder runs read as three identical rows. Each row now has
  its start time under the date. The delete dialog and each row's delete label
  say which run they mean, and the PT CSV has a `time` column after `date`.
- **A long routine name truncates instead of pushing the row off screen.** On a
  phone it hid the done count and the delete control.

### Warmups Can Be Skipped (2026-09-21)

**C4** of `docs/workflow-review-fixes.md`, and the last item of the workflow
review — all 22 are now done.

- **Someone who warmed up their own way can reach the main sets.** Logging was
  tied to one linear cursor, so the only way past a prescribed warmup was to log
  it. SKIP REMAINING WARMUPS records that they were skipped rather than faking
  the records, and every skipped row keeps an UNDO SKIP.
- **A skipped set is not a completed one.** The cursor used to stand in for what
  happened, so moving past a warmup nobody did counted it as done — in the
  section counts, in the session bar and in the early-finish prompt. Skipping is
  its own state now, persisted with the rest of the session.
- **A set logged after a skip renders its own numbers.** The rows read the logged
  array by position while logging appends to it, which agreed only while every
  set was logged in order. A row finds its own set by what it is now, so a
  correction lands on it and not on a neighbour.

### Logging Flow (2026-09-21)

Five items on the friction of actually logging. **C5, C7, C9, C8** and **D2** of
`docs/workflow-review-fixes.md`.

- **Resting no longer hides FINISH.** The rest countdown took the whole bottom
  strip, so a rest removed the finish control and every section link with it and
  the way back to them was to work out that SKIP REST was the way back. The
  countdown is a second row above the session strip now.
- **The PT run has a fixed action bar.** DISCARD and FINISH sat at the bottom of
  a page that grows with every routine, exercise and set row — the only logging
  screen where finishing meant scrolling to find the button. It carries the
  session-wide done count, aggregated across routines.
- **A drop sequence can be copied forward.** The draft is cleared after every set,
  which is right, but it meant re-entering the same three-round drop set after
  set. COPY PREVIOUS DROPS is explicit, copies as an editable draft, and logs
  nothing.
- **An assistance exercise can be created from the picker**, pre-tagged with the
  slot being filled, instead of leaving the workout for Settings and coming back.
- **"Log after all drop rounds."** is shown once there are drop rounds to log
  after.

### Band Surfaces (2026-09-21)

Eight items across the band-assisted loading UI. **E1, C2, C1, C6, D1, B3, C3
and D3** of `docs/workflow-review-fixes.md`.

- **Band settings appears only where bands are used.** The shortcut was on every
  lift's logging screen, every cross block and every accessory header — and above
  the save-failure banner, so a write error was pushed down the page by a control
  nobody wanted there. It is gated on the saved profile now, never on a movement's
  name, and Settings remains the way to set one up.
- **One name for the dialog**, chosen where it is used: BANDS when a profile
  exists, SET UP BANDS when none. Three spellings and an unreachable default are
  gone, and the form now says what raw load actually is.
- **A suggestion explains itself.** A 45lb prescription used to sit beside an 86lb
  suggestion and a button that could not close the gap. The suggestion now reports
  its reasoning, so the control can distinguish a target that is out of reach from
  one that merely fell in an increment gap, and from the algorithm preferring a
  simpler setup — independent facts that can all be true at once.
- **Anywhere a load is edited can ask for a setup.** Both edit rows, all four
  history branches and drop rounds had none. Where a set carries its own
  prescription it is shown; where it does not — history, and drop rounds, which
  are defined by dropping to a lower load — the user names a target rather than
  being shown today's prescription as though it were the old one's.
- **Band names can be renamed, added and removed.** The four colours are a starting
  point, not the roster. Sets already logged keep the name, assistance and load
  they were recorded with.
- Plus a repeated unit after every band summary, a calibration form whose fields
  never looked editable, and a drop round that shared its calibration array with
  the round it was copied from.

### Assistance Swaps and FINISH Stop Losing Work (2026-09-21)

Items **A2** and **B1** of `docs/workflow-review-fixes.md`.

- **Swapping a fixed assistance slot keeps the displaced exercise's work.** It
  used to be filtered out of the session outright, logged sets and note included.
  It is demoted to extra work instead — and, because every accessory mutator
  addresses by exercise id with a predicate that matches EVERY entry, an exercise
  already present is moved rather than added twice. The picker had to change with
  it: a retained exercise was greyed out, so the swap back could not be performed
  at all.
- **FINISH asks what the session actually holds.** Starting a lift and tapping
  FINISH marked it done, advanced to the next lift and put an empty session in
  History. A session with nothing in it now offers to continue, discard or skip
  and cannot be completed; one with notes and no sets offers to save the notes;
  one with work still outstanding names what is outstanding before finishing. A
  fully logged session completes on one tap, as before.

### PT Drafts Survive the Thing That Used to Eat Them (2026-09-21)

Four ways a PT draft could disappear without saying so. Items **A3**, **A4**, **A5**
and **C10** of `docs/workflow-review-fixes.md`.

- **The set editor's `cancel` now cancels.** Every stepper press used to commit
  straight through, and for equipment it carried forward into every later
  unfinished set on the way, so `cancel` closed the editor over changes already
  applied. Edits buffer into a per-set draft and commit once, as a patch of only
  what changed. `LOG SET` commits and ticks; `SAVE SET CHANGES` commits and leaves
  completion alone; a recorded run's editor says `APPLY SET CHANGES`, which applies
  into the run draft that `SAVE CHANGES` still has to write.
- **Collapsing a history row no longer discards the edit in it.** The draft is held
  above the row, keyed by session, and includes any set editor still open. A
  collapsed row with unsaved work says `UNSAVED CHANGES`. A draft is dropped by a
  successful save or an explicit discard, and by nothing else.
- **A deleted set stays deleted.** The run screen used to grow every short set list
  back to the prescription on load, which existed for v1 drafts — they recorded
  only ticks — but undid real deletions. The persisted format now says which lists
  are v1 remnants. A side effect: raising a routine's set count no longer reaches
  into a run already under way.
- **A half-written routine survives leaving the screen.** `PtRoutineEdit` parks
  itself in localStorage whenever it differs from what is saved, restores on
  return, and asks before restoring a draft taken against a routine that has
  changed since. `DONE` is now `SAVE ROUTINE`, `CANCEL` is `BACK`, and
  `DISCARD DRAFT` is the explicit way to throw the work away.

### PT Runs Keep What They Recorded (2026-09-21)

A finished PT run is a record of what happened, and editing the routine is not
retroactive. Item **A1** of `docs/workflow-review-fixes.md`.

- **Reading a recorded set no longer re-resolves it.** `resolvePtCheck` fills only
  the fields the CURRENT prescription has room for and nulls the rest, which is
  right for a new set and destructive for an old one. The run editor writes back
  what it reads, so taking an exercise to bodyweight and saving the run — even a
  notes-only save — deleted every weight it had logged. Recorded rows now read
  through `recordedPtCheckActuals`, which returns them as stored.
- **A set stores the kinds it was done under.** `ptSetChecks.measure` and
  `ptSetChecks.resistanceKind` travel with the eight actuals through the DB, the
  backup and the CSV, so a reader no longer has to ask today's routine what an old
  set's values mean. Rows written before these columns infer their context from
  what they stored, and keep the gap — an unrelated save does not stamp today's
  routine on them.
- **Values already erased by this bug do not come back.** There is nothing left to
  recover them from, and no repair is attempted.

### Band Loading, Drop Rounds and Exact Loads (2026-09-19 → 2026-09-20)

Band-assisted and weighted work — chin-ups, pull-ups, nordic curls — logged as a
real load instead of a bodyweight guess, so it feeds e1RM, records and the TM
prompt like anything else. `docs/design/band-loading.md` is the rationale record.

- **Effective load = raw + added − assistance**, where raw load is the
  movement's UNASSISTED load and *not* anyone's bodyweight. `bandProfile` on
  `Lift` / `Exercise` holds the raw load, one measured assistance per band and
  an optional cap on suggested added weight; `bandLoad` on `Set` /
  `AccessorySet` / `DropRound` is the immutable record of what a set actually
  was. Measured: chin/pull 191 raw at 105 / 50 / 30 / 10 assistance, nordic 145
  raw at 75 / 40 / 30 / 10. The same four physical bands assist the two
  movements very differently because a stiff band's assistance depends on how
  far it is stretched at the working position.
- **The load is recorded exactly, not snapped to 5 lb.** It is a record of
  something that already happened, not a prescription being proposed, and the
  added-weight stepper moves in 2.5s — a 5 lb grid swallowed half of every press,
  so two sessions genuinely a plate apart wrote the same `sets.weight`, and a
  band measured at 87 read back as 85.
- **Suggestions rank by least assistance, not nearest load.** Distance decides
  only down to one plate step; after that the least-assisted option wins. With
  exact loads the nearest candidate at a 190 target is "Purple band plus 30 lb
  hanging off you" (exactly 190) rather than "unassisted" (191), and nobody rigs
  an assistance band in order to carry more weight.
- **Profiles are opt-in.** A profile does not add controls, it REPLACES them:
  the weight stepper disappears. An earlier build turned band loading on for any
  name matching chinup / pullup / nordic, which took the stepper away from a
  chin-up deliberately set up as `plateMode: 'total'` with a base weight of 0 to
  log a real belt total, and decided by spelling — "Chin-ups" was banded,
  "Chinup (neutral grip)" was not. `bandProfileFor` now reads saved profiles
  only; `defaultBandProfile` prefills the settings dialog and nothing else.
- **`BandProfile.accepted` states provenance instead of inferring it.**
  `clearSeededBandProfiles` undoes the old seed by comparing against the
  templates it could have written — and someone who ticks the box and accepts
  the offered measurements unchanged produces those bytes exactly, so their
  opt-in was read as the seeder's own work and nulled on the next start. The
  flag works *through* the byte compare: no template carries it, so a saved
  profile can never match one. Same move as `ptSetChecks.recorded` replacing an
  all-null guess. The fixup also runs on import, because a backup from a seeded
  database carries those rows too.
- **Each set snapshots the whole calibration table**, not just the band it used.
  Without the other three, changing which band a finished set used had only the
  *current* profile to price them with, and a recalibration keeps all four names
  while changing every number under them — so merely opening a set in history
  and touching its dropdown twice re-priced it for good.
- **Drop rounds** (`accessorySets.dropRounds`) carry their own weight, reps and
  band snapshot, and survive logging, editing, history and backups. Completed
  assistance exercises collapse, including after extra sets.
- **A dialled-in setup survives the prescription moving under it.** The band
  twin of `weightTouched`: editing an earlier set cascades weights through the
  whole exercise, and re-suggesting on that cascade silently discarded the band
  the user had already chosen, mid-exercise.
- CSV gains band / raw / assistance / added columns only when band work is
  present; JSON backups carry every field. `tests/e2e/bands.spec.ts` opts in and
  checks the exact effective load rather than a rounded one.

### PT Checklists (2026-09-17)

Rehab work, kept deliberately apart from training. Today → PT, plus `/pt`,
`/pt/new`, `/pt/:routineId/edit` and `/pt/:routineId/run`. No fifth nav tab: PT
matters while injured and should not take up a quarter of the nav the rest of
the time.

A PT routine is a checklist, not a session. It answers "did I do the work
today", and nothing in it reaches training maxes, records or e1RM — which is why
it gets its own five tables rather than riding on `exercises` + `accessorySets`,
whose rows hang off a 5/3/1 `sessions` row and would need a synthetic session
per rehab day to exist at all.

- **Prescription** (`ptRoutines`, `ptExercises`): name, description, an optional
  video link, a set count, and two orthogonal axes — what a set is *measured* in
  (reps / time / distance) and what *resistance* it carries (none / weight /
  band). A backward sled walk is 3 × 50 yd at 180 lb; a band pull-apart is
  3 × 15 reps on a red band. Distance carries its own unit (`yd`/`m`/`ft`)
  rather than inheriting the accessory log's unit-less column, which the CSV
  header calls metres and the screen renders as feet.
- **Running it** (`store/pt-store.ts`): ticks live in localStorage and **nothing
  is written to the database until FINISH**, which commits the session, a check
  row per prescribed set, and any notes in one transaction. So there is no
  pending PT session, nothing to reconcile on resume, and DISCARD is a store
  reset rather than a delete racing a completion — the whole drift class in
  COMMON_MISTAKES #5 has nothing to act on. A run is dated from when it
  *started*, so one begun at 11pm belongs to that day.
- **Unticked sets are recorded too.** A row per prescribed set, done or not, is
  what makes "6/8" a fact about the run instead of an inference from how many
  rows happen to be there.
- **Editing is a draft** (`savePtRoutine`): the builder holds the whole routine
  in memory and commits on DONE, so CANCEL leaves the database untouched and a
  new routine cannot exist half-built. Removing an exercise that a past run
  performed archives it rather than deleting it — the run still names what was
  done instead of pointing at a missing id.
- **Video links are allowlisted to http/https** (`isSafeVideoUrl`). The link is
  a string the user pastes and it is rendered as an `href`; `javascript:` and
  `data:` URLs execute on click.
- **Retiring a routine** is `archivePtRoutine` (from its edit screen), the
  non-destructive half of the pair: the routine leaves the start list, every run
  of it stays in history under its real name, and RESTORE puts it back.
  `deletePtRoutine` is still there and still takes the runs with it.
- **PT gets its own CSV** (`exportPtCsv`, Settings → DATA, shown once there is
  any PT history). Not extra rows in the existing sheet: that one is shaped
  around a 5/3/1 session — lift, week, weight, is_amrap — and a rehab check has
  none of them, so folding it in means a dozen permanently blank columns and a
  `lift` column holding a routine name. JSON backup carries all five PT tables.
- **CLEANUP ORPHANS covers PT** (`buildPtCleanupPlan`). Nothing in the app can
  create a PT orphan; an import can, and left alone they are invisible —
  `getPtSessionDetail` drops a check whose exercise is missing, so a run that
  recorded three sets renders as 2/2.
- **Verified in a real browser**: `tests/e2e/pt.spec.ts` builds a routine, runs
  it, reloads mid-run to prove the ticks survive, finishes, reads the run back
  out of history, then archives and restores the routine with its history
  intact.

### Diagnostic Trace for Rest Timer, Audio and Notifications (2026-09-17)

Settings → APP → DIAGNOSTICS. Off by default; records nothing while off.

Every failure in this area is silent — `playTone` swallowed its errors, a
notification that never fired left nothing behind, a reaped service worker
reported nothing — and none of it reproduces on a desktop, so the only
instrument had been asking the user one scenario at a time. This records what
actually happened and hands it back as text: COPY, SHARE, or SHOW and select by
hand (an installed iOS PWA is exactly where a clipboard write gets refused).

- **Page sink** (`src/lib/trace.ts`): a ring buffer written **synchronously** to
  localStorage, because iOS can suspend a process between an `await` and its
  continuation and lose the write that mattered. Not the app's own SQLite/OPFS —
  that goes through a Worker, and a frozen worker is one of the things under
  investigation.
- **Worker stamps** (`src/workers/rest-timer-protocol.ts`): a Worker has no
  storage, so every tick now carries the worker's own `at` and a shared `seq`. A
  hole in `seq` means the worker lost time; a large `lag` means the page did.
  `elapsed` alone can show neither. A heartbeat that survives the hidden-page
  pause resolves the ambiguity between "paused as designed" and "gone".
- **Audio ladder**: `tone` → `resumed` → `armed` → `ended`, laid out so the
  three candidate worlds (resume never settled / clock not advancing / WebAudio
  fine and the loss is below it) are told apart by which record is missing.
- **SW sink** (`src/lib/trace-sw-store.ts`): IndexedDB, because a service worker
  cannot reach localStorage. `sw.boot` at script evaluation is the record that
  turns "the SW notification did not arrive" into evidence — a second boot means
  the first worker was killed. **Removed 2026-09-17**: it recorded nothing in
  any capture from a real device, and a zero meaning "the sink never worked"
  reads exactly like a zero meaning "the worker did nothing". Dead code that
  reports a false negative is worse than no code. What the SW does is inferred
  from the page side now.
- **Verified in a real browser**: `verify:sw` leg H drives a real service worker
  and asserts both halves come back non-empty. Disabling the SW sink fails it.

Ceiling, stated in `docs/diagnostic-trace.md`: nothing runs while the process is
suspended, `showNotification` resolving is not proof of display, and nothing
below WebAudio is visible. The gaps are read as data rather than papered over.

**First capture, and what it settled (2026-09-17).** An installed iOS PWA, 686
records over 12 minutes:

- **The locked-phone case is a clock, not a bug.** Across a 316-second lock the
  monotonic clock advanced **23 seconds** — iOS stops it while the device
  sleeps, and `setTimeout` counts against it. A 90-second bell armed before a
  lock is not dropped; it is postponed by the whole sleep. An app switch behaves
  completely differently (clock keeps running, bell fires 3 s late on return),
  which is exactly the difference reported from the device.
- **The tick worker is fine.** 295 ticks, zero gaps in its sequence, receipt lag
  ≤ 55 ms while visible.
- **F108, found in the capture**: `playTone` only resumed a context whose state
  was exactly `suspended`. WebKit's third state, `interrupted` — what a lock or
  another app's audio produces — was never asked to resume, so the note was
  scheduled against a stopped clock and sounded on the next touch. Captured
  armed at t+581.0, sounding at t+611.4, released by the tap that hit SKIP.
  Fixed: resume whenever the state is not `running`, with the attempt raced
  against a deadline so an unsettled resume is recorded rather than awaited
  forever. The stale note is **recorded, not yet dropped** — whether to drop it
  is a live decision.
- **TEST CUE** added to DIAGNOSTICS: the bell on demand, from a real tap, with
  no 90-second wait and no notification chime to mask it. **Result: the cue is
  audible on an installed iOS PWA** — six taps, six completed notes, confirmed
  by ear. The original "no bell" was the silent switch, plus a 150 ms tone
  masked by the notification chime landing 0.4 s earlier, plus F108. No platform
  gate is warranted; what remains is cue design.
- **KEEP ALIVE** was added to DIAGNOSTICS as an experiment and **removed the
  same day**. It worked — an inaudible loop held the iOS process alive across a
  175-second app switch, with no `page.beat` gap over 2.9 s where the control
  went dark for 31.9 s. But nothing consumed that aliveness: the tick worker
  still pauses while the page is hidden, and the run that proved the mechanism
  had notifications off, so a bell arriving on time was never demonstrated. A
  working mechanism with no product behind it, costing battery and an audio
  session per rest, is what rots. The result is kept in
  `docs/verification/2026-09-17-keepalive-and-audio-clock.md`, which is enough
  to rebuild it deliberately if the app-switch case ever earns the work.

Ceiling, stated in `docs/diagnostic-trace.md`: nothing runs while the process is
suspended, `showNotification` resolving is not proof of display, and nothing
below WebAudio is visible. The gaps are read as data rather than papered over.

**First capture, and what it settled (2026-09-17).** An installed iOS PWA, 686
records over 12 minutes:

- **The locked-phone case is a clock, not a bug.** Across a 316-second lock the
  monotonic clock advanced **23 seconds** — iOS stops it while the device
  sleeps, and `setTimeout` counts against it. A 90-second bell armed before a
  lock is not dropped; it is postponed by the whole sleep. An app switch behaves
  completely differently (clock keeps running, bell fires 3 s late on return),
  which is exactly the difference reported from the device.
- **The tick worker is fine.** 295 ticks, zero gaps in its sequence, receipt lag
  ≤ 55 ms while visible.
- **F108, found in the capture**: `playTone` only resumed a context whose state
  was exactly `suspended`. WebKit's third state, `interrupted` — what a lock or
  another app's audio produces — was never asked to resume, so the note was
  scheduled against a stopped clock and sounded on the next touch. Captured
  armed at t+581.0, sounding at t+611.4, released by the tap that hit SKIP.
  Fixed: resume whenever the state is not `running`, with the attempt raced
  against a deadline so an unsettled resume is recorded rather than awaited
  forever. The stale note is **recorded, not yet dropped** — whether to drop it
  is a live decision.
- **TEST CUE** added to DIAGNOSTICS: the bell on demand, from a real tap, with
  no 90-second wait and no notification chime to mask it. **Result: the cue is
  audible on an installed iOS PWA** — six taps, six completed notes, confirmed
  by ear. The original "no bell" was the silent switch, plus a 150 ms tone
  masked by the notification chime landing 0.4 s earlier, plus F108. No platform
  gate is warranted; what remains is cue design.
- **KEEP ALIVE** added to DIAGNOSTICS, off by default — an experiment, not a
  feature. An app switch suspends the page process (82 s backgrounded, `page.beat`
  dark throughout, monotonic clock advancing the whole time), so the bell fires
  on return rather than on time. WebKit keeps a page running while it plays
  media, so this plays an inaudible 16-bit dithered loop for the length of a
  rest to see whether the process survives. `navigator.audioSession` is set to
  `ambient` so it mixes with the user's music rather than interrupting it.
  Protocol and how to read the result: `docs/diagnostic-trace.md`. If the
  process still goes dark, the deliverable is honest UI copy instead.

### Rest-timer recovery checkpoints (2026-09-11)

- A completed set now rings at both configured checkpoints (90 s and 180 s by default), leaving
  easy-versus-hard recovery to the lifter instead of guessing from the next exercise.
- A missed set skips those checkpoints and rings once at its configured recovery time (5 min by
  default). Exercise boundaries no longer change the timer schedule.

### UX Audit Pass — Interaction, Navigation, IA (2026-09-05)

Seventeen findings from a workflow audit, addressed in one pass. The terminal/logbook aesthetic is
unchanged throughout; every change is to interaction, not visual identity.

**Critical**

- **Rest-timer settings were wired to nothing.** `restTimer1/2/Fail` were stored, validated on
  import, exported — and never read: `restStatus` ran off four constants. `restThresholds(settings)`
  now feeds `restStatus`, `restTarget` and `restNotificationTargets` alike. The rows are relabelled
  to the contexts they actually control (Between sets / Between exercises / After a missed set), and
  the transition rest is now *longer* than the between-sets rest, not shorter.

**High**

- **Rest timer counts down** to that target, names the context, shows a depleting rule, and offers
  `+30s`. It was a stopwatch whose finish line was invisible.
- **`SessionBar`** — the strip the rest timer occupies now shows what's still owed when no rest is
  running (`WARMUP 3/3 · MAIN 1/3 · ROW 0/5 …`, each segment scrolling to its block), and becomes
  `COMPLETE SESSION` once everything is logged. Finishing was previously a button at the bottom of a
  long document, with no signal that an untouched block existed.
- **Accessory weight changes no longer rewrite the training max.** Logging set 1 at an unprescribed
  weight used to write a new `accessoryTrainingMaxes` row with no confirm and no undo. Now the whole
  slate has to run at the same off-prescription weight, and it is *offered* after the session
  (`AccessoryTmModal`) — the rule main lifts already followed.
- **Settings grouped by decision frequency** — PROGRAM / TRAINING / EQUIPMENT / APP / DATA, sticky
  jump row, EQUIPMENT collapsed. `CUT ALL TMS`, `CLEANUP ORPHANS` and `IMPORT` are gathered into one
  labelled irreversible block instead of sitting inline beside the theme swatches.
- **Onboarding is two steps.** The old step 3 restated step 2's values read-only; the training-max
  list is the review and carries START TRAINING. Per-lift equipment/cross-block setup is demoted to
  `advanced` — it was program design offered before the first session.

**Medium**

- SKIP LIFT and EXIT WITHOUT SAVING moved behind a `session options` disclosure; COMPLETE is alone.
- Stats folded into History as a RECORDS mode plus a per-lift header above the chart; the STATS tab
  is gone (`/stats` stays routable). Two destinations answered the same question.
- The cycle-week squares — which reopened on a left tap and skipped on a right one — are now labelled
  `‹ REOPEN WEEK n` / `SKIP TO WEEK n ›` with the consequence in the label.
- One pick-one idiom: `ToggleChip` everywhere, all native `<select>`s retired.
- AMRAP targets are tappable (one tap fills the reps field) and the reps stepper is marked as
  directly editable; a 5 → 14 AMRAP was nine taps.
- When the linear cursor runs off the end, the page scrolls once to the first unfinished independent
  block instead of going quiet.
- Today folds the warmup ladder and full main list behind `full session ▸`; assistance and START now
  sit above the fold.
- Lift chips: status keeps the colour permanently, selection moved to a fill plus `▸`.

**Low**

- `/workout` with no session offers a real button instead of a span styled like a link.
- History badges the sessions that set a PR, evaluated against prior work only (`prSessionIds`).
- History's view mode persists alongside its lift filter.
- Exercise names in History's session detail open their history, matching the rest of the app.

### Mutation Testing Restored + First Post-pnpm Baseline (2026-07-29)

`pnpm test:mutation` had been dead since the pnpm migration (2026-07-17), failing before it read any
config: Stryker globs `@stryker-mutator/*` relative to its own package, and pnpm's isolated
`node_modules` leaves only core/api/instrumenter/util there, so it loaded zero TestRunner plugins.
Naming the plugins explicitly in `stryker.config.mjs` resolves them from the project root.

**Baseline over `src/lib`** — 1530 mutants, 15 files, ~9m: **91.50%** (1375 killed + 25 timeout
detected, 128 survived, 2 no-coverage). Well clear of the `break: 40` gate and above the `high: 80`
target. 100% on `audio-cues`, `cleanup`, `format`, `rest-timer-worker`.

**After two hardening passes: 93.20%** (1401 killed + 25 timeout, 102 survived, 2 no-coverage).

Then hardened the weakest module, `assistance.ts`: **78.10% → 80.00%** by Stryker's count (+7 tests).
The scoped run reported 97.14% for the same code; neither figure is the whole truth, and the gap is
worth understanding before trusting either — see the caveats below. Of the 21 mutants Stryker still
calls survivors there, 18 are the taxonomy constants, verified killed by hand-mutation. Real detection
is 102/105. The survivors were
16 unasserted taxonomy constants — `ASSISTANCE_SECTIONS`, `SECTION_LABEL`, `EXERCISE_CATEGORIES`,
`CATEGORY_LABEL`, where an emptied array collapses the slot list and a blanked string ships a
headerless section — plus two real gaps: `accessoryRecencyRanks` was only tested walking worse→better
rank (an unconditional overwrite passes that too), and no test covered an exercise losing its category
entirely, which must *delete* its assistance default rather than move it.

Three survivors remain and are **equivalent mutants** — documented, not chased:

- `accessoryRecencyRanks`: `ri < cur` → `ri <= cur`. Differs only when `ri === cur`, and both then
  store the same value.
- `getAssistanceDefaults`: dropping `if (rows.length === 0) return {}`. SQLite accepts `IN ()` and
  returns no rows, so the fall-through still yields `{}`. The guard is a fast path, not a correctness
  gate.
- `getAssistanceDefaultPicks`: dropping `if (entries.length === 0) return []`. `getLatestAccessoryTms`
  carries its own empty-input guard.

Then `export-import.ts`, which held 52 survivors — 40% of everything remaining, and down from 84.36%
in June as the module grew: **80.00% → 89.23%** (+8 tests). The killable survivors were almost all in
`exportCsv`: the empty placeholder cells that keep columns aligned across the three row shapes were
never asserted, because the existing tests used `toContain`, which cannot see a blank cell turn into
content. Pinning whole 11-column rows for each shape closed them. Also covered: an accessory holding
both logged sets *and* a note (the note-only pass must not emit a duplicate row), notes scoped to their
own session, `typeof row !== 'object'` on its own (the existing test passed `[null]`, which the
`row == null` arm catches first), and several id-less rows in one table not being read as duplicates.

Remaining next targets, both already at or above the 80 target so the expected yield is low:
`exercise.ts` (82.50%) and `plate-loading.ts` (80.00%).

`calc.ts`'s 25 timeouts were checked and need no work. They are not infinite loops: every one is
`ArrowFunction → () => undefined` on an exported top-level function, or an emptied module constant.
Because `calc.ts` feeds every screen, those mutations make screen tests hang on a `waitFor` for a
weight that never renders, and Stryker exhausts its timeout budget before the unit assertions run.
Hand-mutating four of them — `roundToNearest5`, `estimated1RM`, `WARMUP_PERCENTAGES`, `JOKER_MIN_REPS`,
covering both mutant shapes — fails `calc.test.ts` in under two seconds each. Detection is decisive;
only the label is misleading. The cost is run time, not quality.

**Two measurement caveats — read before chasing a survivor here.**

*`perTest` reports false survivors for import-time code.* Module-level constants are evaluated when the
module loads, before any test body runs, so Stryker cannot attribute them to a test and runs an
unrelated subset. In `export-import.ts` that accounts for roughly seven "survivors" —
`PENDING_EXPORT_KEY`, `MAX_IMPORT_BYTES`, the error-message arithmetic, and `importJson`'s
`typeof parsed !== 'object'` — every one of which was verified killed by hand-mutating the source and
running the suite. The printed score understates the module. Probe before writing a test.

*The same mutant can score three different ways.* `assistance.ts`'s 18 taxonomy-constant mutants were
credited as `Timeout` in the scoped run (screen tests hang on a blanked label before the direct
assertions run, and Stryker counts a timeout as detected → 97.14%) and as `Survived` in the full run
(a different covering-test subset → 80.00%). Hand-mutating two of them fails `assistance.test.ts` in
737 ms, so they are genuinely killed and both printed figures are wrong — one high, one low. Treat a
scoped run as a triage tool, never as a score, and confirm any constant-mutant verdict by hand.

`export-import.ts` is the counter-example worth noting: its scoped and full runs both reported 89.23%
exactly, because its killable survivors live inside functions the tests call directly.

Genuinely equivalent mutants in `export-import.ts`, documented rather than chased: the `importSpec`
`dates` arrays (`dates: []` → a bogus field name is inert because no row carries it; `dates: ['setAt']`
→ `[]` is masked by the round-trip, since the raw ISO string `fromSqlRow` revives is the identical
`Date`), the `parseDates` loop under that same masking, and `if (key === 'exercises')` → `true`
(`pickCols` strips `category` from every other table, so the `single_leg` migration cannot fire).

### Design System Consolidation (2026-06-30 → 2026-07-28)

Visual pass across every screen, no behavior change. `SectionLabel` (the light eyebrow beside `Rule`)
and `ToggleChip` (the one-of-N toggle idiom) extracted as primitives and adopted app-wide; set lines
unified on `SetReadout` across Today, Workout, History, and HistoryEdit; TM chart restyled; the
cycle-shape controls in Settings unified and made to survive a 360px viewport.

- `--color-info` added as a 14th token (deload state), across `@theme` and every theme.
- Theme collection expanded to **11**: OLED (new default), OLED Light, Rosé Pine, Frappé, Macchiato,
  Mocha, Latte, Solarized, Gruvbox, Nord, Dracula. `resolveThemeKey` maps the legacy `dark`/`light`
  keys onto OLED / OLED Light.
- `prefers-reduced-motion` handled once, globally, in `src/index.css` — no per-site guards.

### STATS Screen (2026-06-30, extended 2026-07-28)

Read-only third view: best estimated 1RM per lift (with the set that produced it) plus the heaviest
weight **actually** lifted, and the training-max trajectory per lift. Pure views over existing data —
no writes, no schema.

### Generalized Plate Loading (2026-06-30)

`usesBarbell: boolean` generalized into `{ plateMode: none|paired|total, implementBase }` on both
`Lift` and `Exercise`, so hex bars, belt squats, dip belts, and plate-loaded cables all read correctly.
`calcPlates(target, base, mode, plates)` distributes pairs or singles; `resolveLiftLoading` /
`resolveExerciseLoading` derive the effective mode, falling back to the legacy flag so no row needed a
backfill. Full rationale in `docs/design/plate-loading-model.md`.

### Wathan e1RM + Robust AMRAP Seed + Configurable Deload Week (2026-06-27, 2026-07-17)

- **Wathan replaces Epley** — `estimated1RM = weight / (0.488 + 0.538·e^(−0.075·reps))`, with
  `reps === 1` short-circuiting to `weight`. More accurate outside the ~5–17 rep band and asymptotic
  rather than unbounded. Consequence: `targetReps` can be unreachable (returns `null` when
  `todayWeight / prev1RM ≤ 0.488`) and is floored at 2, since a 1-rep target could never reach a
  higher prior estimate.
- **Robust AMRAP seed** — the target is seeded from the **median** Wathan estimate over the last 3
  AMRAPs (`seedE1Rm` / `SEED_WINDOW`) instead of back-calculating a single set, so one stray high-rep
  set can no longer inflate it. `getRecentAmraps` counts only completed non-deload sessions and at most
  one AMRAP per `(cycleId, week)`, so a redo can't skew the median.
- **Configurable cycle length** — `settings.hasDeloadWeek` and `cycleFinalWeek(hasDeloadWeek) → 3 | 4`.
  A 3-week cycle progresses TMs after week 3 with no light week. `effectiveSupplementalWeek` resolves
  deload supplemental volume from `settings.deloadSupplemental` (`skip` / `normal` → week 1 / `deload`).
  Runtime verification: `docs/verification/2026-06-27-deload-toggle.md`.

### Flexible Lift Roster + Cross-Lift Supplemental (2026-06-19 → 2026-06-23)

The four seeded lifts are no longer fixed. Lifts can be added, renamed, reordered, archived
(history preserved, dropped from the active roster), or hard-deleted before they have history.

- **`cycles.closedThroughWeek`** — a high-water mark of the highest contiguous fully-completed week,
  recomputed from sessions and self-healing via `syncClosedThroughWeek`. Freezing closed weeks is what
  lets the roster change mid-cycle without reopening finished weeks or prematurely closing live ones.
  A reopened week (a fresh `pending` row beside an old `completed` one) stays open until the redo lands.
- **`liftSupplementals`** — per-training-day cross-lift blocks: N×M of another main lift's movement at
  that lift's FSL weight or a percentage of its TM. Logged into `workout.loggedCrossSets`, independent
  of the linear `currentSetIndex` model, and persisted to `sets` as `type: 'cross'` with their own
  `liftId`.

### Assistance Slots (2026-06-24 → 2026-07-20)

Replaced the per-lift accessory roster with three fixed slots per session — push, pull, legs+core —
plus unconstrained extras.

- Exercises are tagged `push | pull | legs | core`; the four categories collapse onto three sections.
  The legacy `single_leg` tag is renamed to `legs` on boot and on import.
- The slot picker floats previously-used exercises above the alphabetical rest, ranked by recency over
  the lift's last 3 completed sessions.
- **`assistanceDefaults`** (unique on `liftId, section`) persists the lift's current pick; picking in a
  session or from Today updates it ("last pick wins"). Re-tagging an exercise cascades its default onto
  the new section.
- **`liftAccessories` dropped** — the first destructive migration, safe because it held only
  assignments; logged sets live in `accessorySets`.
- Default accessory scheme is 3×10 at 75% of the accessory TM (`accessoryWeight`).

### Per-Exercise Session Notes (2026-07-14 → 2026-07-17)

`accessoryNotes` — one free-text note per `(session, exercise)`, distinct from `Session.notes` and from
any single set, with a unique index enforced through `ADDITIVE_MIGRATIONS`. `NotesField` supports a
bullet-list mode with Tab/Shift+Tab nesting; `NotesText` is the read-side counterpart. Note-only
accessories (no logged sets) still get a CSV row.

### Session Lifecycle Hardening (2026-07-17 → 2026-07-20)

EXIT used to delete only child rows, leaving an empty `pending` husk that held the week open; both EXIT
and Today's abandon path trusted the store's stale session copy, so a session resumed after a killed
post-complete modal could have real logged data wiped.

- `discardPendingSession` — DB-status-guarded, with the status check **inside** the transaction so
  there is no await gap; no-op on completed sessions.
- `reconcileActiveSession` — one reconciliation point for every entry that resumes from
  `workout.activeSession`; returns the live pending row or `null` when the stored session is stale.
- In-flight guards on COMPLETE / SKIP / EXIT (double-tap duplicated accessory rows); a confirm before
  redoing an already-completed lift; the persisted store cleared after import (stale session ids).
- `getCycleDoublingCandidates` and `getRecentAmraps` dedup a redo to the latest attempt per week.

### Positional Set Lists Use `<Index>` (2026-07-18 → 2026-07-20)

The linear set list rendered with `<For>`, which remounts every row when the array is rebuilt with fresh
object refs — re-firing the active row's ref and yanking page scroll to the linear cursor on unrelated
cross-lift logging. `SetSection` switched to `<Index>`: rows update in place, refs fire only on a
genuine transition, and every mutation can go back through a single `rebuildAllSets`. The same class of
bug had already broken hold-to-repeat on steppers in HistoryEdit and LiftSetupModal.

Also added the `typecheck` script (`tsc -b`) — the root tsconfig is a solution file (`files: []`), so
`tsc -p tsconfig.json` checks nothing and reports a false green.

### pnpm Migration (2026-07-17)

npm → pnpm across scripts, CI, and Stryker. `pnpm install --frozen-lockfile` replaced `npm install` in
the deploy workflow, which also resolved the long-standing `npm ci` blocker.

### Import + Persisted-Store Validation (2026-06-11)

- `validateImportShape` runs **before** the destructive clear: a non-array table value, a non-object
  row, or a duplicate id now rejects with a friendly error instead of crashing mid-transaction or
  silently erasing a table while the import "succeeded".
- `PERSISTED_VALIDATORS` — per-key shape checks on rehydrate, so a wrong-typed value under an
  allowlisted key is dropped rather than grafted into the reactive store.
- `detectAmrapPRs`: a 0-rep AMRAP is never a PR and never a record.

### Post-Session TM Adjustment Prompt + Cycle-End Doubling Recommendation (2026-05-31)

Two linked features that replace silent/fixed TM progression with performance-driven suggestions:

**Feature 1 — Post-session TM prompt**: After completing a non-deload session, `getSessionTmRecommendation`
computes `e1RM = weight × (1 + reps/30)` for the AMRAP set and derives `suggestedTm = round(e1RM × 0.9, 5)`.
If `(suggestedTm − currentTm) / currentTm ≥ 15%`, `TmRecommendationModal` surfaces with an editable
suggested TM (±5 lb stepper). User accepts or dismisses; cycle-advance logic runs after either action.
Week 4 (deload) is skipped entirely.

**Feature 2 — Cycle-end doubling**: `getCycleDoublingCandidates` runs before `applyTmProgression` fires
(so pre-progression TM state is readable). A lift qualifies if: (a) all three working-week AMRAP sets
showed ≥10% suggested TM delta, and (b) no mid-cycle TM bump (feature 1 acceptance) occurred. Qualifying
lifts appear in the `CycleCompleteModal` under a STRONG CYCLE banner with per-lift `+Xlbs` buttons that
apply a one-time 2× increment (e.g. 5 lb → 10 lb, 10 lb → 20 lb) on top of the normal progression.
Auto-progression still fires for all lifts regardless; doubling is opt-in.

Threshold constants: `SESSION_TM_BUMP_THRESHOLD = 0.15`, `CYCLE_DOUBLE_THRESHOLD = 0.10`,
`CYCLE_START_TOLERANCE_MS = 60_000` (distinguishes auto-progression TMs from user bumps).

18 new tests in `src/lib/tm-recommendations.test.ts`; 2 in `src/lib/cycle.test.ts`. 468/468 pass.

*Superseded 2026-07-17: the e1RM formula is now Wathan, not Epley. The thresholds, the modal flow, and
the doubling eligibility rules are unchanged.*

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
- **e1RM PR** — strictly higher estimated 1RM than any prior AMRAP (Epley then; Wathan since 2026-07-17)

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

Unit and component integration tests covering `src/lib`, `src/screens`, `src/store`, `src/db`, and the components that own real logic. Vitest v8 coverage enforces ≥80% line, branch, function, and statement thresholds over `lib` / `screens` / `store`. Stryker (`pnpm test:mutation`) mutates `src/lib` with `inPlace` + `perTest` analysis; the run fails below a 40% score (`break`), with 80% as the `high` reporting target.

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

CLEANUP ORPHANS button in Settings → DATA. Deletes `accessoryTrainingMaxes` rows with a missing `exerciseId`, deletes `accessorySets` rows with a missing `sessionId`, and archives exercises with no surviving logged sets. Gated behind confirm dialog. Detection logic extracted to `buildCleanupPlan` (pure function) with unit and RTL screen test coverage.

*Updated 2026-06-25: with the per-lift roster (`liftAccessories`) gone, "in use" means "has surviving logged sets" — a never-logged library exercise is now an archive candidate (reversible).*

### Manual Week Override

CYCLE section in Settings shows the current week with skip-forward buttons (1–3 or 1–4, per the cycle-shape setting). Clicking a future week marks all remaining sessions in skipped weeks as `skipped` (creating missing lift sessions as needed) and advances program state. Gated behind confirm dialog.

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

`TmChart` in the History By Lift view refactored to dual-series SVG with shared date-based X axis. TM plotted in accent colour; estimated 1RM from each AMRAP set plotted in dashed warn colour. Legend shows each series only when it has 2+ data points. (Restyled 2026-07-17; the e1RM series switched from Epley to Wathan on the same date.)

### Rest-Timer Notifications (Service Worker)

First half of the old "Push Notifications" plan, shipped 2026-08-09 (`a0fc86c`). A custom injectManifest service worker (`src/service-worker.ts`) arms one-shot timers for both completed-set bells, the single failed-set bell, and the 2 h stalled-session mark, coalesced by `tag` and cancelled on rest stop/skip, session clear, or unmount. Permission is requested from the Settings toggle gesture, not on first load; with no SW controlling the page the same targets fall back to in-page `setTimeout`s.

Runtime-verified 2026-08-09 (Chrome desktop, production preview): the nudge fires with the tab backgrounded. The chime follows OS notification-sound policy — the Notification API exposes no sound control on desktop Chrome. Details: `docs/verification/2026-08-09-rest-timer-notifications.md`. The Web Push backend step is deliberately deferred — see Planned. iOS: installed PWA only, prefers Web Push; not installed = no notifications.

Hardened 2026-08-09 (SW hardening pass, following a code review): the page now runs the reliable timers (a SW's own `setTimeout` does not keep the worker alive — see `.claude/COMMON_MISTAKES.md` #11) and the SW mirrors them; with SW control the page fires only while the tab is hidden, so the backgrounded case no longer depends on SW survival (**corrected 2026-09-16, F107** — the visible-tab half of that policy was wrong: the SW it deferred to is normally dead by the 90 s bell, so nothing fired. The page now fires whatever the visibility, tag-coalesced with the SW's). `index.html` is precached and navigations are network-first with shell fallback, so offline cold launches render the app instead of a dead page. Cache eviction on activate is scoped to the `precache-` prefix. Details + browser-leg TODOs: `docs/verification/2026-08-09-swe-hardening.md`.

---

## Planned

### Push Notifications — Web Push backend (deferred)

The SW `setTimeout` scheduling path (implementation-order steps 1–3) shipped
2026-08-09 — see Done, Rest-Timer Notifications. What remains is step 4: a real
Web Push leg for the cases SW timers cannot reach.

**Would need**: a Cloudflare Worker + VAPID keys + a push endpoint, and the
device **online at arming time** — a server cannot know when a rest started
unless the page tells it. Conflicts with this app's offline-first core; parked
until SW scheduling proves inadequate in the field.

**Platform reality**

- Desktop + Android, browser open: SW timers cover foreground and background.
- iOS 16.4+ (installed PWA only): notifications available, but prefer Web Push —
  SW suspension makes local timers unreliable.
- iOS Safari (not installed): no notification support — platform limit.
- Browser closed / tab discarded anywhere: only Web Push reaches the user.

**Dead end, don't watch** — Notification Triggers (`showTrigger`), the OS-held
timer API that would have covered closed-browser + offline with no server.
Google explicitly ended development (2025): no consistent cross-platform
experience. Not a future path.

---

### Onboarding — Methodology Overview

Add an informational section to the setup wizard explaining 5/3/1 basics before the user enters training maxes.

**Key terms to define**
- **Training Max (TM)** — the weight the program calculates sets from; typically 85–90% of true 1RM
- **AMRAP (Plus sets)** — the final main set each week: lift as many reps as possible; performance drives joker sets and TM recommendations
- **Cycle structure** — week 1 (5s), week 2 (3s), week 3 (5/3/1), and optionally week 4 (deload);
  TMs increment when the cycle closes. Reflect the user's actual cycle-shape setting, not a fixed 4.

---

### Post-Session TM Prompt (from weight adjustments)

If the user bumped up the weight on the top set (AMRAP set) relative to the planned weight, surface a prompt at session completion: "You lifted Xlb on your top set — want to update your training max?" Opt-in only; TM does not change unless confirmed.

- Compare logged weight vs planned weight on the AMRAP set
- Only trigger if logged weight > planned (voluntary bump up, not a bail)
- Skip if cycle is on deload week (no AMRAP)

---

### Training Volume Insights

The STATS screen exists but only shows records and TM progression. Still missing, per-session and
per-week:
- Total tonnage (sum of weight × reps across all sets)
- Set count by category (main / supplemental / cross / accessory)
- Weekly frequency — how many days trained

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

### Assistance Rep-Volume Targets

Category tagging and the three push / pull / legs+core slots shipped in 2026-06. What remains: sum
logged reps per section per session and show progress toward Wendler's 25–100 reps from each bucket.

---

### Session Notes Indicator in History

Session and per-exercise notes render inside an expanded session detail, but a collapsed row gives no
sign they exist. Surface an indicator (dot or truncated preview) on rows that have notes, so annotated
sessions are findable without expanding each one.

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

### Workout Reminders (Scheduled Notifications)

Separate from rest-timer notifications (covered in `Push Notifications` above). Recurring
weekly schedule (M / W / F at 6 PM, etc.) that fires a notification reminding the user to log
a session.

- Reuses the shipped rest-timer SW schedule/cancel protocol (`src/service-worker.ts`) — third tag, recurring arming; Web Push still required for browsers-closed / iOS legs
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

*Threat model: static Cloudflare-Pages PWA, no server, no auth, client-authoritative. Primary risk is
XSS → OPFS read/write; supply chain is the realistic active threat.*

Shipped mitigations:

- **CSP** — one identical policy string in three places: the `<meta>` in `index.html`, `public/_headers`
  (production), and `preview.headers` in `vite.config.ts`. The other headers differ deliberately —
  `_headers` also sets `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and a
  stricter `Referrer-Policy`.
- **SQL identifier guard** — `assertIdent` in `src/db/sqlite-table.ts`.
- **Import** — `MAX_IMPORT_BYTES` checked before `file.text()`; `validateImportShape` rejects before the
  destructive clear; per-table `COLS` allowlist strips unknown keys.
- **Persisted store** — `PERSISTED_KEYS` allowlist plus per-key `PERSISTED_VALIDATORS`, behind a
  `STORAGE_VERSION` gate that drops rather than throws.
- **Route slugs** — `HistoryEdit`'s `:sessionId` coerced through `Number.isInteger(n) && n > 0`.
- **Dev-only escape hatch** — `window.__e2eResetDb` is behind `import.meta.env.DEV`.
- **Supply chain** — deploy workflow least-privilege (`contents: read`, `persist-credentials: false`),
  `pnpm install --frozen-lockfile` + `pnpm audit signatures`, weekly Dependabot on npm and Actions.
  These were bypassed by the deploy step itself until 2026-09-15: it ran `pnpm dlx wrangler`, which
  appeared in neither `package.json` nor the lockfile, with a production token. `wrangler` is a
  pinned devDependency invoked via `pnpm exec` now, so it is covered by all three (F73).
- **PWA cache** — `registerType: 'prompt'` with `skipWaiting`/`clientsClaim` false. The service
  worker is `injectManifest` and imports no workbox runtime, so `cleanupOutdatedCaches` does
  nothing: it hand-rolls its own eviction of stale `precache-`-prefixed caches on `activate`. The
  flag is still set in `vite.config.ts` and was described as a mitigation here and in
  `ARCHITECTURE_MAP.md` — one wrong claim in three places (F91).

See "Security Hardening Pass (2026-05-22)" and Round 2 under Done for the original rationale.

### Open items

From the deep code review (`docs/deep-code-review.md`; state in
`docs/deep-code-review-fixes.md`). This section read "No open items" until 2026-09-15, which was
true when written and had since stopped being true.

- **Fixed** — **F65** (a single 503 while online permanently poisoned the offline shell, defeating
  the product's core promise) and **F66** (the same missing `response.ok` gate on the cache-first
  precache branch); **F73** (unpinned `pnpm dlx wrangler` with a production token); **F41** (exercise
  name uniqueness was a check-then-act with no storage constraint behind it — now
  `idx_exercises_name_nocase`); **F84** (the migration script's hardcoded seed tables had drifted, so
  a migration could import a duplicate exercise that could not then be renamed).
- **Open** — **F08**: a valid JSON object carrying no recognised backup tables passes
  `validateImportShape` and still clears every table. **F101**: `idx_exercises_name_nocase` is an
  additive migration and migrations swallow errors, so installs that already hold duplicate exercise
  names silently keep no uniqueness guarantee.

### Future considerations

- ~~Switch deploy from `npm install` → `npm ci`~~ — moot as of the pnpm migration (2026-07-17):
  `pnpm install --frozen-lockfile` doesn't hit the npm-specific rolldown optional-cpu lockfile
  bug (verified locally), so it replaced `npm install` directly in `.github/workflows/deploy.yml`.
- **Subresource Integrity / dependency lockdown** — would catch a tampered CDN delivery, but
  all assets are self-hosted today so impact is low. Revisit if any external `<script>` lands.

---

## Tech Debt

### Open items

From the deep code review. This section read "No open items" until 2026-09-15.

- **F69** — the coverage gate's `include` covers `lib/`, `screens/` and `store/` only, so
  `components/`, `db/` and `hooks/` are unmeasured. Most of the review's component findings live
  where the gate cannot see, and `test:coverage` runs only in CI (see `CLAUDE.md` on the deploy gate).
- **F71** — `tests/e2e/**` is type-checked by nothing: `tsconfig.e2e.json` is referenced by ESLint
  but by no compiler entry point, and `playwright test` transpiles without checking. The same gap
  covers `playwright.config.ts`, `stryker.config.mjs`, `eslint.config.js` and `scripts/`.
- **F74 / F85** — the E2E suite runs in no workflow and 6 of its 32 specs fail. Dormant is the worst
  of the options.
- **F78** — the E2E suite points at `pnpm dev`, where the service worker is not registered and
  `public/_headers` does not apply, so it exercises neither the SW, the production bundle nor the
  production CSP. Structurally bound to the dev server by `helpers.freshStart`'s `__e2eResetDb` hook.
- **F87** — the test client diverges from the code it stands in for.
- **F100** — `deloadTms` cannot be made idempotent without recording that a training-max row came
  from a deload rather than from the user; folds into **F39**'s provenance column.
- **Fixed** — **F79**: `scripts/verify-notify-hardening.js` existed, passed, and was invoked by
  nothing; it now runs in CI as the `verify-sw` job with two added legs.

### Resolved 2026-07-29 — dead code and stale naming

Four inert-but-misleading leftovers, found while reconciling the docs against the tree.

- ~~**Dead Stryker exclusion**~~ — `stryker.config.mjs` negated `!src/lib/exportImport.ts`, a name that
  stopped existing when the module was renamed to `export-import.ts`. The glob matched nothing, so
  export-import was being mutated all along (last report: 178 killed / 33 survived). Entry deleted; the
  `mutate` list is unchanged in effect.
- ~~**Dead branch and stale comments in `src/test-setup.ts`**~~ — `MockWorker` carried a "calc worker"
  RPC protocol (and a `lib/calc` import to service it) with no live caller, plus a `ResizeObserver` stub
  left over from the removed History virtualizer. Both deleted; the remaining stub only speaks the
  rest-timer protocol, which is the one Worker the app constructs under test. Comments referencing
  `fake-indexeddb` and TanStack Virtual — neither a dependency — reworded. 880/880 still pass, which is
  what proves the removed code was dead.
- ~~**`scripts/migrate-history.py` emitted a dropped table**~~ — its roster section wrote
  `liftAccessories` rows. The key was ignored on import (absent from `COLS` / `importSpec`), so it was
  inert. Removed, with a note explaining where assistance assignment lives now.
- ~~**Epley named in Stats**~~ — `src/screens/Stats.tsx` and `Stats.test.tsx` comments still said
  "Epley". The assertions were already correct (Wathan and Epley agree to within a rounded pound at 5
  reps, which is why the drift went unnoticed); only the naming was stale.

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
