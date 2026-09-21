# Workflow review — implementation plan and fix ledger

**One document: the whole plan, the code for each change, and the state of each item.**

This is both the design record and the tracker. A row's state changes here in the same
commit as the code it describes. Nothing else tracks this work.

---

## Provenance

Seven documents, written in one 51-minute chain on the night of 2026-09-20 → 09-21,
all against the same tree (`d222835`, working tree clean but for untracked docs).
No source file changed between the first and the last, so **every line anchor across
all seven is cross-comparable** and every anchor in this document was re-verified
against `d222835` while writing it.

| Time | Document | Role |
|---|---|---|
| 23:22 | `ui-review-2026-09-20.md` | Review — **UI#1–10** |
| 23:33 | `codex-workflow-review-2026-09-20.md` | Review — **WF#1–6** |
| 23:44 | `codex-workflow-efficiency-review-2026-09-20.md` | Review — **EF#1–7** |
| 23:56 | `codex-proposed-fixes-and-changes-2026-09-20.md` | Proposal — **CX#1–22** |
| 00:03 | `proposed-fixes-2026-09-21.md` | Proposal — **A/B/C/D** |
| 00:09 | `proposed-fixes-2026-09-21-addendum.md` | Cross-read of CX |
| 00:13 | `codex-proposed-fixes-2026-09-21-addendum.md` | Cross-read of A/B/C/D |

Those seven were working documents and are **deliberately not in the repository.** Their
content is superseded: every finding was re-derived from source here, every anchor
re-verified, and the thirteen places where one of them was wrong are recorded in
**Corrections applied to the source documents** at the end. Source IDs (`UI#`, `WF#`,
`EF#`, `CX#`) are kept throughout so a finding can still be traced to where it came from,
but nothing here depends on reading them.

**23 raw findings → 21 items** (UI#3 ≡ EF#2, and UI#10 folds into the same editor
change), **plus E1**, found while comparing the two proposals and present in neither.
**22 rows.**

Only `ui-review` has *structurally* guaranteed independence — nothing else existed when
it was written. The other two reviews and the first proposal each state they did not read
their predecessors, and each predecessor was on disk at the time. That is a self-report,
not a proof. It does not weaken any individual finding; every one below was re-derived
from source here.

> **This document is the only record.** It is both the plan and the ledger: the reasoning
> for each item, the code, and its state. Nothing else tracks this work, and there is no
> separate evidence document to consult. Where a source review's browser reproduction
> mattered, it is quoted in the item itself — see A1's, which is the one finding whose
> repro sequence is not otherwise derivable from the code.

---

## States

| State | Means |
|---|---|
| `open` | Untouched. |
| `wip` | Being worked now. Not a claim of anything. |
| `fixed` | Code changed **and** a named regression test that fails against the old code exists. No exceptions — see rule 1. The owning code commit is identifiable through the row's Git history; its SHA can be recorded after that commit exists. |
| `fixed-by` | Closed by another item's fix. Evidence names the owning ID. |
| `wontfix` | Deliberate. The decision and its reason are in Notes. |
| `blocked` | The exact missing dependency is named in Notes. |

## Rules

1. **`fixed` requires a test that fails against the old code. No exceptions in this plan.**
   Every item here is application code, and the house ledger's rule 1(b) exception covers
   only config/tooling with no runtime to assert against — explicitly *"never a way around
   (a) for application code."*

   An earlier draft exempted C2, D1 and D2 as "wording, visual check is enough". That was
   wrong on both counts. The test framework already exists for all three
   (`AccessoryLog.test.tsx`, `HistoryEdit.test.tsx`, `BandSettings.test.tsx` are each
   already in the repo), and more importantly **none of the three defects is really about
   wording**:
   - **D1** is divergence across five entry points. Assert they all agree, without pinning
     which string they agree on.
   - **D2** is conditional rendering.
   - **C2** is a stray element in one branch of a `Show`.

   Each has an invariant that a test states better than a screenshot, and states
   *dynamically* — see each item's Tests section. A test that hardcodes a label is the
   wrong test, not a reason to skip testing.

   For the five data-loss items A1–A5 this is not negotiable — write the failing test first.
   A green build proves nothing about data loss. Per the project rule, verify a fix by reverting
   it **into a file copy**, never with `git checkout <file>`.
2. **A test's expected value is stated independently of the implementation.** Never derive
   it from the same constant, helper or config the code under test reads, and never build
   the fixture so the assertion holds by construction. Both fail the same way: the test
   passes against a broken implementation, which is the one case it exists to catch.

   Two test-design risks discussed for D1:
   - Rendering five isolated `<BandSettings label="X"/>` to check the five entry points
     agree. They agree because the test said so; it passes against today's divergence.
   - Computing the expected visible-entry-point count as `5 - GATED_SITES.length`.
     No source code currently reads that list. If implementation and test expectations
     shared it, an accidental policy change could change both together and escape
     detection. A test-only list does not automatically track changes to the JSX gates.

   Write `{ enabled: 5, disabled: 2, absent: 2 }` and render the real call sites. An
   *intentional* policy change then has to edit both the gate and the expectation — that
   friction is the feature, not a maintenance cost to design away.

3. **A row is updated in the same commit as the code change it describes.** Ledger and
   code land together or neither lands.
4. **Persistence changes never share a commit with layout changes.** A failure has to be
   isolable to one or the other.
5. **Format changes are additive and backward-compatible**, verified against old DB,
   draft, and import fixtures. No backfilling invented history.
6. **`main` is protected.** Every batch lands through a PR; one stacked PR per sub-batch
   via `gh stack`. Verify a merge actually reached `main` by commit ancestry, not by the
   MERGED label.
7. **Scope is closed.** Accessibility, WCAG, contrast and keyboard navigation were
   excluded by all three review briefs. Nothing here reopens that, beyond not regressing
   what exists.

---

## Status board

| ID | Pri | Area | Sources | Primary file | State | Evidence |
|---|---|---|---|---|---|---|
| **A1** | P1 | PT data loss | EF#1 · CX#1 | `src/lib/pt.ts` | `fixed` | 11 tests red at `d222835`: `pt.test.ts` ×4, `PtSessionEditor.test.tsx` ×4 (new file), `export-import.test.ts` ×2, `pt-set-actuals.test.ts` ×1 |
| **A2** | P1 | Workout data loss | WF#1 · CX#2 | `src/store/workout-store.ts` | `fixed` | 11 tests red at `e52c562`: `workout-store.test.ts` ×6, `AccessoryPicker.test.tsx` ×5 |
| **A3** | P2 | PT draft model | UI#3 · EF#2 · UI#10 · CX#3/#4 | `src/components/pt/PtSetList.tsx` | `fixed` | 13 tests red at B2: `PtSetList.test.tsx` ×9 (new file), `PtRun.test.tsx` ×3, `PtSessionEditor.test.tsx` ×1 |
| **A4** | P2 | PT draft model | EF#3 · CX#5 | `src/store/pt-store.ts` | `fixed` | `pt-store.test.ts` ×6 red at A5, ×2 more guarding behaviour that must not regress |
| **A5** | P2 | PT draft model | EF#4 · CX#6 | `src/screens/PT.tsx` | `fixed` | `PT.test.tsx` ×5; 4 red at A3, the 5th guards the save-error behaviour A5 must not break |
| **B1** | P2 | Misleading state | WF#2 · CX#9 | `src/screens/Workout.tsx` | `fixed` | `Workout.test.tsx` ×9, 7 red at A2; 15 existing finish tests updated to the new contract |
| **B2** | P3 | Misleading state | EF#7 · CX#8 | `src/screens/PtRun.tsx` | `fixed` | `PtRun.test.tsx` ×2 red at `d222835` (`1/0` single, `2/0` combined) |
| **B3** | P2 | Bands | EF#5 · CX#16 | `src/lib/band-loading.ts` | `open` | |
| **C1** | P2 | Bands | UI#1 · CX#13 | `src/screens/Workout.tsx` | `fixed` | `Workout.test.tsx` ×3, `AccessoryLog.test.tsx` ×3; 4 red at C2 |
| **C2** | P3 | Bands | UI#2 · CX#14 | 6 call sites | `fixed` | `AccessoryLog.test.tsx` ×3, `HistoryEdit.test.tsx` ×5; 5 red at E1 |
| **C3** | P2 | Bands | UI#5 · CX#17 | `BandLoadControls.tsx` | `open` | |
| **C4** | P2 | Flow | WF#3 · CX#10 | `src/screens/Workout.tsx` | `open` | |
| **C5** | P2 | Flow | WF#5 · CX#11 | `SessionBar.tsx` | `open` | |
| **C6** | P3 | Bands | UI#4 · CX#15 | `BandSettings.tsx` | `fixed` | `BandSettings.test.tsx` ×2, 1 red at C1 (the other guards the unchanged step and bounds) |
| **C7** | P2 | Flow | UI#6 · CX#12 | `src/screens/PtRun.tsx` | `open` | |
| **C8** | P2 | Flow | WF#6 · CX#20 | `AccessoryPicker.tsx` | `open` | |
| **C9** | P3 | Flow | EF#6 · CX#21 | `AccessoryLog.tsx` | `open` | |
| **C10** | P2 | Flow | WF#4 · CX#7 | `PtRoutineEdit.tsx` | `fixed` | `PtRoutineEdit.test.tsx` ×9 red at A4, `pt-routine-draft.test.ts` ×13 (new helper) |
| **D1** | P3 | Bands | UI#7 · CX#18 | `BandSettings.tsx` | `fixed` | `band-entry-points.test.tsx` ×5 (new file), 2 red at C6 |
| **D2** | P3 | Bands | UI#9 · CX#22 | `AccessoryLog.tsx` | `open` | |
| **D3** | P3 | Bands | UI#8 · CX#19 | `BandSettings.tsx` | `open` | |
| **E1** | P3 | Bands | *(neither doc)* | `DropRoundsEditor.tsx` | `fixed` | `DropRoundsEditor.test.tsx` ×2 red at B1 (new file, 5 tests) |

**Totals: 22 items — 9 `open`, 0 `wip`, 13 `fixed`.** Batches 1, 2 and 3 are complete.

**Batch 4 lands as one PR with a commit per item**, at the user's direction — rule 6's
"one stacked PR per sub-batch" is set aside for this batch only. Every other rule stands:
each item still gets its own failing test first and its own ledger row update in the commit
that carries its code.
**By priority: 2 P1 · 12 P2 · 8 P3.**

---

## Batches

One area per session. One commit per sub-batch. One stacked PR per sub-batch.

| # | Batch | Items | Gate before starting |
|---|---|---|---|
| 1 | PT recorded-work integrity | **A1**, **B2** | — |
| 2 | PT draft model | **A3**, **A5**, **A4**, **C10** | A3 settles the draft shape A5 keys by session |
| 3 | Workout work preservation | **A2**, **B1** | A2's identity reconciliation lands before B1 counts anything |
| 4 | Band surfaces | **E1**, **C2**, **C1**, **C6**, **D1**, then **B3**+**C3**, then **D3** | B3 and C3 share one suggestion structure — land together |
| 5 | Flow | **C5**, **C7**, **C9**, **C8**, **D2** | C5 uses B1's finish checks, so batch 3 first |
| 6 | Skip warmups | **C4** | Alone. Needs the completion model from B1 to be explicit first |

A1 carries a schema change and goes **alone in its branch**.

---

# A — Data loss

## A1 · Editing an old PT run erases actuals the prescription no longer covers

**State:** `fixed` · **P1** · Sources: EF#1, CX#1 · Batch 1, alone in its branch

### Problem

`resolvePtCheck` (`src/lib/pt.ts:396`) fills only the fields belonging to the exercise's
**current** `measure` / `resistanceKind` and explicitly nulls the rest:

```ts
weight: exercise.resistanceKind === 'weight' ? pick(actuals.weight, exercise.resistanceWeight ?? null) : null,
band:   exercise.resistanceKind === 'band'   ? pick(actuals.band,   exercise.resistanceBand   ?? null) : null,
```

The nulls are deliberate — `SQLiteTable.update` drops `undefined` keys and would leave a
stale value behind. The problem is not the nulling, it is **who it is applied to**.

`ptCheckActuals` (`:465`) routes a *recorded* row straight back through it:

```ts
export function ptCheckActuals(check: PtRunCheck, exercise: PtPrescription): Required<PtSetActuals> {
  return isRecordedPtCheck(check) ? resolvePtCheck(exercise, check) : resolvePtCheck(exercise)
}
```

