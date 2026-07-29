# Design note: generalized plate-loading model

**Status:** shipped · **Proposed:** 2026-06-30 · **Landed:** 2026-07 (`plateMode` / `implementBase`)

Kept as the rationale record for why plate loading is two orthogonal fields rather than a boolean.

## Context

v1 added `usesBarbell?: boolean` to `Lift` and `Exercise` and gated the plate-math readout on it, with
`calcPlatesPerSide(target, barWeight, plates)` assuming a **barbell**: `perSide = (target − barWeight) / 2`,
plates distributed in **pairs**, readout `"each side: …"`. Defaults were asymmetric — lift
`undefined ⇒ barbell`, exercise `undefined ⇒ not`.

## Problem

The boolean conflated two independent facts and could not express common implements:

- **belt squat** — same plates, base weight 0, single stack.
- **dip belt / weighted pull-up** — plates on a hanging belt; no sides at all, base 0, total load.
- **plate-loaded cable (two-sided)** — barbell plates, *paired*, base ≈ 0.
- **hex / SSB / cambered bar** — paired like a barbell but base ≠ 45.

Key realization: **implement type is per-user equipment and is NOT inferable from the exercise name or
category.** "Cable" can be a stack (no plate math) or a two-sided plate-loaded rig. The knobs must be
set explicitly per implement, never defaulted from a label.

## Model

Two orthogonal, explicit fields per `Lift` and per `Exercise`:

| field | values | meaning |
|---|---|---|
| `plateMode` | `'none' \| 'paired' \| 'total'` | how (and whether) plates display |
| `implementBase` | `number \| null` | weight present before plates; `null` = mode default |

- `none` — not plate-loaded (dumbbell / cable stack / machine stack / bodyweight) → no readout.
- `paired` — symmetric 2-end load → `perSide = (target − base) / 2`, plates in **pairs**,
  label `"each side: …"`, empty `"bar only"`. `base` default `null` ⇒ global `barWeight`.
- `total` — single stack, no sides → `load = target − base`, plates as **singles**,
  label `"plates: …"`, empty `"no plates"`. `base` default `null` ⇒ `0`.

`base` is per-implement in **both** modes (a hex bar is `paired` with base ≈ 55), with the mode default
as the starting point the user can override.

### Worked taxonomy

| implement | plateMode | base | readout |
|---|---|---|---|
| straight bar | paired | null → barWeight | each side: X |
| hex / SSB / cambered | paired | ~55–70 | each side: X |
| two-sided plate cable | paired | 0 (horns) | each side: X |
| belt squat | total | 0 (or pin) | plates: X |
| dip belt / weighted pull-up | total | 0 | plates: X |
| plate-loaded machine | total | carriage wt | plates: X |
| dumbbell / cable stack / bodyweight | none | — | (no readout) |

Every implement raised landed in `{none|paired|total} × base` with **no extra axis**.

## What shipped

- **`src/lib/calc.ts`** — `calcPlates(target, base, mode, plates)` branches on mode: `paired` uses
  `maxPairs = floor(count / 2)`, `total` distributes singles (`maxSingles = count`), since a one-point
  load can use a lone plate. `calcPlatesPerSide` remains as a thin backward-compatible wrapper.
- **`src/lib/plate-loading.ts`** — `resolveLiftLoading` / `resolveExerciseLoading` return
  `{ mode, base } | null`, preserving the v1 asymmetric defaults through the legacy flag:
  - lift: `plateMode ?? (usesBarbell === false ? 'none' : 'paired')`
  - exercise: `plateMode ?? (usesBarbell === true ? 'paired' : 'none')`
- **`PlateDisplay`** takes the resolved `{ mode, base }` instead of reading `settings.barWeight`
  directly, and branches its label on mode. Gating is `plateMode !== 'none'` (a `null` resolve).
- **Schema** — `plateMode TEXT` and `implementBase REAL` added to both `lifts` and `exercises` via
  `ADDITIVE_MIGRATIONS`, plus the export `COLS` allowlist. **No backfill**: both columns are NULL by
  default and the resolver derives the effective mode, so no existing row was touched. `usesBarbell`
  is retained as the legacy fallback source, not dropped.
- **UI** — `LiftSetupModal`'s EQUIPMENT section is a 3-way mode picker over `PLATE_MODES` plus a
  base-weight `Stepper` shown whenever mode ≠ `none`. `ExerciseEditor` / Settings persist via
  `setExercisePlateLoading` (which replaced `setExerciseUsesBarbell`). Both write `implementBase: null`
  when the entered value equals the mode default, so a standard bar keeps tracking the global setting.

## Resolved open questions

- **Label wording for `total`** — "plates: X", with "no plates" as the empty state (mirroring
  "each side: X" / "bar only").
- **Base stepper for `total`** — shown, same as `paired`; not hidden behind an advanced affordance.

## Still unresolved

- **Weighted pull-up** — does the logged `weight` mean *added* load or total system weight? Today it is
  treated as the target the plate math resolves against, i.e. added load with base 0.

## Out of scope (separate features)

- **Pulley ratio** — a geared cable's loaded plates ≠ felt resistance. Plate math answers "what to hang
  on it"; effective-resistance display is a different feature. Assume 1:1.
- **Landmine / lever** (T-bar, landmine press) — loaded-end weight ≠ effective, via a lever ratio
  (~0.5–0.6). Treat as a `total` approximation or leave `none`; not modeled.
