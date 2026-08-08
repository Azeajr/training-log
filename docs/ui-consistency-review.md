# UI/UX Consistency Review — resolved

**Status**: RESOLVED 2026-08-08 — validated (all nine findings VALID, verdicts inline),
then fixed in one Pass-6 scope-(b) run. Resolutions inline below each finding.
Verified: `pnpm typecheck && pnpm lint && pnpm test` (1014 passing) + `pnpm build` +
headless-browser eyeball of the Workout header, folded warmup section, and
LiftHistoryModal empty state at 375px.

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

    **VALID → RESOLVED.** Duplication is real and exact: `History.tsx:283-309` (SET_TYPE_DISPLAY_ORDER
    grouping + `SetReadout size="sm" alignWeight tone="text-text-dim" class="pl-2"`)
    is the same shape as `LiftHistoryModal.tsx:60-85`; `History.tsx:320-335` matches
    `ExerciseHistoryModal.tsx:68-79`. Both modals share identical Modal-shell +
    error/Loading/empty `<Show>` blocks (`LiftHistoryModal.tsx:40-50` ≡
    `ExerciseHistoryModal.tsx:50-60`).
    **Fix**: new `ExerciseSetsBlock` (label + SetReadout rows + note) now serves both
    the History detail and `ExerciseHistoryModal`; new `ModalAsyncStates` (error /
    loading / empty / list ladder) serves both modals; new `LiftSetsByType`
    (SET_TYPE_DISPLAY_ORDER grouping + AMRAP/e1RM trailing, `labelVariant:
    'section' | 'sub'` absorbing the label-style difference) serves both the
    History detail and `LiftHistoryModal`. The last was deferred in the first pass
    as over-parametrization, then extracted once finding 4's fix made the two
    sites converge on the same e1RM derivation.

2. **Three copies of the accessory value formatter** (same logic, delocalized):
   - `src/components/workout/AccessoryLog.tsx` `fmtSetValue` (~L18)
   - `src/screens/History.tsx` `accSetValue` (~L17)
   - `src/components/modals/ExerciseHistoryModal.tsx` `setValue` (~L18)
    All resolve the same `reps ?? duration ?? distance ?? ''` ordering. Fit: extract to
    `src/lib/format.ts` (which already owns `formatDateLong` / `formatDuration`).

    **VALID → RESOLVED, with two corrections.** Three copies confirmed at cited lines, but they are
    not identical: `AccessoryLog.tsx:20` renders duration raw (`` `${s.duration}s` ``)
    while `History.tsx:19` and `ExerciseHistoryModal.tsx:20` use `formatDuration`
    (m:ss). Extraction must pick one duration rendering (m:ss is the majority) — the
    AccessoryLog readout would change cosmetically. Also: `formatDuration` lives in
    `src/lib/calc.ts:371`, not `src/lib/format.ts`.
    **Fix**: `accessorySetValue` extracted to `src/lib/format.ts` (imports
    `formatDuration` from `lib/calc`; no cycle). All three call sites rewired.
    AccessoryLog timed sets now read `2:30` instead of `150s`.

3. **History affordance a11y has two implementations.**
   - `AccessoryLog` exercise name: `<span role="button" tabindex=0 onKeyDown>` —
     hand-rolled keyboard support.
   - `Workout` header + `CollapsibleSection` label: real `<button>`.
   - None of the three has a `focus-visible` / focus outline style. Validate: is the
    span-role=button warranted (it sits in a flex row with other hit targets), or
    should AccessoryLog adopt a `<button>` (visually reset), and should all three get
    a shared focus ring?

    **VALID → RESOLVED.** `AccessoryLog.tsx:115-122` is a span with hand-rolled role/tabindex/
    onKeyDown; `Workout.tsx:650` and `CollapsibleSection.tsx:51` are real `<button>`.
    No `focus-visible` / focus outline class on any of the three.
    **Fix**: AccessoryLog exercise name is now a real `<button>` (plain `<span>`
    fallback when no handler). All history tap targets — AccessoryLog name,
    CollapsibleSection label + fold toggle, Workout header Rule — carry
    `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`.

