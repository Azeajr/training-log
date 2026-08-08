# UI/UX Consistency Review — findings awaiting validation

**Status**: UNVALIDATED — written by an agent session that acted only on the arrow item.
Purpose: an independent LLM reads this, checks each finding against the live code at the
given file:line, and marks VALID / INVALID / SUPERSEDED. Do not implement anything here
until validation is done.

**Scope**: UI additions from commits `b6a9540`..`553ce66` (history modals, history-tappable
labels) compared against how similar controls/workflows render elsewhere in the app.

---

## Era note: arrow → underline (already acted on)

The `→` affordance on history-tappable labels landed in `553ce66` and was **not** well
received: on Workout the arrow rendered on its own line under the Rule, not inline next to
the label. It has since been replaced with an underline:

| Site | Before | After |
|---|---|---|
| `src/screens/Workout.tsx` header Rule (~L655) | `Rule` + `<span>→</span>` below | underline on the Rule line |
| `src/components/workout/CollapsibleSection.tsx` onLabelClick button (~L51) | `SectionLabel` + `<span>→</span>` | underline on `SectionLabel` |
| `src/components/workout/AccessoryLog.tsx` exercise name (~L124) | name + `<span>→</span>` | underline on name span |

Underline styling used: `underline underline-offset-2 decoration-faint hover:decoration-accent`.
Remnants of the arrow idiom remain elsewhere and were **not** touched — validate whether
they should be:
- `src/screens/History.tsx:280` — `EDIT →` button in expanded session detail.
- `src/screens/History.tsx:591` — `›` calendar month nav.
- `src/components/workout/CollapsibleSection.tsx:74` — `▸` / `▾` fold triangles.

---

## Findings to validate

1. **History modals duplicate each other + the History screen detail view.**
   - `ExerciseHistoryModal.tsx:62-86` renders date section + per-set `SetReadout`
     (sm/alignWeight/tone) — same shape as HistorySessionRow's detail block in
     `src/screens/History.tsx` (~L283-345).
   - `LiftHistoryModal.tsx:56-80` renders per-type-grouped `SetReadout` rows + notes —
     also mirrors `History.tsx` detail markup, with `SET_TYPE_ORDER` grouping.
   - The two new modals share ~70% structure (sheet shell, error/Loading/empty/list
     states). Candidate: one generic `HistoryModal<T>` prop-driven, and/or a shared
     `SessionSetList` component (SectionLabel + SetReadout rows + NotesText) used by
     both modals and the History detail. Validate: is the duplication real? Where does
     cleanup stop?

2. **Three copies of the accessory value formatter** (same logic, delocalized):
   - `src/components/workout/AccessoryLog.tsx` `fmtSetValue` (~L18)
   - `src/screens/History.tsx` `accSetValue` (~L17)
   - `src/components/modals/ExerciseHistoryModal.tsx` `setValue` (~L18)
   All resolve the same `reps ?? duration ?? distance ?? ''` ordering. Fit: extract to
   `src/lib/format.ts` (which already owns `formatDateLong` / `formatDuration`).

3. **History affordance a11y has two implementations.**
   - `AccessoryLog` exercise name: `<span role="button" tabindex=0 onKeyDown>` —
     hand-rolled keyboard support.
   - `Workout` header + `CollapsibleSection` label: real `<button>`.
   - None of the three has a `focus-visible` / focus outline style. Validate: is the
     span-role=button warranted (it sits in a flex row with other hit targets), or
     should AccessoryLog adopt a `<button>` (visually reset), and should all three get
     a shared focus ring?

4. **est. 1RM missing from LiftHistoryModal.** `History.tsx` detail shows an
   `est. 1RM: Nlb` trailing on AMRAP rows (~L299). `LiftHistoryModal.tsx` renders AMRAP
   only as an `AMRAP` badge. Validate: should the modal match (the AMRAP weight/reps are
   in the entry's sets, so `estimated1RM` + `settings.highRepDiscount` is feasible), or
   is the omission intentional ("during-workout quick check" vs "study" view)?

5. **Cross-block label loses its history click once the section folds.**
   `CollapsibleSection` renders the `onLabelClick` button only in the `!complete`
   fallback branch (~L45-58). Once the section is complete, the label becomes the fold
   toggle (`▸/▾`), so the history entry point silently disappears for finished cross
   blocks. The main lift header keeps its tap target always. Validate: intended? Fix
   candidate — history tap stays and the fold moves to a separate `▸` toggle, or a
   second affordance (e.g. the summary chip).

6. **Load/empty state styling drifted.** Loading copy is `text-faint text-xs font-mono
   py-2` in the two new modals (`LiftHistoryModal.tsx:45`) vs `p-6 font-mono text-muted`
   in screens (`HistoryEdit.tsx:304`); empty-state copy wording differs — "No sessions
   logged with this exercise." vs "No completed sessions for this lift."
   (`LiftHistoryModal.tsx:49`) vs "No completed sessions yet." (`History.tsx:643`).
   A shared states trio (loading/empty/error) or at least one doc'd wording + style
   would help. Validate whether any consolidated effort is worth it (each null-safe
   `entries() === null` gate is already consistent).

7. **Week-4 deload label delimiter drift.** `LiftHistoryModal.tsx:58` uses `· DELOAD`
   (middle dot); the Workout Rule header uses `. DELOAD` (period). Trivial but the
   review says pick one — the Week-4 `. DELOAD` string is asserted in tests, so prefer
   the header idiom or update the tests along with it.

8. **Glyph atlas for "more content".** In use: `→` (history affordance, `EDIT →`),
   `▸/▾` (fold), `›` (calendar nav). The underline switch in the Era note above removed
   one of them. Decide one glyph per meaning (nav vs fold vs affordance) and optionally
   a shared util so future call sites don't each pick their own.

9. **Header underline spans the Rule's dashes.** After the underline change the Workout
   header underlines the whole `--- label ------` rule row (including the `-` fill),
   not just the label text. Needs eyeballing in-browser: acceptable as the full row is
   tappable, or should the underline target only the label (split the Rule's label into
   its own element)?

---

## Validation checklist (for the validating session)

- [ ] Each finding tagged VALID / INVALID / SUPERSEDED, with code re-checked at cited lines
- [ ] Note any drift between this doc and current tip (this doc is a point-in-time snapshot)
- [ ] If a fix is warranted, link this doc from `docs/INDEX.md` and/or add a
      `ROADMAP.md` entry — do not let it go stale silently.

**Last Updated**: 2026-08-08