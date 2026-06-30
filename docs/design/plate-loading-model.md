# Design note: generalized plate-loading model

**Status:** proposal (v2 of `usesBarbell`) · **Date:** 2026-06-30 · not yet implemented

## Context

v1 (shipped) added `usesBarbell?: boolean` to `Lift` and `Exercise` and gates the
plate-math readout (`PlateDisplay`) on it:

- `SetRow` shows plates when `showPlates !== false`; `Workout.tsx` passes
  `lift().usesBarbell !== false` for own-lift sets and the movement lift's flag
  for cross sets.
- `AccessoryLog` shows plates when `exercise.usesBarbell === true`.
- `calcPlatesPerSide(target, barWeight, plates)` (`src/lib/calc.ts:424`) assumes a
  **barbell**: `perSide = (target − barWeight) / 2`, plates distributed in **pairs**,
  readout `"each side: …"`. `barWeight` is the global setting (default 45).
- Defaults are asymmetric: lift `undefined ⇒ barbell`, exercise `undefined ⇒ not`.

## Problem

The boolean conflates two independent facts and can't express common implements:

- **belt squat** — loads the same plates, but base weight is 0, single stack.
- **dip belt / weighted pull-up** — plates on a hanging belt; no sides at all,
  base 0, total load.
- **plate-loaded cable (two-sided)** — uses barbell plates, *paired*, base ≈ 0.
- **hex / SSB / cambered bar** — paired like a barbell but base ≠ 45.

Key realization from working examples: **implement type is per-user equipment and is
NOT inferable from the exercise name or category.** "Cable" can be a stack (no plate
math) or a two-sided plate-loaded rig. So the knobs must be set explicitly per
implement, never defaulted from a label.

## Model

Two orthogonal, explicit fields per `Lift` and per `Exercise`:

| field | values | meaning |
|---|---|---|
| `plateMode` | `'none' \| 'paired' \| 'total'` | how (and whether) plates display |
| `implementBase` | `number \| null` | weight present before plates; `null` = mode default |

- `none` — not plate-loaded (dumbbell/cable-stack/machine-stack/bodyweight) → no readout.
- `paired` — symmetric 2-end load → `perSide = (target − base) / 2`, plates in **pairs**,
  label `"each side: X"`. `base` default `null` ⇒ global `barWeight`.
- `total` — single stack, no sides → `load = target − base`, plates as **singles**,
  label e.g. `"plates: X"` / `"added: X"`. `base` default `null` ⇒ `0`.

`base` is per-implement in **both** modes (hex bar is `paired` with base ≈ 55), with the
mode default as a starting point the user can override.

### Worked taxonomy

| implement | plateMode | base | readout |
|---|---|---|---|
| straight bar | paired | null → 45 | each side: X |
| hex / SSB / cambered | paired | ~55–70 | each side: X |
| two-sided plate cable | paired | 0 (horns) | each side: X |
| belt squat | total | 0 (or pin) | plates: X |
| dip belt / weighted pull-up | total | 0 | added: X |
| plate-loaded machine | total | carriage wt | plates: X |
| dumbbell / cable stack / bodyweight | none | — | (no readout) |

Every implement raised so far lands in `{none|paired|total} × base` with **no extra axis**.

## `calc` change

`calcPlatesPerSide` (paired/pairs) generalizes into two branches:

- **paired** — today's logic unchanged: `perSide = (target − base)/2`, `maxPairs = floor(count/2)`.
- **total** — new: `load = target − base`, distribute as singles (`maxSingles = count`),
  because a one-point load can use a lone plate (no pairing constraint).

`PlateDisplay` takes the resolved `{ mode, base }` (or the lift/exercise row) instead of
reading `settings.barWeight` directly, and branches the label on `mode`. Gating
(`showPlates`) becomes `plateMode !== 'none'`.

## Migration from `usesBarbell`

Consistent with the app's additive-migration + read-fallback pattern (see the
"leave the guards" decision):

1. Additive: `ALTER TABLE lifts ADD COLUMN plateMode TEXT`,
   `ALTER TABLE lifts ADD COLUMN implementBase REAL` (and same for `exercises`).
   Also add both to the export `COLS` allowlist (`src/lib/export-import.ts`).
2. Do **not** backfill. Read-time resolver derives the effective mode when
   `plateMode` is null, preserving the v1 asymmetric defaults:
   - lift: `plateMode ?? (usesBarbell === false ? 'none' : 'paired')`
   - exercise: `plateMode ?? (usesBarbell === true ? 'paired' : 'none')`
3. `usesBarbell` becomes legacy (kept, not dropped — it's the fallback source).
   New explicit edits write `plateMode`/`implementBase`; `total` is the genuinely
   new state the boolean can't reach.

## UI surfaces

- **`LiftSetupModal`** EQUIPMENT section: replace the YES/NO barbell toggle with a
  3-way mode picker (`none` / `paired` / `total`) + a base-weight stepper shown when
  mode ≠ `none` (default hidden/`null` = "bar" for paired, 0 for total).
- **`ExerciseEditor`** (Settings): same control; persist via a `setExercisePlateLoading`
  helper mirroring `setExerciseUsesBarbell`.

## Out of scope (separate features)

- **Pulley ratio** — a geared cable's loaded plates ≠ felt resistance. Plate math
  answers "what to hang on it" (loaded weight); effective-resistance display is a
  different feature. Assume 1:1.
- **Landmine / lever** (T-bar, landmine press) — loaded-end weight ≠ effective via a
  lever ratio (~0.5–0.6). Treat as `total` approximation or leave `none`; not modeled.

## Open questions

- Label wording for `total` mode: "plates" vs "added" vs "load".
- Whether `total` needs a base stepper in the common case (mostly 0) or hides it
  behind an "advanced" affordance.
- Weighted pull-up: does the logged `weight` mean *added* load or total system weight?
  Changes what `target` feeds the calc.