4. **est. 1RM missing from LiftHistoryModal.** `History.tsx` detail shows an
   `est. 1RM: Nlb` trailing on AMRAP rows (~L299). `LiftHistoryModal.tsx` renders AMRAP
   only as an `AMRAP` badge. Validate: should the modal match (the AMRAP weight/reps are
   in the entry's sets, so `estimated1RM` + `settings.highRepDiscount` is feasible), or
    is the omission intentional ("during-workout quick check" vs "study" view)?

    **VALID → RESOLVED.** `History.tsx:299-300` renders `est. 1RM: Nlb` trailing on AMRAP rows;
    `LiftHistoryModal.tsx:77` renders only the `AMRAP` badge. Entry sets carry
    weight/reps, so `estimated1RM(s.weight, s.reps, settings.highRepDiscount)` is
    feasible per-set (History computes one e1RM per session row, not per set — the
    modal would need the same per-session derivation).
    **Fix**: modal now derives one e1RM per entry off its AMRAP set — same
    `estimated1RM(w, r, settings.highRepDiscount).toFixed(1)` derivation as the
    History session row — and trails `est. 1RM: Nlb` on that row.

5. **Cross-block label loses its history click once the section folds.**
   `CollapsibleSection` renders the `onLabelClick` button only in the `!complete`
   fallback branch (~L45-58). Once the section is complete, the label becomes the fold
   toggle (`▸/▾`), so the history entry point silently disappears for finished cross
    blocks. The main lift header keeps its tap target always. Validate: intended? Fix
    candidate — history tap stays and the fold moves to a separate `▸` toggle, or a
    second affordance (e.g. the summary chip).

    **VALID → RESOLVED.** `CollapsibleSection.tsx:45-58` renders `onLabelClick` only in the
    `!complete` fallback; the complete branch (`L60-74`) is a pure fold toggle.
    The cross block is the only `onLabelClick` caller (`Workout.tsx:775` via
    `CrossBlockLog.tsx:36`) — warmup/main don't pass it, so they're
    unaffected. Once a cross block completes, its history entry point is gone.
    **Fix**: the folded row now splits — underlined label button keeps the history
    tap, a separate `▸/▾` button (with `aria-label="Expand/Collapse <label>"`)
    owns the fold. Sections without `onLabelClick` keep the original whole-row
    toggle, so warmup/main lose no tap-target area.

6. **Load/empty state styling drifted.** Loading copy is `text-faint text-xs font-mono
   py-2` in the two new modals (`LiftHistoryModal.tsx:45`) vs `p-6 font-mono text-muted`
   in screens (`HistoryEdit.tsx:304`); empty-state copy wording differs — "No sessions
   logged with this exercise." vs "No completed sessions for this lift."
   (`LiftHistoryModal.tsx:49`) vs "No completed sessions yet." (`History.tsx:643`).
   A shared states trio (loading/empty/error) or at least one doc'd wording + style
    would help. Validate whether any consolidated effort is worth it (each null-safe
    `entries() === null` gate is already consistent).

    **VALID → RESOLVED (modal half).** Style drift confirmed: modals use `text-faint text-xs font-mono py-2`
    (`LiftHistoryModal.tsx:45,49`), `HistoryEdit.tsx:304` uses `p-6 font-mono text-muted`,
    `History.tsx:643` uses `text-muted text-sm`. Wording drift confirmed as quoted —
    three different empty-state sentences for the same "nothing here" meaning.
    **Fix**: `ModalAsyncStates` now owns modal loading/empty/error markup and the
    wording idiom is doc'd on it ("No \<thing\> yet.", matching the History screen).
    Both modals use it; the two empty-state tests were re-pointed at the new copy.
    Screen-level fallbacks (HistoryEdit, Workout's `p-6` blocks) were left alone —
    a full-screen fallback and a sheet-embedded one are different contexts; merging
    them is not obviously right.

7. **Week-4 deload label delimiter drift.** `LiftHistoryModal.tsx:58` uses `· DELOAD`
   (middle dot); the Workout Rule header uses `. DELOAD` (period). Trivial but the
    review says pick one — the Week-4 `. DELOAD` string is asserted in tests, so prefer
    the header idiom or update the tests along with it.

    **VALID → RESOLVED, with a correction.** Drift is real: `LiftHistoryModal.tsx:58` uses
    ` · DELOAD` while `Workout.tsx:656` and `Today.tsx:217` use ` . DELOAD`. But the
    test claim is wrong — the tests assert only the regex `/DELOAD/`
    (`Workout.test.tsx:194,431`, `Today.test.tsx:127`, `LiftHistoryModal.test.tsx:112`),
    so either delimiter passes and no test update is forced either way. Note
    `Settings.tsx:614,629` also uses `·` (and those *are* asserted literally), so both
    delimiters have precedent; still worth one idiom for the week header context.
    **Fix**: modal switched to ` . DELOAD`, matching the Workout/Today week headers
    (same context). Settings keeps its `·` — cycle-shape labels are a different
    context and are literally asserted.

8. **Glyph atlas for "more content".** In use: `→` (history affordance, `EDIT →`),
   `▸/▾` (fold), `›` (calendar nav). The underline switch in the Era note above removed
    one of them. Decide one glyph per meaning (nav vs fold vs affordance) and optionally
    a shared util so future call sites don't each pick their own.

    **VALID → RESOLVED.** Current atlas: `→` affordance (`History.tsx:280` EDIT →, plus `TM updated
    →` toast in `AccessoryLog.tsx:91`), `‹/›` nav (`History.tsx:583,591`), `▸/▾` fold
    (`CollapsibleSection.tsx:73`), `←` back (`HistoryEdit.tsx:313`). Meanings don't
    collide today, but there's no rule stopping a future call site from reusing one.
    **Fix**: the one-glyph-per-meaning atlas is now pinned as a comment at the
    `EDIT →` site in `History.tsx` (the screen that owns three of the four glyphs).
    No shared const — a comment is the right weight for four literals.

9. **Header underline spans the Rule's dashes.** After the underline change the Workout
   header underlines the whole `--- label ------` rule row (including the `-` fill),
    not just the label text. Needs eyeballing in-browser: acceptable as the full row is
    tappable, or should the underline target only the label (split the Rule's label into
    its own element)?

    **VALID → RESOLVED.** `Rule.tsx:13-17` renders `--- label ----` as one `<div>`; the underline
    class at `Workout.tsx:657` lands on that whole div, dashes included. Still needs
    the in-browser eyeball called for above — code inspection can't settle it.
    **Fix**: `Rule` grew a `labelClass` prop; the Workout header underline now marks
    only the label, dashes stay clean. Eyeballed in headless Chromium at 375px —
    confirmed underlines the label text only.

---

## Validation checklist (for the validating session)

- [x] Each finding tagged VALID / INVALID / SUPERSEDED, with code re-checked at cited lines
- [x] Note any drift between this doc and current tip (this doc is a point-in-time snapshot)
      — none: all citations still accurate as of 2026-08-08
- [x] If a fix is warranted, link this doc from `docs/INDEX.md` and/or add a
      `ROADMAP.md` entry — do not let it go stale silently.
      (`docs/INDEX.md` review-notes entry updated to VALIDATED.)

**Last Updated**: 2026-08-08