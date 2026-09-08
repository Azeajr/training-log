# AMRAP Target Reps Analysis

## Overview

The AMRAP (As Many Reps As Possible) target reps feature provides a dynamic rep goal for the final
main set of each week. The target is the rep count that would, at today's prescribed weight, produce
an estimated 1RM (e1RM) equal to a robust seed drawn from recent working performances — reaching it
signals the lift is at or above its recent strength trend, and feeds the TM-progression prompt.

Week 4 never has an AMRAP set at all (`calcMainSets` sets `isAmrap: week !== 4 && i === 2`), so this
whole path is weeks 1-3 only, deload week or not.

## Calculation Flow

1. **Collect Recent Working Performances**
   - Via `getRecentWorkingSets` (`src/lib/cycle.ts`).
   - Only completed, non-deload sessions count (`status === 'completed' && week !== 4`). Week 4 is
     the only deload week that exists: with `hasDeloadWeek: false` the cycle stops at week 3, so
     nothing is silently dropped.
   - Candidate sets are the session's own non-cross work plus any cross set tagged with this lift's
     `liftId` living in another lift's session; warmups, 0-rep failures, and 0lb rows are excluded
     (`isWorkingPerformance`).
   - At most one performance per (cycle, week). Within a week the lift's **own** session outranks
     another lift's session that only carries cross work for it; among equally ranked sessions the
     newer one wins, so a redo supersedes the attempt it replaces and a redo with no qualifying work
     falls through to the older attempt. The performance taken from the chosen session is its
     highest-e1RM set.
   - The most recent `SEED_WINDOW` (default 3) weeks are kept, ordered most recent to oldest.

2. **Compute Seed e1RM**
   - Each performance's weight and reps convert to an e1RM via Wathan (`estimated1RM`,
     `src/lib/calc.ts`).
   - The median over the window is the robust seed (`seedE1Rm`), which blunts a single unusual
     session without lagging the way a long average would.

3. **Determine Target Reps**
   - The seed is passed as `prev1RM` to `targetReps(prev1RM, todayWeight, discount)`, which returns
     the fewest reps at `todayWeight` whose Wathan e1RM reaches `prev1RM`.
   - It solves the Wathan equation for *effective* reps, then maps back through `effectiveReps`'
     inverse so the recommendation still clears `prev1RM` once `estimated1RM` re-applies the
     high-rep discount.
   - Returns `null` when the target is unreachable at any rep count: Wathan is asymptotic, so
     `todayWeight / prev1RM <= WATHAN_BASE` (~0.488) never closes the gap.

4. **Output**
   - `calcAmrapTarget` returns an `AmrapTarget`: `label: 'target'`, `reps`, and `est1RM` (the seed,
     rounded to 2dp).
   - `reps` is an integer **≥ 1**. It is floored at 2 on the inverse path (a 1-rep target below
     `prev1RM` is unreachable, since `estimated1RM` short-circuits `reps === 1` to plain weight), but
     `targetReps` short-circuits to 1 when `todayWeight >= prev1RM` — today's weight already clears
     the seed on a single rep.
   - `calcAmrapTarget` returns `null` with no history, with a non-positive seed, or when the target
     is unreachable. **The UI does not go blank in that case**: `amrapTargetsFor`
     (`src/lib/workout-compose.ts`) falls back to the TM-implied e1RM (`tm / TM_PCT_OF_1RM`) under
     the label `'goal'`. Nothing is shown only when the TM is unset (`tm <= 0`) or the fallback goal
     is itself unreachable.

## Key Implementation Details

- **Wathan formula** (`src/lib/calc.ts`):
  `e1RM = weight / (WATHAN_BASE + WATHAN_SCALE · e^(−WATHAN_DECAY · effectiveReps))`,
  with `WATHAN_BASE = 0.488`, `WATHAN_SCALE = 0.538`, `WATHAN_DECAY = 0.075`. `reps === 1`
  short-circuits to the weight itself rather than going through the curve.

- **Effective reps & high-rep discount**: reps beyond `HIGH_REP_THRESHOLD = 10` are compressed by the
  discount setting (`off` 1, `mild` 0.5, `moderate` 0.25, `aggressive` 0.1). Compressing the rep
  count rather than discounting the output keeps the curve strictly increasing in reps.

- **Median seed**: `median` over the window's e1RM values; an even-sized window averages the middle
  two. Empty → 0, which `calcAmrapTarget` treats as no signal.

- **Per-week deduplication**: `getRecentWorkingSets` groups by `${cycleId}-${week}` and ranks
  own-lift sessions above cross-only ones, then cuts to the window.

## UI Integration

- `Workout.tsx` loads the recent working sets once per session load and recomputes targets whenever
  the AMRAP weight changes (`handleAmrapWeightChange`), so an on-the-fly weight edit re-derives the
  goal. `SetRow` renders `AmrapTargets`, and tapping a target fills the rep field.
- Hitting the target means the set's e1RM is at least the seed, which is what the TM-increase prompt
  keys off (alongside the current TM).
- `getSessionTmRecommendation` judges the session by its **best working set**, the same rule the seed
  uses — so a joker chained above the top set drives the TM prompt when it outscores the AMRAP. A
  joker *single* does not inflate it: `estimated1RM` short-circuits `reps === 1` to the bare weight,
  which lands below a multi-rep AMRAP at the same load. Cross blocks in the session are attributed to
  the movement they train and never touch this lift's TM.
