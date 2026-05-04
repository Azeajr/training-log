# App Development Task List: 5/3/1 Methodology Refinement

## 1. Bugs

* ~~**[BUG] Weight Persistence:** Fix the state management issue where a manually adjusted set weight resets to its original value when leaving and returning to the workout screen. Affects both First Set Last sets and assistance exercises.~~ **FIXED** — FSL: `loadData()` now restores pending set weights from persisted `loggedSets` instead of always recalculating from TM. Accessory: `AccessoryLog` now initialises weight from the last logged set weight rather than always from `calculatedWeight`.

## 2. Core Workout Logic

* **Dynamic Weight Syncing:** If the weight of the first main set is modified, all subsequent "First Set Last" (FSL) sets should automatically update to match that new weight.
    * *Note:* Syncing already exists for FSL→FSL (when logging an FSL set with an adjusted weight, remaining FSL sets update). What is missing is Main Set → FSL syncing.
* **AMRAP Dynamic Recalculation:** When a user manually changes the weight for an AMRAP (As Many Reps As Possible) set, the "Target Rep" goal must instantly recalculate based on the new weight to reflect the correct intensity/e1RM goal.

## 3. Validation Fixes

* **Weight Floor Constraint:** Enforce a minimum Training Max in the setup wizard so that no calculated set weight falls below 45 lbs (standard bar weight).
    * *Reasoning:* The lowest percentage across the full cycle is **40%** (Deload Week, Set 1). For that set to reach 45 lbs, TM must be at least 45 ÷ 0.40 = 112.5 lbs → **115 lbs** rounded up to the nearest 5 lb increment.
    * *Design decision required:* A 115 lb minimum TM may be too restrictive for some users. An alternative is to enforce 115 lbs in the wizard **or** allow lower TMs but clamp any displayed set weight to 45 lbs when the calculation falls below bar weight.
* **Training Max Validation:** Modify the input validation for Assistance Exercise Training Max to allow the value to be set to **0**.
    * *Reasoning:* Users performing bodyweight-only assistance moves (e.g., pull-ups, dips) need to be able to log a 0 lb Training Max.

## 4. Installation Wizard & Onboarding

* **Methodology Educational Content:** Add an informational "blurb" within the startup wizard explaining the 5/3/1 methodology basics.
    * **Content:** Define key terms: Training Max (TM), AMRAP (Plus sets), and Cycle structure.

## 5. Future Considerations

* **Set Deletion:** Implement the ability to delete a recorded set.
    * *Note:* This requires handling downstream implications for volume totals, PR tracking, and Training Max calculations, as well as impacts on visibility of JOKER set options or FSL options.