and `PtSessionEditor.handleSave` (`PtSessionEditor.tsx:81`) writes the result back:

```ts
checks: setsOf(row.exercise.id!).map((set, i) => ({
  setNumber: i + 1,
  done: set.done,
  ...resolvePtCheck(row.exercise, set),   // ← re-resolves against TODAY's prescription
})),
```

`updatePtSession` (`pt.ts:657`) then **deletes and re-adds** every check row for that
exercise, so the nulls are written to disk:

```ts
await scoped().delete()
if (exercise.checks.length > 0) {
  await db.ptSetChecks.bulkAdd(exercise.checks.map(c => ({ /* … */ weight: c.weight ?? null, /* … */ })))
}
```

**Reproduction (EF#1, verified in a browser at `d222835`):** record a weighted PT run →
set the routine's resistance to NONE → open the run → EDIT RUN → SAVE CHANGES → set the
routine back to WEIGHT. The weights are gone from history and `actual_weight_lb` is blank
in the CSV. Restoring the routine does not bring them back.

The comment at `pt.ts:386` says actuals are pinned at save time *because* the prescription
is editable. **The pin is half done**: the values are stored, the kind they were stored
under is not, so every read re-interprets them.

The blast radius is wider than the reported repro. A **notes-only save** goes through the
same `handleSave` and rewrites every check row for every exercise in the run. That is the
likeliest accidental trigger and gets its own test.

### Fix — three steps, in order

**Step 1 — split the read path from the resolve path.** This stops the erasure without
waiting on new columns, and is where the metadata plugs in afterwards. `resolvePtCheck` is
correct for resolving a *new* set against a prescription and actively destructive for
reading or re-saving an *existing recorded* one. Add a sibling that never invents nulls:

```ts
/**
 * A recorded set, read back as it was stored.
 *
 * Unlike `resolvePtCheck`, this never nulls a field because the CURRENT prescription
 * has no room for it. A row is a record of what happened; the routine it was done
 * under is editable and its edits are not retroactive.
 */
export function recordedPtCheckActuals(check: PtRunCheck): Required<PtSetActuals> {
  return {
    reps: check.reps ?? null,
    seconds: check.seconds ?? null,
    distance: check.distance ?? null,
    distanceUnit: check.distanceUnit ?? null,
    weight: check.weight ?? null,
    band: check.band ?? null,
    equipmentHeight: check.equipmentHeight ?? null,
    equipmentHeightUnit: check.equipmentHeightUnit ?? null,
  }
}
```

Its counterpart on the editor side, used by `handleSave` below — the editor's `PtRunSet`
is already materialized by `toRunSet`, so this only strips the non-actual keys and never
consults a prescription:

```ts
/** The eight actual fields of an editor draft, ready to write. Never re-resolved. */
export function recordedPtRunSetFields(set: PtRunSet): Required<PtSetActuals> {
  const { done, ...actuals } = set
  return recordedPtCheckActuals(actuals as PtRunCheck)
}
```

and route `ptCheckActuals` through it for recorded rows:

```ts
export function ptCheckActuals(check: PtRunCheck, exercise: PtPrescription): Required<PtSetActuals> {
  return isRecordedPtCheck(check) ? recordedPtCheckActuals(check) : resolvePtCheck(exercise)
}
```

`isRecordedPtCheck` (`:476`) already distinguishes the two correctly and stays untouched:
the explicit `recorded` flag when present, all-null otherwise for pre-flag rows.

Then stop `PtSessionEditor.handleSave` re-resolving. The editor's `PtRunSet` is already
fully materialized by `toRunSet` (`PtSessionEditor.tsx:42`), so it can be written directly:

```ts
checks: setsOf(row.exercise.id!).map((set, i) => ({
  setNumber: i + 1,
  done: set.done,
  ...recordedPtRunSetFields(set),   // pass the draft through, do not re-resolve
})),
```

This separation must also reach `PtSetList`: its `describe`, editor initialization and
field visibility currently use the current exercise. Historical rows must preserve their
materialized actuals and use their recorded context throughout that component. Opening
and applying a set edit must not route those actuals through `resolvePtCheck` again.

**Step 2 — record the kind alongside the values.** Display still reads the *current*
prescription to decide which fields to show, so an old run is still described wrong even
once it stops being destroyed. Add two columns to `ptSetChecks`, exactly as `recorded` was
added (`schema.ts:300`):

- `src/db/schema.ts` — append to `ADDITIVE_MIGRATIONS` (append-only, never reorder):
  ```
  `ALTER TABLE ptSetChecks ADD COLUMN measure TEXT`,
  `ALTER TABLE ptSetChecks ADD COLUMN resistanceKind TEXT`,
  ```
  and add both to the `CREATE TABLE ptSetChecks` block at `schema.ts:119` for fresh installs.
- `src/types/domain.ts` — mirror on `PtSetCheck`, **optional** (`?`), since existing rows
  have neither. Keep `PtSetActuals` restricted to its eight actual fields when extending
  `PtRunCheck`; its current `Omit` alias must exclude the new metadata too. Recorded kind
  metadata travels alongside actuals rather than becoming a required numeric/text actual.
- `src/db/index.ts:42` — no new bool/date/JSON handling needed; both are plain TEXT.
- `src/lib/export-import.ts:126` — add `'measure'`, `'resistanceKind'` to the
  `ptSetChecks` `COLS` allowlist. **This is the step both proposals nearly missed**: the
  metadata has to travel through backup/import and the CSV export, not only the DB write.
- Creation: the live-run payload in `PtRun.tsx` captures `measure` and `resistanceKind`
  alongside actuals; `commitPtRun` / `commitPtSession` preserve that context on insert.
- Historical updates: `updatePtSession` (`pt.ts:657`) preserves each existing set's
  recorded kinds. **Never stamp today's exercise kinds onto a historical replacement
  row.** Carry optional metadata through `PtRunCheck`, the historical editor's set-draft
  type, `toRunSet`, `recordedPtRunSetFields` and the update payload. Preserve it when sets
  are renumbered; do not recover it by matching the new set number to an old row. A new
  set added in history uses the context explicitly shown by its editor.
- Readers: `ptCheckActuals`, `ptActualParts` (`:425`), `formatPtCheck` (`:445`), the
  history detail (`PT.tsx:362`) and the CSV row builder (`export-import.ts:484`) read the
  **row's own** kind, using the legacy policy below when absent. Include `PtSetList`'s
  readout and editor controls in this path.

**Step 3 — legacy rows.** Missing kind metadata is separate from missing actuals.
`isRecordedPtCheck` decides whether to read stored actuals or resolve a legacy tick-only
row; it does not determine the recorded kind. For recorded rows without kind metadata,
infer display/edit context only where their stored fields make it unambiguous, otherwise
fall back to the exercise without dropping stored values. Keep missing historical metadata
missing on an unrelated save; do not persist a fallback as known history. Tick-only rows
retain their existing prescription fallback. Values already erased by this bug do not
come back — say so in the release note rather than inventing a repair.

### Files

`src/lib/pt.ts` · `src/components/pt/PtSessionEditor.tsx` · `src/db/schema.ts` ·
`src/types/domain.ts` · `src/db/index.ts` · `src/lib/export-import.ts` · `src/screens/PT.tsx` ·
`src/screens/PtRun.tsx` · `src/components/pt/PtSetList.tsx` · historical set-draft types

### Tests (write these first, watch them fail)

1. `pt.test.ts` — record a weighted check, flip the exercise to `resistanceKind: 'none'`,
   run it through `updatePtSession`, flip back: `weight` survives.
2. `PtSessionEditor.test.tsx` — **notes-only save** rewrites neither actuals nor recorded
   kinds on any exercise in the run, even after changing the routine's kinds.
3. `export-import.test.ts` — round-trip a run with `measure`/`resistanceKind` set; both
   survive export → import.
4. `export-import.test.ts` — the PT CSV's `actual_weight_lb` is populated for a run whose
   routine has since gone bodyweight.
5. `pt.test.ts` — a legacy tick-only row (no `recorded`, no kinds, all actuals null) still
   resolves through the exercise. A legacy row with recorded actuals preserves those
   actuals and does not acquire invented metadata on an unrelated save.
6. `PtSessionEditor.test.tsx` — open and apply a historical set after changing the
   routine's measure/resistance, then save and reload: original values, units and kinds
   survive. Remove an earlier set and verify the survivor keeps its own metadata.

### Acceptance

Record weighted, banded, timed and distance sets. Change their routine types. View, edit an
unrelated field, save, reload, export. Original actuals, units and recorded kinds survive.
Explicit bodyweight/null values stay null. Already-erased values are not claimed to be recoverable.

### As built

Three things took a different shape than the plan wrote them, all in the same direction —
the "read an old set" path needed a name, not just a function:

- **`PtSetReading` and its two constructors** (`readLivePtSet`, `readRecordedPtSet`) instead
  of `PtSetList` deciding for itself. A set has a *context* (which fields it has) and
  *values*, and the two run kinds differ in both: a live set's blank field still means "as
  prescribed" and resolves, a recorded one is already materialized and must never resolve
  again. `PtSetList` takes a `read` prop and defaults to the live reading, so `PtRun` is
  unchanged.
- **`ptRecordedKinds` / `ptRecordedContext`** carry step 3's legacy policy: the row's own
  kinds, else an inference from its values where exactly one measure field and one
  resistance field are filled, else the prescription. `formatPtCheck` and `PtSetList` read
  through it, so an old loaded set still reads as loaded under a routine gone bodyweight.
- **`applyPtSetPatch` / `withPtSetAdded` / `withPtSetRemoved` are generic** over the set
  shape. The editor's draft is `PtRunSet & PtRecordedKinds`, and removing a set renumbers
  every set after it — the kinds have to travel *with* the draft object, since recovering
  them by set number afterwards is exactly the bug the plan forbids.

Also added, not in the plan: `pt-set-actuals.test.ts` covers the two new columns arriving on
a database that already holds rows, the way the eight actual columns are already covered.
Verified by reverting the migration into a file copy — it fails with
`no such column: "measure"`.

---

## A2 · Swapping a fixed assistance slot discards its logged sets

**State:** `fixed` · **P1** · Sources: WF#1, CX#2 · Batch 3

### Problem

`addAccessory` (`src/store/workout-store.ts:243`):

```ts
export function addAccessory(accessory: ActiveAccessory) {
  setWorkout('activeAccessories', (prev) => {
    const isFixedSlot = accessory.slot != null && accessory.slot !== 'extra'
    const kept = isFixedSlot ? prev.filter((a) => a.slot !== accessory.slot) : prev
    return [...kept, accessory]
  })
}
```

The displaced occupant goes, `loggedSets` and all, with no warning and no undo.

### The trap that makes the obvious fix unsafe

Demoting the displaced exercise to `slot: 'extra'` is right, but **on its own it creates a
worse bug**. Every accessory mutator addresses by exercise id using Solid's store
*predicate* form, which applies to **every** matching element, not the first:

```ts
// workout-store.ts:254, :260, :274, :284
setWorkout('activeAccessories', (a) => a.exerciseId === exerciseId, produce(...))
```

So A → B → A, with A retained as an extra and B's replacement pushed as a second entry for
A, means one `logAccessorySet` writes **two** sets and one `editAccessorySet` rewrites both.
Reconciliation by exercise id is a **precondition** of A2, not a follow-up.

### Fix

Retain on **logged sets OR nonblank notes** — `completeSession` (`Workout.tsx:722`) already
saves accessory notes independently of sets, because "wanted to try this, ran out of time"
is real work:

```ts
const worthKeeping = (a: ActiveAccessory) => a.loggedSets.length > 0 || !!a.notes?.trim()

export function addAccessory(accessory: ActiveAccessory) {
  setWorkout('activeAccessories', (prev) => {
    const isFixedSlot = accessory.slot != null && accessory.slot !== 'extra'

    // Re-selecting the current occupant is a no-op, not a reset.
    const existing = prev.find(a => a.exerciseId === accessory.exerciseId)
    if (existing?.slot === accessory.slot) return prev

    const kept = prev.flatMap(a => {
      // The incoming exercise already exists somewhere — as a demoted extra from an
      // earlier swap, or in another slot. MOVE it, never push a second entry: the
      // accessory mutators address by exerciseId with a predicate, which matches every
      // element, so two entries mean one log writes two sets.
      if (a.exerciseId === accessory.exerciseId) return []
      if (!isFixedSlot || a.slot !== accessory.slot) return [a]
      // Displaced. Keep real work as an extra; drop an untouched selection.
      return worthKeeping(a) ? [{ ...a, slot: 'extra' as const }] : []
    })

    // Preserve what the retained entry already held rather than the picker's blank.
    return [...kept, existing ? { ...existing, slot: accessory.slot } : accessory]
  })
}
```

**`AccessoryPicker.alreadyAdded` must change too, or A2 is unreachable.**

```ts
// AccessoryPicker.tsx:93
const alreadyAdded = (exerciseId: number) =>
  props.mode !== 'default' && workout.activeAccessories.some(a => a.exerciseId === exerciseId)
```

That row is `disabled` (`:106`) and rendered greyed with a ✓ (`:115`), and `handleSelect`
(`:152`) returns early on it. A retained exercise is **still in `activeAccessories`** — as
an extra — so the moment A2 preserves it, the picker greys it out and **the swap back
cannot be performed at all**. A2's own acceptance case (log A → swap to B → swap back to A)
is unreachable through the UI.

Worse, nothing catches it: the store tests call `addAccessory` directly, so they pass
against a feature no user can reach.

Fix: `alreadyAdded` must mean *"occupies a slot"*, not *"is present anywhere"*. An entry
retained at `slot: 'extra'` is selectable for a fixed slot, and picking it moves it back
through the same identity reconciliation:

```ts
const occupiesASlot = (a: ActiveAccessory) =>
  a.slot != null && (a.slot !== 'extra' || props.slot === 'extra')

const alreadyAdded = (exerciseId: number) =>
  props.mode !== 'default' &&
  workout.activeAccessories.some(a => a.exerciseId === exerciseId && occupiesASlot(a))
```

Label such a row with what it carries rather than a bare ✓ — *"close-grip bench · 2 logged
sets"* — so moving it back is an informed choice.

**Open sub-decision:** re-selecting a retained entry keeps `existing`'s `tm` and
`calculatedWeight` and discards the picker's fresh ones. That is right when the TM is
unchanged and stale if the user edited it in Settings mid-session. Keeping the existing
values is the safer default (it cannot silently re-price logged work); take the fresh
`tm`/`calculatedWeight` only if a mid-session TM edit turns out to matter in practice.

Discarding stays an explicit action. In `AccessoryPicker`, when the outgoing occupant is
`worthKeeping`, confirm with the keep option as the default:

> *Dips replaces close-grip bench. Keep its 2 logged sets as extra work?*
> **KEEP** / discard

`removeAccessory` (`:280`) remains the deliberate destructive path and is unchanged.

### Files

`src/store/workout-store.ts` · `src/components/workout/AccessoryPicker.tsx`

### Tests (write these first)

1. `workout-store.test.ts` — log A, swap to B, log B, swap back to A. Both exercises hold
   exactly their own sets, notes, band snapshots and drop rounds.
2. `workout-store.test.ts` — **invariant**: `activeAccessories` never holds two entries
   with the same `exerciseId`, asserted across an A→B→A swap.
3. `workout-store.test.ts` — a **notes-only** outgoing accessory survives a swap, and its
   note survives exactly once.
4. `workout-store.test.ts` — an untouched, empty selection is replaced without a prompt.
5. `AccessoryPicker.test.tsx` — **the swap-back is reachable.** After A is retained as an
   extra, its picker row is enabled for a fixed slot and selecting it moves it back with
   its sets intact. This is the test the store-level ones cannot give: they bypass the
   picker, so every one of 1–4 passes while the feature is unusable.

### Acceptance

Log A, swap to B, log B, swap back, reload, finish. No duplicate sets in history or export.
Re-selecting the current occupant does not reset it.

### As built

The store change is as written, with `worthKeeping` exported as `accessoryHasWork` so the
picker can ask the same question. Two things differ:

- **The displacement prompt has three outcomes, not two.** `confirmWithChoice` already
  exists for exactly this: `KEEP` retains as an extra, `DISCARD` removes, and dismissing the
  dialog resolves `cancel`, which abandons the swap. On the plan's two-button question,
  Escape would have to land on one of the answers — and landing on "discard" means pressing
  Escape destroys logged work. Neither answer is what a dismissal means, so it now means
  neither.
- **`existing` is tested explicitly, not through `?.`.** `existing?.slot === accessory.slot`
  reads `undefined === undefined` as true for a legacy accessory with no slot when there is
  no existing entry at all, which made every such add a silent no-op. The base test
  `appends accessory to activeAccessories` caught it immediately.

`AccessoryPicker.test.tsx` now renders through a `ConfirmationContext.Provider`; the picker
needs the context every screen that mounts it already supplies.

The **open sub-decision** is resolved as the plan recommended: a re-selected entry keeps its
own `tm` and `calculatedWeight` rather than the picker's fresh ones, so moving an exercise
back cannot silently re-price work already logged under the old numbers. Revisit only if a
mid-session TM edit turns out to matter in practice.

Test 5's dependency was verified directly: reverting only `alreadyAdded` to its presence
check — keeping every other part of this change — makes
`offers a retained exercise back` fail. That is the test the store-level ones cannot give.

---

## A3 · The PT set editor's `cancel` does not cancel, and `LOG` force-ticks

**State:** `fixed` · **P2** · Sources: UI#3, EF#2, UI#10, CX#3, CX#4 · Batch 2

### Problem

`patch()` (`PtSetList.tsx:55`) calls `props.onPatch` on **every** stepper press:

```ts
const patch = (index: number, fields: Partial<PtRunSet>) => props.onPatch(index + 1, fields)
```

So reps, weight, band and height are committed as they are typed — into `pt-store` during a
live run, into the `sets()` signal inside `PtSessionEditor` for a recorded one. `cancel`
(`:189`) only closes the editor:

```tsx
<button onClick={() => setEditing(null)} class="text-muted text-xs px-2">cancel</button>
```

EF#2 adds the sharper consequence. `applyPtSetPatch` (`pt-store.ts:365`) carries equipment
fields forward into later un-done sets:

```ts
const carried = carriedOnly(patch)
if (Object.keys(carried).length > 0) {
  for (let i = setNumber; i < next.length && !next[i].done; i++) Object.assign(next[i], carried)
}
```

so an abandoned weight change **leaves a trail** through every later unfinished set.

And `LOG` (`:184`) always ticks:

```tsx
onClick={() => { patch(i(), { done: true }); setEditing(null) }}
```

— there is no way to correct a number without re-affirming completion.

Two nested controls named cancel with opposite meanings: this inner one, and
`PtSessionEditor.tsx:141`'s outer `CANCEL`, which genuinely discards.

### Fix — per-set draft plus two named actions

**Draft.** Buffer field edits and commit a **sparse change patch** once. The example below
shows the local editing logic; A5's historical version keeps this state in the session-owned
draft so it survives an unmount. `seedActuals` and `changedPtActuals` are new helper
contracts, not existing APIs:

- `seedActuals(index)` copies the historical row's already-materialized actuals unchanged.
  For a live set only, it may resolve unoverridden values against the prescription.
  Historical field visibility and readout use A1's recorded context, not today's kinds.
- `changedPtActuals(before, after)` returns only actual fields whose values differ,
  preserving explicit nulls. It excludes completion and kind metadata. An unchanged
  field, including one edited and restored to its opening value, is absent from the patch.

```tsx
const [editing, setEditing] = createSignal<number | null>(null)
const [initial, setInitial] = createSignal<Required<PtSetActuals> | null>(null)
const [draft, setDraft] = createSignal<Required<PtSetActuals> | null>(null)

const openEditor = (index: number) => {
  const actuals = seedActuals(index)
  setInitial({ ...actuals })
  setDraft({ ...actuals })
  setEditing(index)
}
const patchDraft = (fields: PtSetActuals) => setDraft(d => ({ ...d!, ...fields }))
const closeEditor = () => { setInitial(null); setDraft(null); setEditing(null) }

const commit = (index: number, done?: boolean) => {
  const fields = changedPtActuals(initial()!, draft()!)
  if (done !== undefined || Object.keys(fields).length > 0) {
    props.onPatch(index + 1, done === undefined ? fields : { ...fields, done })
  }
  closeEditor()
}
```

Every field in the editor body switches from `patch(i(), …)` to `patchDraft(…)` and from
`valueOf(i())` to `draft()!`. Carry-forward then happens **once**, only for equipment
fields actually changed, inside `applyPtSetPatch` — unchanged. Passing the full snapshot
would carry untouched equipment too: correcting set 1's reps could overwrite a different
weight already entered for unfinished set 2. Opening and saving without changes must be
a no-op. Keep `PtSetActuals` limited to actual fields when A1 adds kind metadata to checks.

A sparse patch also preserves the **absent-vs-null** distinction `PtRunSet` documents as
load-bearing (`pt-store.ts:14-20`): *absent* is "not overridden", resolved against the
prescription at save time; *null* is an explicit "none", which is how a step-up done at
floor level records having no box. A full `Required<PtSetActuals>` snapshot materializes
all eight fields on open, so merely opening a set and committing would collapse every
"as prescribed" field into an explicit value and silently detach the set from its
prescription.

**Two actions** (CX#4, adopted verbatim — it is cleaner than a conditional tick, and it
fixes A5's legibility problem in the same stroke):

| Context | Primary | Secondary | Effect |
|---|---|---|---|
| Live run, un-ticked set | `LOG SET` | `SAVE SET CHANGES` | LOG commits **and** sets `done: true`; SAVE commits and leaves `done` alone |
| Live run, ticked set | `SAVE SET CHANGES` | — | Commits, preserves the tick |
| History editor | `APPLY SET CHANGES` | — | Commits into the run draft; the run still needs `SAVE CHANGES` |

```tsx
<div class="flex gap-2">
  <Show when={props.commitLabel === undefined && !props.sets[i()].done}>
    <button onClick={() => commit(i(), true)} class="flex-1 border border-accent text-accent py-2 …">
      LOG SET
    </button>
  </Show>
  <button onClick={() => commit(i())} class="flex-1 border border-border text-muted py-2 …">
    {props.commitLabel ?? 'SAVE SET CHANGES'}
  </button>
  <button onClick={closeEditor} class="text-muted text-xs px-2">CANCEL</button>
</div>
```

`PtSessionEditor` passes `commitLabel="APPLY SET CHANGES"`. The row checkbox
(`PtSetList.tsx:74`) stays the explicit completion control in all cases.

**Transition rules** (CX#3 — left undefined by the first proposal, and each one is a way to
silently lose the draft):

- Opening another set while one is being edited → **retain** the active draft is wrong
  (two open editors); **force an explicit choice** — commit or discard — before the second
  opens. Never silently commit.
- Removing a set while editing it → discard the draft with the set.
- Removing an earlier set must rebind the active draft to the same surviving set, or
  require explicit resolution before renumbering. Never apply it to the next occupant
  of its old index.
- Saving the enclosing run with an unapplied set draft → **resolve it first**. Block
  historical `SAVE CHANGES` and live-run `FINISH` with "One set has unapplied changes."
  Track pending changes across every exercise/routine, including folded sections.
- Live-run navigation (including `BACK TO ROUTINES` and browser Back) must preserve
  pending set drafts or require explicit resolution before leaving. If drafts remain
  memory-only, also guard reload/closing the page when dirty.
- Historical collapse and row switching preserve the pending inner draft through A5.
  They must not silently apply it; returning restores the edit in progress.

### Files

`src/components/pt/PtSetList.tsx` · `src/components/pt/PtSessionEditor.tsx` ·
`src/screens/PtRun.tsx` · `src/screens/PT.tsx` · shared actual-field diff helper

### Tests

1. `PtSetList.test.tsx` — change reps, weight and height, then CANCEL. The set is unchanged
   **and no later set changed** (the carry-forward trail).
2. `PtSetList.test.tsx` — same, in the history editor against `PtSessionEditor`'s local state.
3. `PtSetList.test.tsx` — `SAVE SET CHANGES` on a done set leaves `done: true`; on an
   un-done set leaves `done: false`.
4. `PtSetList.test.tsx` — `LOG SET` commits and ticks, and carry-forward runs **once**,
   stopping at the first already-done set.
5. `PtSessionEditor.test.tsx` — `SAVE CHANGES` with an open unapplied draft is refused.
6. `PtSetList.test.tsx` — a reps-only edit to a 10lb set leaves the next unfinished
   set's separately entered 20lb unchanged. A no-op save and an edit reverted to its
   opening value do not carry equipment forward.
7. `PtRun.test.tsx` — FINISH cannot save while any routine has unapplied edits;
   navigation preserves them or requests resolution, and cancelling departure keeps them.
8. `PtSetList.test.tsx` — removing an earlier set cannot redirect a pending edit to a
   different set. Historical type-change coverage is shared with A1.

### As built

The draft is one signal, `PtSetDraft { index, initial, values }`, rather than the three the
sketch used — `initial` is the whole reason the commit can be sparse, so it belongs next to
the values it is compared against. `changedPtActuals` lives in `lib/pt.ts` beside the other
actual-field helpers.

Two rules landed differently than written:

- **"Force an explicit choice" before opening a second set** is only enforced when the open
  draft is *dirty*. An editor open on untouched values has nothing to lose, and demanding a
  decision to close it would be a prompt about nothing. A dirty one refuses to be displaced
  and says so.
- **"Removing a set while editing it"** is unreachable through the UI: the set being edited
  renders as the editor, so it has no remove control. The guard in `handleRemove` is kept
  anyway — it is two lines and it is where the rule belongs — and the test covers the cases
  that *are* reachable: a removal above the open set rebinds it, one below leaves it alone.

`src/screens/PT.tsx` needed no change here; preserving the draft across a collapse is A5's
half of the work, and until it lands a historical draft still dies with the unmount. The
live run's memory-only drafts are guarded on FINISH (hard block), on BACK TO ROUTINES
(confirm, with `STAY` naming the cancel so it cannot be confused with the set editor's own
CANCEL) and on reload via `beforeunload`.

### Not done

**Renaming `cancel` to `close`** (UI#3's cheaper alternative) is rejected. It makes the
label honest and leaves the carry-forward contamination in place.

---

## A4 · Deleted PT sets come back on resume

**State:** `fixed` · **P2** · Sources: EF#3, CX#5 · Batch 2, after A3

### Problem

`removePtSet` (`pt-store.ts:351`) shrinks the list. `ensurePtSets` (`:287`) grows it back on
every load, and is documented as deliberately one-way:

```ts
export function ensurePtSets(ptExerciseId: number, count: number, routineId = ptRun.routineId): void {
  if (ptSetsFor(ptExerciseId, routineId).length >= count) return
  mutateRun(routineId, state => {
    const list = (state.sets[String(ptExerciseId)] ??= [])
    while (list.length < count) list.push(emptySet())
  })
}
```

`PtRun.tsx:115` calls it for every exercise on every load. Delete the third of three sets,
reload, and there are three again — with the completion count changed under the user.

### The trap: "no marker" does not mean "v1 draft"

The first proposal said: mark a list as seeded, and keep the one-way growth for lists
without the marker, because that is the v1 case the comment protects. **CX#1 of the second
addendum is right that this is wrong.** `STORAGE_VERSION` is 2 (`pt-store.ts:67`), and
**every existing v2 draft also lacks the marker.** Growing every unmarked list would undo a
real deletion on the first launch after the fix — reintroducing the bug for exactly the
users who have one.

The version is available where it matters. `loadFromStorage` (`:143`) already reads it:

```ts
const parsed = JSON.parse(raw) as { v?: number; state?: unknown; paused?: unknown }
if (parsed.v !== STORAGE_VERSION && parsed.v !== 1) return empty
const migrate = (s: unknown): unknown => parsed.v === 1 ? migrateV1(s) : s
```

### Fix — branch on the persisted format version during migration

1. **v2 lists are authoritative**, including an empty array. Never grown.
2. **v1 tick-only data** keeps its provenance through `migrateV1` (`:127`) — flag the
   exercises it rebuilt — and is expanded **once**, when the prescription is available.
   The v1 list only reaches as far as the highest tick, which is the case the existing
   comment protects.
3. **An exercise absent from `sets`** is seeded when it first enters the run. That is
   `ensurePtSets`'s remaining job.

```ts
interface PtRunState {
  // …
  /** ptExercise ids whose list came from a v1 tick-only draft and may still be short. */
  pendingSeed?: string[]
}

export function ensurePtSets(ptExerciseId: number, count: number, routineId = ptRun.routineId): void {
  const key = String(ptExerciseId)
  const run = routineId === null ? ptRun : getPtRun(routineId)
  const existing = run?.sets[key]

  // Absent: first entry into the run, seed to the prescription.
  // Present and short: grow ONLY if it is a v1 remnant, then clear the flag.
  // Present otherwise: authoritative, including []. A deletion is a decision.
  if (existing != null && !run?.pendingSeed?.includes(key)) return

  mutateRun(routineId, state => {
    const list = (state.sets[key] ??= [])
    while (list.length < count) list.push(emptySet())
    if (state.pendingSeed) state.pendingSeed = state.pendingSeed.filter(id => id !== key)
  })
}
```

**The marker lives per routine in the persisted run state, including paused runs**
(`pausedRuns` / `mutateRun`, `:268`) — a multi-routine session switching routines must not
re-seed. Add `pendingSeed` to `PERSISTED_KEYS` (`:69`) **and** to `PERSISTED_VALIDATORS`
(`:97`): a wrong-typed value under an allowlisted key must be dropped, not grafted onto the
reactive store. Also write it in `setupPtRunPersistence`'s explicit `state` object
(`:219`); that serializer does **not** iterate `PERSISTED_KEYS`. Preserve it in paused
states too. Otherwise an app persistence pass followed by reload before the run screen
seeds its sets loses the v1 provenance permanently.

**Do not bump `STORAGE_VERSION`.** The change is additive and every v2 draft without
`pendingSeed` reads correctly as "authoritative, nothing pending".

**Honest limit** (CX): an old v1 draft already re-serialized as v2 has lost its provenance.
Do not claim to tell that apart from a deliberately shortened v2 list. Prefer preserving the
existing list over inventing sets.

### Files

`src/store/pt-store.ts` · `src/screens/PtRun.tsx`

### Tests

Upgrade fixtures, each reloaded **twice** to prove migration and initialization do not repeat:

1. A shortened v2 list stays shortened.
2. An empty v2 list stays empty.
3. A v1 partial tick list expands once, to the prescription.
4. A paused routine's list survives a routine switch and back.
5. An added fourth set survives reload (today's behaviour, must not regress).
6. `pendingSeed` with a malformed value is dropped by the validator, not stored.
7. Load a v1 partial tick list, persist it as v2 **before** `ensurePtSets` runs, reload,
   then initialize. It expands once and clears the marker. Cover both current and paused
   routines, including the normal persistence effect before the run screen mounts.

### As built

As designed. `pendingSeed` is a required `string[]` on `PtRunState` defaulting to `[]`
rather than the optional field the sketch used — a v2 draft that predates the field
restores to `[]`, which reads as "authoritative, nothing pending", so there is nothing an
absent value would say that an empty one does not. `STORAGE_VERSION` stays at 2.

**One behaviour changed beyond the reported bug, and it follows from the same rule.**
`ensurePtSets` no longer extends a list the run already has, so raising a routine's set
count mid-run no longer reaches into a run already under way. The existing test
`leaves what is already recorded alone` asserted the old growth and now asserts the new
contract under a name that says what it means. This is the deletion rule seen from the
other side — a list in the run is the run's own answer — and + ADD SET is still there. An
exercise absent from `sets` is seeded on first entry exactly as before.

---

## A5 · Collapsing a PT history row silently discards set corrections

**State:** `fixed` · **P2** · Sources: EF#4, CX#6 · Batch 2, with A3

### Problem

`toggleDetail` (`src/screens/PT.tsx:127`) clears `detail` and `editing` on collapse, taking
`PtSessionEditor`'s local `sets()` draft (`PtSessionEditor.tsx:59`) with it:

```ts
const toggleDetail = async (sessionId: number) => {
  if (openSession() === sessionId) {
    setOpenSession(null)
    setEditing(false)
    return
  }
  setOpenSession(sessionId)
  setEditing(false)
  setDetail(null)
  // …
}
```

Pressing the inner commit button looks like a commit; `SAVE CHANGES` is still required;
collapsing between the two loses the work with no prompt. Switching to another history row
does the same.

### Fix — two parts, both needed

**(1) Legibility** — done by A3: the inner action becomes `APPLY SET CHANGES`, leaving
`SAVE CHANGES` as the only thing that writes.

**(2) Survival** — lift the draft above the collapsible row, keyed by session id, in
`PT.tsx`:

```tsx
const [runDrafts, setRunDrafts] = createSignal<Record<number, PtRunDraft>>({})
const draftFor = (sessionId: number) => runDrafts()[sessionId]
const isDirty = (sessionId: number) => draftFor(sessionId)?.dirty ?? false
```

- Collapsing or opening another row **preserves** the draft and shows an **UNSAVED CHANGES**
  marker on the collapsed row's header.
- `PtRunDraft` includes both applied run changes and A3's pending inner editor state:
  exercise/set identity, opening actuals, edited actuals and recorded context. Dirty
  detection includes either layer. Lifting only the applied `sets` and notes would still
  lose text entered before `APPLY SET CHANGES` when the child unmounts.
- A draft is cleared only after a **successful save** or an **explicit cancel**.
- A **save error keeps the draft** so retry is possible — `handleSave`'s catch
  (`PtSessionEditor.tsx:86`) already leaves the editor mounted; it must now also leave the
  lifted draft intact.
- Navigating **out of PT** with a dirty draft is guarded, unless the draft is persisted
  across that navigation.

### Files

`src/screens/PT.tsx` · `src/components/pt/PtSessionEditor.tsx`

### Tests

1. `PT.test.tsx` — edit sets and notes, collapse, open another run, return. Changes are
   still there, attached to the correct session.
2. `PT.test.tsx` — two runs edited in turn keep separate drafts.
3. `PT.test.tsx` — CANCEL restores the saved run.
4. `PT.test.tsx` — a simulated write failure preserves the edit.
5. `PT.test.tsx` — change a set **without** pressing APPLY, collapse, visit another run,
   then return. The pending editor values survive under the correct set; SAVE remains
   blocked until resolved, and inner CANCEL restores the pre-edit values.

### As built

`PtSessionEditor` is now fully controlled: `PT.tsx` owns `PtRunDraft` per session and the
editor reads and writes it through props. `PtSetList` gained the same optional lift — pass
`onDraftChange` and it stops keeping its own — so A3's inner editor state travels in
`PtRunDraft.pending`, keyed by exercise id, and comes back open on the same set when the row
is reopened. A live run passes neither prop and keeps its draft locally, which is right: that
screen outlives its own set editors.

Three notes:

- **`dirty` is a flag, as the plan wrote it**, set when something is *applied* and OR'd with
  "any open set editor is holding changes". It is wrong in exactly one direction — a value
  changed and changed back still reads as unsaved — which warns about work that turns out to
  be identical rather than discarding work that is not.
- **Leaving PT is guarded with `useBeforeLeave`** from `@solidjs/router`, which covers in-app
  navigation, plus `beforeunload` for reload and close. The draft stays memory-only; C10's
  persisted-draft machinery is not reused here.
- **The outer `CANCEL` is now `DISCARD CHANGES`.** A3 replaced the set editor's lowercase
  `cancel` with an uppercase `CANCEL`, which left two nested controls spelled identically with
  very different reach — the exact confusion A3 set out to remove, and a test found them
  colliding. The outer one is the pair to `SAVE CHANGES` beside it; `CANCEL` now means the
  set editor and only that.

Test 4 (a failed write keeps the edit) passes against the pre-A5 code too — the editor
already stayed mounted on a save error. It is kept as the regression guard the plan asked
for: the lift must not turn a retryable failure into a lost draft.

---

# B — Misleading state

## B1 · FINISH records an empty or half-done session with one tap

**State:** `fixed` · **P2** · Sources: WF#2, CX#9 · Batch 3, after A2

### Problem

`handleComplete` (`src/screens/Workout.tsx:698`) goes straight to completion:

```ts
const handleComplete = () => runFinishing(async () => {
  const session = workout.activeSession
  if (!session?.id) return
  await completeSession(session, session.id)
})
```

Start OHP, tap FINISH with zero sets logged: Today marks OHP done, selects Deadlift, and
History shows an empty OHP session.

### Fix — branch on what is actually logged

The counting already exists. `segments()` (`Workout.tsx:880`) enumerates every block of
work with `done`/`total` across main, cross and assistance, and reports `total: 0` for an
unfilled optional assistance slot — so **unselected slots do not create warnings** for free.

Enumerate **five** cases (the first proposal's "nothing logged" is too coarse — CX#9):

| Case | Test | Offer |
|---|---|---|
| **Empty** | no logged sets anywhere, no notes | `CONTINUE WORKOUT` / `DISCARD ATTEMPT` / `SKIP LIFT` — never "complete" |
| **Notes-only** | no sets, but session or accessory notes | `CONTINUE` / `FINISH WITH NOTES` — notes are user work and must not be discarded as an empty attempt |
| **Assistance-only** | assistance logged, no main | confirm, naming the outstanding main sets |
| **Partial** | some outstanding | `CONTINUE WORKOUT` / `FINISH WITH N LOGGED SETS`, naming the outstanding sections |
| **Complete** | nothing outstanding | unchanged — direct completion, no extra tap |

```ts
const loggedCount = () =>
  workout.loggedSets.length
  + workout.loggedCrossSets.length
  + workout.activeAccessories.reduce((n, a) => n + a.loggedSets.length, 0)

const hasNotes = () =>
  !!workout.notes?.trim() || workout.activeAccessories.some(a => a.notes?.trim())

const handleComplete = () => runFinishing(async () => {
  const session = workout.activeSession
  if (!session?.id) return

  if (loggedCount() === 0 && !hasNotes()) {
    // Shared action bodies: no nested runFinishing or duplicate confirmation.
    const choice = await chooseEmptyOutcome()          // 'continue' | 'discard' | 'skip'
    if (choice === 'continue') return
    if (choice === 'skip') return skipPendingAttempt(session)
    if (choice === 'discard') return discardPendingAttempt(session)
  }

  if (loggedCount() === 0 && hasNotes()) {
    if (!await confirm('Save this session with notes and no logged sets?', {
      confirmLabel: 'FINISH WITH NOTES',
      cancelLabel: 'CONTINUE',
    })) return
    await completeSession(session, session.id)
    return
  }

  const outstanding = segments().filter(isOutstanding)
  if (outstanding.length > 0) {
    const names = outstanding.map(s => `${s.label} ${s.total - s.done}`).join(', ')
    if (!await confirm(`Still outstanding: ${names}.`, {
      confirmLabel: `FINISH WITH ${loggedCount()} LOGGED`,
      cancelLabel: 'CONTINUE WORKOUT',
    })) return
  }

  await completeSession(session, session.id)
})
```

Extract `skipPendingAttempt(session)` and `discardPendingAttempt(session)` from the
existing handlers' action bodies. Preserve the status-conditional DB operations, stale
session handling, store cleanup, navigation and `finishSession` behavior. These shared
helpers do not acquire `runFinishing` or ask for confirmation themselves. The existing
standalone `handleSkip` / `handleExit` retain their guard and confirmation before calling
them; the new empty-outcome choice already provides both.

**Do not call `handleSkip` or `handleExit` from inside `runFinishing`.** Both handlers
currently acquire that same guard (`Workout.tsx:761`, `:772`), whose `finishing()` check
would immediately return and silently make the selected action a no-op.

**Preserve every existing protection.** `runFinishing` is the single-flight guard;
`completeSession` runs inside `finalizePendingSession`, which is status-conditional so a
resurrected store cannot complete a session the DB already finished (F13). Acquire the
guard once across the choice and action, including the wait for in-flight set mutations.
The new branch sits **before** `completeSession`, never inside it.

### Files

`src/screens/Workout.tsx` · `src/components/workout/SessionBar.tsx` (wording only)

### Tests

1. `Workout.test.tsx` — empty session: FINISH offers continue/discard/skip and writes no
   completed session. Exercise all three choices: continue retains the pending attempt,
   discard removes it, and skip marks it skipped and follows the existing finish path.
2. `Workout.test.tsx` — notes-only session offers FINISH WITH NOTES, saves session and
   accessory notes, and does not fall through to a second partial-work confirmation.
3. `Workout.test.tsx` — assistance-only and partial sessions prompt, naming the outstanding
   sections; CONTINUE returns without writing.
4. `Workout.test.tsx` — fully logged session completes with no extra tap.
5. `Workout.test.tsx` — repeated clicks and a retry never duplicate records (F13/F14 guard
   regression).

### Acceptance

Today and History distinguish skipped from completed sessions.

### As built

`skipPendingAttempt` and `discardPendingAttempt` are extracted as written: no `runFinishing`,
no confirmation of their own, and the existing standalone handlers keep both. Three
departures:

- **Four branches, not five.** *Assistance-only* is a partial session whose outstanding
  block happens to be the main lift, and the partial branch already names the outstanding
  sections — for that case it names MAIN, which is exactly what the table asks for. A
  separate branch would have produced the same prompt from different code. Both shapes have
  their own test.
- **The empty prompt maps dismissal to CONTINUE.** `confirmWithChoice` gives three
  outcomes, and two of them destroy the attempt, so `confirm` is SKIP LIFT, `secondary` is
  the danger-styled DISCARD ATTEMPT, and `cancel` — which is also what Escape and a
  displaced dialog resolve to — returns to the workout. The same reasoning as A2's
  displacement prompt: a dismissal is not an answer, and it must not be the destructive one.
- **`SessionBar` needed no change.** Its control already reads FINISH while work is
  outstanding and COMPLETE SESSION only once every segment is logged, which is precisely the
  distinction this item introduces behind it.

**Fifteen existing tests changed, and they are the behaviour change rather than collateral.**
Most completed an EMPTY session to reach the post-completion modal chain — the cycle roll-up,
the TM prompts — which is the exact tap this item removes. They now put real work in the
session through a `logCompletedWork` helper, so they exercise their own subject instead of
the finish gate. Two kept their shape and answer the new prompt: the accessory-notes test
takes FINISH WITH NOTES, and the in-flight-write test takes FINISH WITH 1 LOGGED after the
release — which also shows the prompt cannot appear until `runFinishing` has awaited the
write.

---

## B2 · PT completion toast reports an impossible count

**State:** `fixed` · **P3** · Sources: EF#7, CX#8 · Batch 1

### Problem

`PtRun.tsx:166-168`:

```ts
const completed = doneCount()
groups().forEach(group => clearPtRun(group.routine.id!))
showToast(`${routineName()} logged — ${completed}/${total()} done.`)
```

`completed` **is** captured before the clear. EF#7 correctly identifies the denominator:
`total()` (`:122`) is a memo over `setsIn(exercises())`, which reads `ptSetsFor` (`:69`) from the
store, and it is interpolated **after** `clearPtRun` emptied it. It reads 0: "1/0 done."

`routineName()` (`:66`) reads `groups()`, which is not cleared, so no label snapshot and no
snapshot object is needed (CX#8 asks for one; CX's own addendum §7 withdraws it).

### Fix — one line

```ts
const completed = doneCount()
const totalSets = total()
groups().forEach(group => clearPtRun(group.routine.id!))
showToast(`${routineName()} logged — ${completed}/${totalSets} done.`)
```

### Files

`src/screens/PtRun.tsx`

### Tests

`PtRun.test.tsx` — finishing 1 of 3 sets shows `1/3 done`, single-routine and multi-routine.
A failed save shows no success message and leaves the draft intact.

### As built

As written, plus one thing the tests forced: the toast is a module singleton with no
reset, so a `waitFor` on its content passed against the PREVIOUS test's message — the
combined-session test read `Rehab logged — 1/0 done.` from the test before it and asserted
nothing. `PtRun.test.tsx`'s `beforeEach` now clears it. The existing failed-save test
gained the missing half of its assertion: no `logged` under the error.

---

## B3 · An unreachable band target is shown without saying it is unreachable

**State:** `open` · **P2** · Sources: EF#5, CX#16 · Batch 4, **with C3**

### Problem

`BandLoadControls.tsx:77` and `:94`:

```tsx
<Show when={props.target != null}><span class="text-muted text-xs">Prescribed: {props.target}lb effective</span></Show>
…
<Show when={props.onSuggest}><button type="button" onClick={props.onSuggest} class="text-accent text-xs text-left">USE SUGGESTED LOAD</button></Show>
```

A 45lb prescription against the pulling calibration renders `Prescribed: 45lb effective`
next to an 86lb suggestion and a button that cannot close the gap. `suggestBandLoad`
(`band-loading.ts:143`) can only pick a band and *add* weight; it can never go below the
strongest band's assisted load.

### The trap: the tolerance rule

The first proposal triggered the warning on the **returned** candidate's distance from
target. That mislabels deliberate picks. `suggestBandLoad`:

```ts
const distance = (c: BandLoad) => Math.abs(effectiveBandLoad(c) - target)
const closest = Math.min(...candidates.map(distance))
return candidates
  .filter(c => distance(c) <= closest + SUGGEST_TOLERANCE_LB)   // closest + 2.5, NOT target ± 2.5
  .reduce((best, c) => c.assistance !== best.assistance
    ? (c.assistance < best.assistance ? c : best)
    : (c.addedWeight < best.addedWeight ? c : best))
```

The allowance is **`closest + 2.5`**, not `target ± 2.5`. It makes no promise that the
returned load is within 2.5lb of the target — a target far outside the available range can
receive an even more distant, simpler candidate within that allowance. That is the
documented "nobody rigs a band in order to carry more weight" rule, working as designed.

**Reachability and preference are independent and can coexist**: a target can fall in an
increment gap *and* have a simpler candidate preferred over the nearest one. Four mutually
exclusive labels lose that.

### Fix — a detailed helper, shared with C3

Return the reasoning, and keep `suggestBandLoad` as a compatibility wrapper so existing
callers do not all have to change:

```ts
export interface BandSuggestion {
  /** The load the existing algorithm selects. Unchanged behaviour. */
  selected: BandLoad
  /** Minimum achievable |effective − target| across ALL candidates. */
  nearestDistance: number
  /** Effective load of a nearest candidate; equal-distance ties prefer the lower load. */
  nearestEffectiveLoad: number
  minAchievable: number
  maxAchievable: number
  /** True when preference (least assistance, least added) took a less accurate candidate. */
  preferenceUsed: boolean
}

export function suggestBandLoadDetailed(profile: BandProfile, target: number, plates: PlateConfig[]): BandSuggestion
export function suggestBandLoad(profile: BandProfile, target: number, plates: PlateConfig[]): BandLoad {
  return suggestBandLoadDetailed(profile, target, plates).selected
}
```

Derive the two messages **independently**:

- **Range / gap**, from `minAchievable` / `maxAchievable` / `nearestDistance` and
  `nearestEffectiveLoad`:
  - `target < minAchievable` → *"Lightest available 86lb — 45lb is not reachable with this calibration."*
  - `target > maxAchievable` → the mirror.
  - in range but `nearestDistance > 0` → *"Nearest available 87.5lb (2.5lb over)."* — an
    increment gap, not unreachable.
- **Preference**, from `preferenceUsed`: at most *"Simpler setup, 2.5lb under."* Never a
  warning on its own.

Show both when both apply. Suppress or relabel `USE SUGGESTED LOAD` only in the
out-of-range case, and offer a direct route into band settings for that movement — or into
plate configuration when plate availability is the limit.

Use `nearestEffectiveLoad - target` for the gap's over/under wording. An unsigned
`nearestDistance` cannot identify which side is achievable, and `selected` can be a
different candidate because of preference. The lower-load tie rule affects only the
nearest-load explanation; preserve the existing algorithm's selected setup and derive
the preference message's signed difference from that selection.

**Never call a target unreachable solely because the selected candidate misses it.**

The prescription is preserved; adopting a suggestion stays an explicit action.

### Files

`src/lib/band-loading.ts` · `src/components/forms/BandLoadControls.tsx` · callers passing
`target` / `onSuggest`

### Tests

`band-loading.test.ts` — calculation cases below, with component assertions for the
corresponding messages in `BandLoadControls.test.tsx`:

1. Exact match available, and a simpler near-match selected → no unreachable message,
   at most a preference note.
2. Increment gap **plus** a preference tradeoff → both messages, independently derived.
3. Target below `minAchievable` → unreachable, with the minimum named.
4. Target above `maxAchievable` → the mirror.
5. `suggestBandLoad`'s return value is byte-identical to today's for every case above
   (the wrapper changes nothing).
6. Nearest candidate above target, below target, and an equal-distance tie: the named
   nearest load and signed difference are accurate even when `selected` is different.

---

# C — Friction on the hot path

## C1 · Band settings sits on every lift's logging screen

**State:** `fixed` · **P2** · Sources: UI#1, CX#13 · Batch 4

### Problem

`Workout.tsx:993` and `CrossBlockLog.tsx:48` render the dialog gated only on the lift
existing:

```tsx
<Show when={lift()}>
  <BandSettings entity={lift()!} kind="lift" label="EDIT RAW LOAD / BANDS" onSaved={…} />
</Show>
<SaveFailureBanner sessionId={workout.activeSession!.id} />
```

Bands apply to about two movements by the calibration table's own account
(`band-loading.ts:27`). Squat day carries a band control above the set grid and every cross
block carries another — and it sits **above** `SaveFailureBanner` (`:995`), so a save error
is pushed down the page by a control nobody on that screen wants.

### Fix

```tsx
<SaveFailureBanner sessionId={workout.activeSession!.id} />
<Show when={bandProfileFor(lift())}>
  <BandSettings entity={lift()!} kind="lift" label="BANDS" onSaved={…} />
</Show>
```

**`AccessoryLog.tsx:167` is gated too.** It carries the same `bands` entry on every
accessory exercise's header row, gated only on `entity()` — so the complaint that motivated
C1 applies to it unchanged, and more often, since a session logs several accessories.
UI#1 never named it and CX#13 said "accessory shortcuts **where appropriate**" without
deciding; this settles it:

```tsx
<Show when={bandProfileFor(entity())}>
  <BandSettings label="BANDS" entity={entity()!} kind="exercise" onSaved={props.onBandProfileSaved} />
</Show>
```

The principle is identical to the lift case and `Settings.tsx:895` is the opt-in route for
an exercise exactly as `:547` is for a lift, so nothing becomes unreachable. Three gated
sites, two always-visible (both in Settings) — the visible-entry-point count is **5 when
enabled, 2 when disabled or absent**, which D1's tests assert independently of the
implementation.

An intentional change to this visibility policy updates both the gates and the test
expectations. Accidentally removing a gate must fail the test.

Same in `CrossBlockLog.tsx:48`, gated on `bandProfileFor(props.movement)`. Setup stays in
Settings (`Settings.tsx:547`, `:895`), where the rest of per-lift configuration lives.
**Move the control below `SaveFailureBanner` regardless of the gate.**

### Confirmed safe

CX#13 warns "do not gate by exercise name or the availability of a calibration template."
Checked: `bandProfileFor` (`band-loading.ts:77`) is already saved-profile-only —

```ts
export function bandProfileFor(entity: …): BandProfile | null {
  const profile = entity?.bandProfile
  return profile?.enabled ? profile : null
}
```

— and its comment states it deliberately no longer consults `defaultBandProfile`. The
name-based hazard was fixed on 2026-09-19 and this gate cannot reintroduce it. CX's warning
describes behaviour to **preserve**, not another bug. A `?.enabled` on top of
`bandProfileFor` would be redundant.

### Files

`src/screens/Workout.tsx` · `src/components/workout/CrossBlockLog.tsx` ·
`src/components/workout/AccessoryLog.tsx`

### Tests

`Workout.test.tsx` / `AccessoryLog.test.tsx` — an ordinary squat and an ordinary accessory render no band shortcut; an enabled band-assisted
movement does; disabling the profile removes it and Settings still reaches it.

### As built

Gated as written, on `bandProfileFor` and never on a name, at all three sites; the Workout
control also moved below `SaveFailureBanner`. The label is `BANDS`, which D1 then makes
derived rather than passed.

**One existing test changed with the policy.** `a band profile saved from an accessory
reaches the exercise list` set a profile up for the first time *from the accessory header* —
the entry point this item removes, since setting one up is what Settings is for. It now
edits the profile of an exercise that already has one, which is the case the shortcut still
serves, and still asserts the save reaches the exercise row and the live logger.

---

## C2 · Orphan `lb` after the band controls

**State:** `fixed` · **P3** · Sources: UI#2, CX#14 · Batch 4

### Problem

The `lb ×` separator sits **outside** the `Show` that swaps the weight stepper for
`BandLoadControls`, which already ends in its own `lb` (`BandLoadControls.tsx:93`):

```
Raw 191lb − assistance 105lb + added 0lb = 86lb effective   lb ×   [10]
```

Six sites:

| File | Line |
|---|---|
| `src/components/workout/AccessoryLog.tsx` | 254 |
| `src/components/forms/DropRoundsEditor.tsx` | 30 |
| `src/screens/HistoryEdit.tsx` | 400 |
| `src/screens/HistoryEdit.tsx` | 455 |
| `src/screens/HistoryEdit.tsx` (timed accessory) | 478 |
| `src/screens/HistoryEdit.tsx` (distance accessory) | 492 |

`SetRow.tsx:186` is the one site that got it right — a bare `×`.

### Fix

Move `lb ×` into the fallback, emit a bare `×` in the band branch:

```tsx
<Show
  when={round().bandLoad}
  fallback={<>
    <Stepper value={round().weight} onChange={v => update(i, 'weight', v)} step={2.5} min={0} fieldLabel={`drop ${i + 1} weight`} />
    <span class="text-muted text-xs">lb ×</span>
  </>}
>
  <BandLoadControls … />
  <span class="text-muted text-xs">×</span>
</Show>
```

### Tests and visual verification

`AccessoryLog.test.tsx` and `HistoryEdit.test.tsx` — render each surface in band mode and
assert the rendered text carries no orphan `lb` between the band summary and the
reps/time/distance control; render in plain-weight mode and assert `lb ×` is present. Both files already
exist.

Plus a focused visual check of each of the six sites in both modes, including reps, timed
and distance accessories in history. Every load has one unit and one multiplication
separator.

### As built

All six sites moved as written. One observation the plan's table does not cover:
**`SetRow.tsx` has the mirror defect.** Its `×` is also outside the `Show`, but bare — so
the band branch reads correctly (which is why the plan called it "the one site that got it
right") while its plain-weight branch renders no unit at all. Left alone: the plan names six
sites and blesses this one, and changing it is a visible edit to the main logger's edit row
rather than the silent cleanup C2 is. Worth its own decision if it ever bothers anyone.

---

## C3 · Suggest and target are missing everywhere except the active logger

**State:** `open` · **P2** · Sources: UI#5, CX#17 · Batch 4, **with B3**

### Problem

`target` / `onSuggest` are passed at exactly two sites — `SetRow.tsx:144` and
`AccessoryLog.tsx:301`. The SetRow edit row (`:183`), the AccessoryLog edit row (`:252`),
the main-set and reps/timed/distance accessory branches in `HistoryEdit`
(`:397`, `:452`, `:475`, `:489`) and `DropRoundsEditor` (`:27`) render neither.

`DropRoundsEditor` is the sharpest case: a drop round is *defined* by dropping to a lower
load, and it is the one band control with no way to ask for one.

### The trap: "today's prescription" is not the historical target

The first proposal said "target = the set's prescribed weight, already available at each
site." **That repeats A1's own mistake on the band side.** In `HistoryEdit` the available
prescription is *today's*, and showing it as the target of a set logged weeks ago
mis-describes the record.

### Fix

- **Use a saved target where one exists. Otherwise show no prescribed target** — never an invented one.
  `SetRow`'s edit row has the set's own recorded prescription and can pass it; `HistoryEdit`
  generally cannot and shows no prescribed-target line. Without a saved target, allow
  an explicit user-entered `Target effective load` for requesting a suggestion, as CX#17
  specifies. Apply this to reps, timed and distance accessory edits too.
- **Drop rounds**: there is no prescription for a drop round. Let the user enter the load
  they want and offer a setup for it. Label it **`Target effective load`**, not
  `Prescribed`. Indicate when the result is not lower than the preceding round — **do not
  silently enforce a drop** or alter completed records.
- **Historical editing defaults to the recorded calibration** (`BandLoadControls.tsx:31`
  already reads `props.value.calibration` first). If the user chooses current calibration
  for a correction, make that choice explicit and hold it in the edit draft until saved.
- A target below the setup's minimum gets **B3's explanation**, not an unexplained higher
  load. Share B3's `BandSuggestion` structure — do not recompute per caller.

Add a discriminated label prop rather than overloading `target`:

```tsx
props.targetLabel?: 'Prescribed' | 'Target effective load'
```

### Files

`SetRow.tsx` · `AccessoryLog.tsx` · `HistoryEdit.tsx` · `DropRoundsEditor.tsx` ·
`BandLoadControls.tsx`

### Tests

1. Suggestions stay opt-in everywhere — rendering a control never mutates a load.
2. CANCEL preserves the original record **and its recorded calibration**.
3. `HistoryEdit` with no saved target renders no prescribed-target line; a desired target
   appears only when explicitly entered by the user.
4. A drop target below the setup's minimum shows B3's explanation.
5. Reps, timed and distance historical accessory branches all support an explicit target
   without inventing a prescription; each retains its recorded calibration until the user
   explicitly chooses otherwise.

---

## C4 · Main sets are locked behind every prescribed warmup

**State:** `open` · **P2** · Sources: WF#3, CX#10 · Batch 6, **last and alone**

### Problem

Logging is tied to one linear cursor. `SetSection` (`Workout.tsx:88-97`):

```tsx
<SetRow
  isActive={workout.currentSetIndex === globalIdx()}
  isCompleted={globalIdx() < workout.currentSetIndex}
```

Someone who warmed up differently cannot reach the main sets without logging warmups they
did not do.

### The trap: the cursor *is* the completion model

**Two independent problems, both real.** An earlier draft of this plan called the first one
"the wrong risk" and kept only the second. That was wrong — a skip has to solve both.

**(a) The cursor and the set array desynchronize.** `logSet` **appends**
(`workout-store.ts:184`, `[...prev, set]`), while `SetRow` reads by global index
(`Workout.tsx:96`, `workout.loggedSets[globalIdx()]`). Those agree only because sets are
logged in cursor order with no gaps. Skip three warmups and log main set 1: `loggedSets`
has length 1, `globalIdx()` is 3, and `loggedSets[3]` is `undefined` — the set the user
just logged renders blank. `editSet(index, …)` (`:187`) addresses the same way, so a
correction lands on the wrong row. The first proposal called these "holes"; mechanically
it is a **shift**, not a hole, but the concern was right.

**(b) The cursor *is* the completion model.**
`isCompleted={globalIdx() < workout.currentSetIndex}` means
advancing the cursor renders the skipped warmups as **completed sets that were never
performed** — the same class of lie as B1's empty finish. It flows straight into
`sectionComplete` (`:829`), `segments()` (`:886`) and therefore into B1's own early-finish
prompt:

```ts
const sectionComplete = (count: number, offset: number) =>
  count > 0 && workout.currentSetIndex >= offset + count

done: Math.max(0, Math.min(count, workout.currentSetIndex - offset)),
```

This is a **state-model change, not a cursor nudge.** Both (a) and (b) follow from the same
root — one integer standing in for "what happened" — and a fix that addresses only (b)
leaves logged sets rendering blank. It is why C4 is last, alone, and after B1 has made the
completion model explicit.

### Fix

1. Skipped warmups get their **own representation** in workout state — a skipped-through
   index, or per-set status — persisted for resume through `PERSISTED_KEYS` (`:44`) +
   `PERSISTED_VALIDATORS` (`:62`), **and** written into `writeSnapshot`'s explicit `state`
   object (`workout-store.ts:138`). This is the same trap as A4: `loadFromStorage`
   iterates `PERSISTED_KEYS` (`:86`) but the serializer does **not**, so a key added to
   the allowlist alone is validated on read and never written. A skip would then survive
   until the first reload and silently vanish.
2. `isCompleted` and the counts distinguish *performed* from *skipped*. Section counts stay
   truthful; B1's prompt respects intentionally skipped warmups rather than listing them as
   outstanding.
3. A route **back** to a skipped warmup.
4. Correcting or deleting a logged set still addresses the right row — this is (a), and it
   needs the set array keyed to the set it belongs to rather than to cursor position.
5. **Scope: warmups only.** Do not generalise the cursor to arbitrary ordering.

**Do not start this alongside any other change to `currentSetIndex`.**

### Tests

Skip all warmups, skip some, log a main set, reload. **The logged main set renders its own
reps and weight** — the direct test for (a), and the one that fails today's append-plus-
index-read pairing. No fake warmup records; counts truthful. The main set still editable
and deletable, with the edit landing on it and not a neighbour. B1's prompt does not list skipped
warmups as outstanding.

---

## C5 · Resting hides FINISH and section navigation

**State:** `open` · **P2** · Sources: WF#5, CX#11 · Batch 5, after B1

### Problem

`SessionBar.tsx:40` wraps the entire strip:

```tsx
return (
  <Show when={!workout.isResting}>
    <div class="fixed bottom-[var(--nav-h)] left-0 right-0 bg-bg border-t-2 border-border px-4 py-2">
```

so the rest timer takes the segment strip, FINISH and section navigation with it. Recovering
them means discovering that "Skip" (rest) is the way back.

### Fix

Specify a layout that holds the timer, a section-navigation control, and FINISH
**simultaneously**. A compact second row is fine.

**Constant height is an implementation option, not the acceptance condition** (CX#6 of the
second addendum — this corrects the first proposal's "heights must stay equal"). The real
requirement: **the reserved bottom space must match the actual combined controls** so the
last content row stays reachable. Do not squeeze everything into an unreadable single row
merely to preserve the old height. If the bar grows, `--nav-h` padding grows with it — the
same padding `7673828` already had to fix once.

"Timer in place of the segment scroller" is withdrawn: it conflicts with keeping section
navigation if that scroller is navigation's only implementation.

- Navigating between sections must **not** stop rest implicitly.
- FINISH uses **B1's checks**.
- Cancelling an early-finish prompt **leaves rest running**.

### Files

`src/components/workout/SessionBar.tsx` · `src/components/workout/RestTimer.tsx` ·
`src/screens/Workout.tsx` (bottom spacing)

### Acceptance

During rest at mobile width (390×844), jump to a section and start or cancel finishing
without stopping the timer first. The last content row is unobscured. Desktop (1280×900)
likewise.

---

## C6 · The band calibration form's direct entry is invisible

**State:** `fixed` · **P3** · Sources: UI#4, CX#15 · Batch 4

### Problem

`BandSettings.tsx:68`–`:81` is five steppers — raw load plus four measured loads — at the
default `step` of 1, all starting at 0 for a movement with no template, all needing values
in the 70–191 range. Reaching 191 is 191 taps or a ~15-second long-press.

`Stepper`'s `emphasized` prop (`Stepper.tsx:16-20`) exists for exactly this:

```ts
// Marks the value as directly editable. The value has always opened a numeric
// keypad on tap — the fastest way to enter a number far from the current one —
// but rendered as a plain readout nobody thought to press. Set this where the
// jump is large and routine (an AMRAP's reps).
emphasized?: boolean
```

This is the largest-jump form in the app and uses it on none of its fields.

### Fix — `emphasized` only

```tsx
<Stepper value={draft()!.rawLoad} onChange={setRawLoad} min={0} fieldLabel="raw load" emphasized />
…
<Stepper value={…} min={0} max={draft()!.rawLoad} fieldLabel={`${name} measured load`} emphasized onChange={…} />
…
<Stepper value={draft()!.maxAddedWeight!} onChange={…} step={2.5} min={0} fieldLabel="maximum added weight" emphasized />
```

**`step={5}` is withdrawn.** The first proposal paired it with `emphasized`; CX#2 of the
second addendum is right that it is a separate behaviour change — it moves both single-tap
and long-press from 1lb to 5lb. Calibration values like 191lb are **measurements**, and a
1lb correction must stay convenient. Preserve each field's existing step and bounds.

The heading "no direct entry" also overstated it: tap-to-type already works. This makes it
**discoverable**.

### Files

`src/components/forms/BandSettings.tsx`

### Acceptance

Type 191 directly into raw load. Adjust to 192 with one tap. Measured-load bounds
(`max={draft()!.rawLoad}`) and the raw-load clamp (`setRawLoad`, `:39`) still apply.
Cancelling leaves the saved profile unchanged. No general `Stepper` redesign.

### As built

`emphasized` on all six fields — raw load, the four measured loads and the added-weight cap
— and nothing else. `step={5}` stays withdrawn.

Two tests rather than one: the first asserts every field is marked editable, the second
asserts the steps and bounds did **not** move, which is the half of this change that is
about restraint. Only the first is red against the old code, by construction.

---

## C7 · PtRun has no sticky action bar

**State:** `open` · **P2** · Sources: UI#6, CX#12 · Batch 5

### Problem

`PtRun.tsx:309-321` puts DISCARD and FINISH at the bottom of a page that grows with every
routine, exercise and set row. `BACK TO ROUTINES` is at the top (`:207`). Workout has a
fixed `SessionBar`; a multi-routine PT session is the longest scroll in the app and the only
logging screen where finishing means scrolling to find the button.

### Fix

A fixed bottom bar reusing `SessionBar`'s shell and the `--nav-h` padding contract:
`n/total done` plus DISCARD and FINISH. The readout already exists at `PtRun.tsx:206`:

```tsx
<Rule label={routineName()} labelSuffix={`. ${doneCount()}/${total()}`} … />
```

- Keep DISCARD **secondary**, with its existing confirmation (`handleDiscard`, `:174`).
- **Aggregate** progress for multi-routine runs — `total()` / `doneCount()` are already
  session-wide memos (`:122`).
- Reuse presentational pieces, but **PT must not depend on `workout-store` or its rest
  state**. Extract the shell if needed; do not import the strength store.
- Reserve enough bottom space for the last set row and the notes field.
- Apply **B2's** count capture to the finish toast.

### Files

`src/screens/PtRun.tsx` · shared layout components if extracted

### Acceptance

FINISH is reachable from the middle of a long multi-routine PT run without scrolling. The
final notes field is unobscured. A save failure leaves a usable draft and a usable action bar.

---

## C8 · Missing assistance exercises force a Settings detour

**State:** `open` · **P2** · Sources: WF#6, CX#20 · Batch 5

### Problem

`AccessoryPicker.tsx:207`'s empty state:

```tsx
<div class="text-faint text-xs py-2">No {SECTION_LABEL[…]} exercises. Tag one in Settings.</div>
```

and exercise management (`Settings.tsx:882`) lives inside the initially-collapsed Equipment
section. Choosing an exercise becomes a separate configuration task: leave the picker, find
exercise management, create or categorise, return, select.

### Fix

`+ NEW EXERCISE` inside the picker, **including in the empty state**, pre-tagged with the
slot being filled and returning to the slot with the new exercise selected.

- Reuse the existing exercise validation and persistence from Settings — a compact form
  with only the fields needed to log it. Advanced equipment configuration stays in Settings.
- Prefill the relevant assistance category; allow correcting it.
- **Preserve the current selection until creation succeeds.** Cancellation or a failed save
  leaves the prior selection and its logs intact.
- Selecting the new exercise goes through **A2's** preservation rule.
- Respect `assertUniqueExerciseName` and `idx_exercises_name_nocase`
  (`schema.ts:220`, reconciled at `:243`) — a duplicate name is rejected in the picker, not swallowed.

### Files

`src/components/workout/AccessoryPicker.tsx` · exercise form/save logic in `Settings.tsx`

### Acceptance

Create and select an exercise without leaving the workout. The new exercise appears in
Settings and in future picker searches.

---

## C9 · Repeating a drop-set sequence means rebuilding it every set

**State:** `open` · **P3** · Sources: EF#6, CX#21 · Batch 5, **after E1**

### Problem

`handleLog` (`AccessoryLog.tsx:117`, clearing at `:130`) clears the configuration after every log:

```ts
logAccessorySet(props.accessory.exerciseId, set)
startRest(…)
setDropRounds([])
```

so the same three-round drop must be re-entered set after set.

### Fix

Keep the last logged configuration and offer **`COPY PREVIOUS DROPS`**, available only when
the same exercise's previous logged set contains drop rounds:

```tsx
<Show when={(props.accessory.loggedSets.at(-1)?.dropRounds?.length ?? 0) > 0}>
  <button type="button" onClick={copyPreviousDrops} class="text-left text-accent text-xs tracking-widest">
    COPY PREVIOUS DROPS
  </button>
</Show>
```

- Copies loads and rep values as **editable starting targets**, and the band setup.
- **Deep-copies** nested calibration — see **E1**, which must land first.
- **Explicit, never automatic.** Auto-restoring would silently imply rounds nobody did.
- Copying **does not log a set** and does not mark anything complete.
- If the current draft already has rounds, make replacement explicit.
- If the equipment profile changed since, **preserve and identify the copied calibration**
  rather than silently recalculating it — `BandLoadControls`'s `(recorded)` option
  (`:83`) already renders exactly this case.

### Files

`src/components/workout/AccessoryLog.tsx` · `src/components/forms/DropRoundsEditor.tsx`

### Tests

Copy, modify one round, log the next set: the first set is unchanged. Cancelling or clearing
the copied draft creates no record. The action is absent when no prior drops exist.

---

## C10 · PT routine drafts are lost on navigation

**State:** `fixed` · **P2** · Sources: WF#4, CX#7 · Batch 2

### Problem

`PtRoutineEdit.tsx:84-87` holds everything in component-local signals:

```ts
const [name, setName] = createSignal('')
const [notes, setNotes] = createSignal('')
const [drafts, setDrafts] = createSignal<PtExerciseDraft[]>([])
const [openIndex, setOpenIndex] = createSignal<number | null>(null)
```

Enter a routine name and an exercise name, tap Today, come back with browser Back: reset.
Longer routines cost more to reconstruct.

### Fix

Persist the draft keyed by routine id (or `new`), the way `pt-store` persists a run —
versioned, allowlisted keys, per-key shape validators.

- Restore on mount. Preserve **exercise order, partially entered names, targets and
  equipment fields**.
- Rename `DONE` → **`SAVE ROUTINE`** so the commit point is named, and add an explicit
  discard.
- Clear the draft on **successful save or explicit discard** — **not** on failed validation
  (CX#7).
- **Stale-draft detection**: if the underlying routine changed since the draft was taken,
  ask whether to restore or discard before overwriting newer data.

### Files

`src/screens/PtRoutineEdit.tsx` · a small draft-storage helper

### Acceptance

Enter a partial multi-exercise routine, visit Today, use Back, and reload. Fields and
ordering remain. A failed save retains the draft; a successful save and an explicit discard
each clear it.

### As built

`src/store/pt-routine-draft.ts` is the helper: versioned payload, per-key deep validators in
the shape `pt-store` uses, and plain read/write/clear functions rather than a reactive store —
there is one reader, it reads once on mount, and nothing else in the app has an opinion about
a half-written routine.

- **A draft is parked only while it differs from what is saved**, compared through
  `ptRoutineFingerprint`. That makes "a draft exists" mean "there is unsaved work", which is
  what gives the stale check something worth asking about, and it means typing a change back
  to its saved value takes the draft away again.
- **The same fingerprint answers the stale question.** A draft stores the fingerprint of the
  routine it was taken against; if the routine has moved since, restoring asks first
  (`RESTORE` / `DISCARD`). A new routine has nothing behind it, so it never asks.
- **`CANCEL` became `BACK`.** Leaving keeps the draft now, so a word promising to undo would
  be a lie about where the work went. `DISCARD DRAFT` — shown only when there is one — is the
  explicit discard, and `DONE` became `SAVE ROUTINE`.
- **The persistence effect is gated on a `hydrated` flag.** Loading writes the saved routine
  into the same signals the parked draft is about to be written into, and the effect watches
  them: without the gate it fired on the loaded values, saw a form matching what is saved,
  and deleted the draft one line before it would have been restored. The first version of
  this change had exactly that bug and the tests caught it.

`PtRoutineEdit.test.tsx`'s `beforeEach` now clears `localStorage`; without it the form
restores the previous test's draft.

---

# D — Small

## D1 · One dialog, three labels

**State:** `fixed` · **P3** · Sources: UI#7, CX#18 · Batch 4

Three labels for one dialog:

| Label | Sites |
|---|---|
| `bands` | `Settings.tsx:547`, `:895`, `AccessoryLog.tsx:167` |
| `EDIT RAW LOAD / BANDS` | `Workout.tsx:993`, `CrossBlockLog.tsx:48` |
| `BAND / RAW LOAD` | `BandSettings.tsx:62` — the component default, never reached |

"EDIT" is also wrong on a lift with no profile: there is nothing there to edit yet.

**Fix.** Settle one wording and use it everywhere; drop the unreachable default. Both
options are coherent and this is **not a functional disagreement** — decide once during
implementation:

- **`BANDS`** when a profile exists, **`SET UP BANDS`** when none (first proposal)
- **`Band settings`** everywhere, with the movement name in the dialog title (CX#18's
  preference, retained in its addendum §7)

The dialog title already carries the movement (`BandSettings.tsx:64`,
`` `${props.entity.name} bands` ``). Whichever wins, explain **raw load** inside the form —
the `<p>` at `:70` explains recalibration but never says what raw load *is*.

C1 hides the Workout, CrossBlockLog and AccessoryLog entry points only when there is no
enabled profile. All three remain visible with an enabled profile; all five sites still
belong in the terminology checks.

### Tests

`BandSettings.test.tsx` (already exists) — assert the invariant, not the string. These
survive rewording the label, which is the point: the defect is divergence, not the words.

1. **Entry points agree within each profile state.** Exercise enabled, saved-but-disabled
   and absent profiles separately. With an enabled profile, render and compare all five
   entry points. With a disabled or absent profile, assert that Workout, CrossBlockLog and
   AccessoryLog hide their shortcuts, and compare the two remaining visible entry points
   (both in Settings). Compare labels within each state, not across states that may
   intentionally use different wording.
   ```ts
   // Explicit policy expectations, independent of the rendering implementation.
   const expectedVisibleCount = { enabled: 5, disabled: 2, absent: 2 } as const
   for (const state of ['enabled', 'disabled', 'absent'] as const) {
     const entryPoints = await renderVisibleEntryPoints(state)
     expect(entryPoints).toHaveLength(expectedVisibleCount[state])
     const labels = entryPoints.map(el => el.textContent!.trim())
     expect(new Set(labels).size).toBe(1)
   }
   ```
   `renderVisibleEntryPoints` is a proposed test helper that renders the **actual call
   sites** — Workout, CrossBlockLog, both Settings rows and AccessoryLog. It must not
   manufacture matching labels by passing the same prop to five isolated `BandSettings`
   instances: that assertion is tautological and passes against today's broken code, which
   is the one thing this test exists to fail on.
2. **No `EDIT` without a profile.** `expect(labelWithNoProfile()).not.toMatch(/edit/i)` —
   holds whichever wording wins.
3. **The unreachable default is gone.** Either `label` became required (the typecheck
   proves it) or rendering without the prop yields the same label as the visible entry
   points in the same profile state, by test 1.
4. If the chosen wording varies by profile presence, assert the two labels **differ** —
   not what either one says. For the `BANDS` / `SET UP BANDS` option, enabled and
   saved-but-disabled profiles share the existing-profile label; an absent profile gets
   the setup label. For the single-label option, assert equality across all three states.

### As built

**The first wording wins: `BANDS` with a profile, `SET UP BANDS` without.** It is chosen at
the point of use rather than passed, so the `label` prop is gone entirely — which is a
stronger answer to "the unreachable default" than making it required, and removes the way
the three spellings diverged in the first place. After C1 the three logging entry points
only render with a profile, so in practice only the two Settings rows ever say
`SET UP BANDS`.

The form also now says what raw load *is* — "what this movement weighs with no band on …
not your bodyweight" — which the existing paragraph never did.

Two deviations in the tests:

- **A new file, `band-entry-points.test.tsx`, rather than `BandSettings.test.tsx`.** The
  helper needs a clean database per test and `BandSettings.test.tsx` has no reset and shares
  one database across its cases. Clearing tables underneath those would have been the more
  invasive choice.
- **The entry points are collected by label, not by role.** Settings renders its lists
  inside collapsible sections and a role query drops whatever is folded away — it found one
  of the two Settings rows for that reason alone. Whether a section happens to be open is
  not what this measures.

Two of the five are red against the pre-D1 code, which is the right number: the `disabled`
and `absent` states show only the two Settings rows, and those two already agreed with each
other. The divergence was between Settings and the logging screens, which is the `enabled`
case, plus the setup-versus-edit distinction that did not exist at all.

---

## D2 · "Log after all drop rounds." is always shown

**State:** `open` · **P3** · Sources: UI#9, CX#22 · Batch 5

`AccessoryLog.tsx:322` renders it for every reps-measured accessory, drop rounds or not:

```tsx
<Show when={type() === 'reps'}><p class="text-faint text-xs mt-2">Log after all drop rounds.</p></Show>
```

**Fix.** Gate on the draft:

```tsx
<Show when={type() === 'reps' && dropRounds().length > 0}>
  <p class="text-faint text-xs mt-2">Log after all drop rounds.</p>
</Show>
```

Removing the last round hides it again. Keep it next to the logging action.

### Tests

`AccessoryLog.test.tsx` — a reps accessory with no drop rounds renders no drop-specific
instruction; adding a round shows it; removing the last round hides it again. This is
conditional rendering, not wording, so it carries a test rather than a visual check.

---

## D3 · Band names are hardcoded

**State:** `open` · **P3** · Sources: UI#8, CX#19 · Batch 4, last

### Problem

`BAND_NAMES` (`band-loading.ts:5`) is `['Orange', 'Green', 'Purple', 'Red']`, with no
rename, add or remove in the settings dialog. `BandCalibration.name` is already a free
string and `BandLoadControls` resolves by name (`:44`, `:82`), so **the model already
supports arbitrary names — only the settings form does not.** Anyone on another brand
calibrates four mislabelled rows.

### The trap: name-as-row-identity

`BandSettings.tsx:71-72` iterates names and resolves each row by name:

```tsx
<For each={draft()!.bands.map(b => b.name)}>{name => {
  const band = () => draft()!.bands.find(b => b.name === name)!
```

Renaming in place — exactly what the first proposal asked for — rebuilds that array on every
keystroke, so `For` replaces the row: **it remounts and loses input focus mid-word.** (CX's
addendum §7 is right that proven calibration corruption is not established; remounting and
lost focus are sufficient reason on their own.)

### Fix

1. Give each calibration row a **stable local identity** for the duration of the edit and
   key the `For` on that, not on the name.
2. Rename in place, add rows, remove rows. Keep the four colours as the **seeded default**.
3. Validate **trimmed, non-empty, unique** — names are the selection key. `validBandProfile`
   (`band-loading.ts:176`) already enforces exactly this and the form must surface it rather
   than failing at save:
   ```ts
   Array.isArray(v.bands) && v.bands.every(b => b && typeof b.name === 'string' && b.name.trim() && …) &&
   new Set(v.bands.map(b => b.name)).size === v.bands.length
   ```
4. Profile changes apply to **future selections**, never to existing `BandLoad` snapshots.
   `(recorded)` in the select (`BandLoadControls.tsx:83`) already covers a superseded
   calibration and must cover a **renamed** one too — the disagreement check at `:44-47`
   fires on assistance, so a pure rename needs its own path.
5. **No global equipment catalog**, no cross-profile band identity. Out of scope.

### Tests

Rename, add and remove bands, then reload. Duplicate and blank names rejected **in the
form**. Old logged sets and their exports retain their recorded name, assistance and
effective load.

---

# E — Found while comparing

## E1 · `DropRoundsEditor` shallow-copies a `BandLoad`

**State:** `fixed` · **P3** · In neither proposal · Batch 4, **first**

### Problem

`DropRoundsEditor.tsx:39`:

```tsx
props.onChange([...props.rounds, {
  weight: last?.weight ?? props.weight,
  reps: last?.reps ?? props.reps,
  bandLoad: previousBand ? { ...previousBand } : null,
}])
```

`BandLoad` carries a `calibration` array (`types/domain.ts:62`) that a spread shares **by
reference**. `makeBandLoad` is careful here (`band-loading.ts:107`):

```ts
// Copied, not referenced: the profile row is editable and this is a record.
calibration: profile.bands.map(b => ({ ...b })),
```

This call site is not.

### Classification

**Defensive snapshot isolation, not demonstrated corruption.** The first addendum called it
a prerequisite for D3; CX's addendum §3 narrows that correctly — `BandSettings` already
clones its rows on open (`:30`), `BandLoadControls` replaces loads on selection, and
`makeBandLoad` copies. Today the array is only read, so nothing is corrupted. It is not a
release blocker and does not need its own batch.

It is still worth fixing **before C9**, which starts writing through structures that came
from it.

### Fix

```tsx
bandLoad: previousBand
  ? { ...previousBand, calibration: previousBand.calibration?.map(b => ({ ...b })) }
  : null,
```

**Preserve the absence of `calibration` rather than substituting `[]`.** `validBandLoad`
(`band-loading.ts:164`) accepts a null/absent calibration for legacy rows, and
`BandLoadControls.tsx:31` falls back to `props.profile?.bands` when it is absent — an empty
array would suppress that fallback and strand the row.

### Acceptance

Changes to a copied draft leave the source round and its calibration unchanged. Legacy loads
with no calibration snapshot keep their existing selection behaviour.

---

# Verification

## Per batch

```bash
pnpm typecheck        # tsc -b — the root tsconfig is a solution file, `tsc -p` checks nothing
pnpm lint
pnpm test             # or the affected suites
pnpm run check:ci     # lint + test:coverage + build — what CI and the deploy gate run
```

Coverage thresholds only run under `test:coverage`, so their `include` scope matters for any
new file.

## Evidence bar

- **A1–A5 are the five data-loss items.** Each gets its failing test **first**. A passing build
  does not prove a data-loss fix. Verify by reverting the fix into a **file copy** and
  watching the test fail; never `git checkout <file>`.
- **Format changes** verify against old DB, draft and import fixtures. Preserve recorded
  nulls and calibration snapshots. Do not backfill invented history.
- **Browser flows**, at 390×844 and 1280×900: cancellation (A3), collapse and row switching
  (A5), swaps (A2), resume (A4), finishing during rest (B1+C5).
- **C2, D1 and D2** each carry assertions in a test file that already exists
  (`AccessoryLog.test.tsx`, `HistoryEdit.test.tsx`, `BandSettings.test.tsx`), written
  against the invariant rather than against a literal. C2 additionally gets a visual pass
  over its six surfaces, because "one unit, one separator" is easiest to confirm by eye.

## Corrections applied to the source documents

Recorded here rather than by editing the frozen evidence:

| Source | Claim | Correction |
|---|---|---|
| `proposed-fixes-2026-09-21.md:18` | duplicate findings merge into **B3** | **A3**. B3 is the unreachable band target. |
| First proposal, B2; earlier ledger text | EF#7 incorrectly says `completed` is captured after clearing | EF#7 correctly identifies the denominator. Only `total()` is late; the recommendation to snapshot both counts does not claim both were read late. |
| First proposal, C4; earlier ledger text | "holes in `loggedSets`" was the wrong risk | **Reinstated.** Two real risks, not one: the cursor *is* the completion model (CX#10), **and** `logSet` appends while `SetRow` reads by global index, so a skip desynchronizes them and a logged set renders blank. "Holes" was imprecise — it is a shift — but calling it wrong was itself wrong. |
| First proposal, C6 | add `step={5}` | Withdrawn — a separate behaviour change; 1lb corrections must stay convenient. |
| First proposal, C5 | "heights must stay equal" | Reserved space must match the **actual** combined controls; equal height is optional. |
| First proposal, B3 | trigger on the returned candidate's distance | Tolerance is `closest + 2.5`, not `target ± 2.5`. Trigger on `nearestDistance`. |
| First proposal, A4 | grow any list without the seed marker | Every existing **v2** draft lacks the marker too. Branch on the persisted version. |
| First proposal, A2 | demote to `extra` | Insufficient alone — needs exercise-id reconciliation, and retention on notes as well as sets. |
| First addendum, §3 | the shallow copy is a D3 prerequisite | Defensive hardening; ship with C9. |
| CX#13 | "do not gate by exercise name" | Already true — `bandProfileFor` is saved-profile-only since 2026-09-19. Behaviour to preserve. |
| This plan, A2 | demote-to-extra makes the swap-back work | Incomplete: `AccessoryPicker.alreadyAdded` greys out any exercise present in `activeAccessories`, so a retained extra cannot be re-selected. Found in the 2026-09-21 correctness pass. |
| This plan, A1 | `recordedPtRunSetFields` used in the `handleSave` snippet | Was never defined. Now defined alongside `recordedPtCheckActuals`. |
| CX#8 | snapshot the run label | Unnecessary — `routineName()` reads `groups()`, which is not cleared. |

## Not proposed

- **Accessibility / WCAG / contrast / keyboard** — excluded by all three review briefs.
  Nothing here reopens that scope beyond not regressing what exists.
- **UI#3's "rename `cancel` to `close`"** — superseded by A3.
- **EF#1's merge-only interim fix** — A1 Step 1 is strictly better and no slower.
- **A global equipment catalog or cross-profile band identity** — out of scope for D3.
- **Generalising the set cursor to arbitrary ordering** — C4 stays warmup-only.

---

**Created**: 2026-09-21 · **Last updated**: 2026-09-21