- `getCycleDoublingCandidates` is still AMRAP-only, deliberately: the double-increment gate is a
  bigger lever and is left on the stricter signal.

---

## Findings

Verified against the code; the original draft of this document was accurate on the algorithm and
wrong in four places, two of which were code defects rather than documentation drift.

### Confirmed as described

| Claim | Verdict |
| --- | --- |
| Only completed, non-deload sessions feed the seed | **Confirmed** |
| Seed is the median Wathan e1RM over the last 3 qualifying weeks | **Confirmed** |
| `targetReps` inverts Wathan through the discount compression | **Confirmed** |
| `null` when `todayWeight / prev1RM <= WATHAN_BASE` | **Confirmed** |
| One performance per (cycle, week) keeps supplemental tails and redos from crowding the window | **Confirmed** |
| `week !== 4` is a safe deload filter, not a hardcoded cycle length | **Confirmed** — week 4 exists only when `hasDeloadWeek` is true, and never carries an AMRAP |

### Denied — documentation was wrong

1. **"`reps`: the computed rep target (integer ≥ 2)"** — false. `targetReps` returns 1 when
   `todayWeight >= prev1RM`, and `calcAmrapTarget` passes it straight through (there is an existing
   test asserting exactly this). The floor of 2 applies only to the inverse path. Corrected above.

2. **"`calcAmrapTarget` returns `null` and the UI does not show a target"** — false, and it
   contradicted the document's own step 3. `amrapTargetsFor` falls back to a TM-implied `'goal'`;
   the UI is empty only when the TM is unset or that fallback is also unreachable. Corrected above.

### Denied — code was wrong (fixed)

3. **A cross-lift session could steal the week's slot from the lift's own top set.**
   The dedup key was `${cycleId}-${week}` while the loop walked sessions for *every* lift
   (cross sets attribute to their movement lift, so a foreign session can qualify). First
   qualifying session in date-desc order won the week outright. So squatting 315×8 on Monday and
   then hitting a prescribed 225×5 cross-squat block on Thursday's bench day — same cycle, same
   week — seeded the median from the 225×5 and discarded the 315×8. Prescribed volume work
   masquerading as the week's best performance drags the seed down, which lowers the next target
   and makes the TM-increase prompt fire on weak evidence.

   **Fix** (`src/lib/cycle.ts`): group by (cycle, week) and rank the lift's own session above a
   cross-only one; newest still wins within a rank, preserving the redo semantics. Weeks are ordered
   by their newest qualifying session and then cut to the window, so an own-session upgrade never
   moves a week's position. Cross work still seeds a week where the lift has no session of its own.

4. **0lb rows counted as working performances.**
   `isWorkingPerformance` excluded only warmups and 0-rep failures, but the weight stepper bottoms
   out at 0 (`SetRow.tsx`), so a mis-logged 0lb set was a valid "performance" scoring an e1RM of 0.
   As a week's only set it made that week contribute 0, dragging the median down to the weaker of
   the two remaining weeks — or, with two such weeks, to a seed of 0, which `targetReps` answers
   with 1 (any weight clears a 0 e1RM), rendering as "target 1 @ est. 0". It also polluted the
   `RecordsPanel` max-weight readout.

   **Fix** (`src/lib/performance.ts`): require `weight > 0`. Plus a defensive guard in
   `calcAmrapTarget` (`src/lib/calc.ts`): a non-positive seed returns `null` so callers fall back to
   the TM goal rather than displaying a zero target.

## Known limitations (behaviour is deliberate, documented here for completeness)

- **Large targets under a discount.** Because reps past 10 are compressed, the inverse can ask for a
  lot of them: `targetReps(340, 200, 'moderate')` is 60 (asserted in `calc.test.ts`). That is what
  the model genuinely requires under that setting, and capping it would make the recommendation
  undershoot the displayed e1RM. It only surfaces when the seed sits far above the TM-implied 1RM.
- **`targetReps(prev1RM, 0)` returns 1** rather than `null`. A defensive branch against `Infinity`;
  unreachable through the UI, since main-set weights are floored at the bar weight.
- **Cross sets are prescribed volume, not max effort.** They are still eligible to seed a week the
  lift did not otherwise train, which understates strength for that week. This is intentional —
  some signal beats none — and the median over three weeks limits the damage.

## References

- Code: `src/lib/calc.ts` (`estimated1RM`, `targetReps`, `median`, `seedE1Rm`, `calcAmrapTarget`)
- Code: `src/lib/cycle.ts` (`getRecentWorkingSets`), `src/lib/performance.ts`
  (`isWorkingPerformance`, `bestEstimatedPerformance`)
- Code: `src/lib/workout-compose.ts` (`amrapTargetsFor`), `src/screens/Workout.tsx`
- Tests: `src/lib/calc.test.ts`, `src/lib/cycle.test.ts`

## Conclusion

The approach is sound: a median over recent per-week bests is a stable, responsive strength estimate,
and inverting Wathan turns it into a rep goal scaled to the day's weight. The two defects found were
both in *what qualifies as a performance* rather than in the math — a cross block outranking a real
top set, and unloaded rows counting as work. Both are fixed and covered by regression tests.
