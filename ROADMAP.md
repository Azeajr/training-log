# Training Log — Roadmap

## Done

### Test Infrastructure — Coverage + Mutation

440 unit and component integration tests covering `src/lib`, `src/screens`, `src/store`, and key components. Vitest v8 coverage enforces ≥80% line, branch, function, and statement thresholds; current branch coverage is 91.86% (632/688). Stryker mutation testing (`npm run test:mutation`) enforces ≥80% mutation score on `src/lib` using `inPlace` mode with `perTest` coverage analysis.

Coverage approach: lib functions tested with `fake-indexeddb`; screens tested end-to-end from DOM event through store to DB render with `@solidjs/testing-library` + jsdom. No mocking of the DB layer.

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
`@solidjs/testing-library` + Vitest + `fake-indexeddb` covering every screen and key component: `Today`, `Setup`, `History`, `HistoryEdit`, `Settings`, `AccessoryPicker`, `AmrapTargets`, `SessionPreview`, `RestTimer`, `BottomNav`, `DurationInput`. Every user-visible interaction path exercises the full stack from UI event → SolidJS store → SQLite → rendered output with no DB layer mocked.

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

CLEANUP ORPHANS button in Settings → DATA. Deletes `liftAccessories` / `accessoryTrainingMaxes` rows with missing `exerciseId`, deletes `accessorySets` rows with missing `sessionId`, and archives exercises with no assignments and no set history. Gated behind confirm dialog. Detection logic extracted to `buildCleanupPlan` (pure function) with unit and RTL screen test coverage.

### Manual Week Override

CYCLE section in Settings shows the current week (1–4) with skip-forward buttons. Clicking a future week marks all remaining sessions in skipped weeks as `skipped` (creating missing lift sessions as needed) and advances program state. Gated behind confirm dialog.

### Supplemental Template Selection

Per-lift supplemental template selector in Settings. Templates:
- **FSL** (default) — 5×5 at the first working set weight
- **SSL** — 5×5 at the second working set weight
- **BBB** — 5×10 at 50% TM
- **BBS** — 10×5 at 60%/70%/80% TM across weeks 1–3; hidden on deload week
- **None** — no supplemental block

FSL corrected from 5×10 to 5×5. Header in Workout screen is dynamic and shows sets × reps and % TM where applicable.

### Estimated 1RM History Chart

`TmChart` in the History By Lift view refactored to dual-series SVG with shared date-based X axis. TM plotted in accent colour; estimated 1RM (Epley: `weight × (1 + reps / 30)`) from each AMRAP set plotted in dashed warn colour. Legend shows each series only when it has 2+ data points.

---

## Planned

### Push Notifications

Rest timer fires audio + vibration in-app. When the screen locks or the browser backgrounds, cues go silent. Push notifications solve this.

**What's needed**

Service worker — already registered by vite-plugin-pwa. Needs a `notificationclick` handler and access to the Notification API.

Permission request — `Notification.requestPermission()` triggered by a deliberate user action (Settings toggle), not on first load. iOS 16.4+ requires the app to be installed as a PWA.

**Scheduling options**
- `setTimeout` inside the service worker at set-log time. Survives backgrounding on Android; unreliable on iOS due to aggressive SW suspension.
- Push API (`PushManager.subscribe`) with a backend sending a Web Push message at the right timestamp. Reliable cross-platform but requires a server component and VAPID keys.

**Notification types**

| Trigger | Message |
|---|---|
| Rest threshold reached (normal/transition) | "Time for your next set" |
| Rest threshold reached (fail) | "Rest up — take your time" |
| Session left open > 2 hours | "Did you finish your session?" |

**Platform notes**
- Android Chrome: full support
- iOS 16.4+ (installed PWA only): available; prefer Web Push over SW scheduling
- iOS Safari (not installed): no notification support

**Implementation order**
1. Settings toggle: "Notify me when rest is over" (off by default)
2. On enable: `Notification.requestPermission()`
3. Schedule via SW `setTimeout` (covers Android + desktop)
4. Evaluate Web Push backend if SW scheduling proves unreliable on iOS

---

### Onboarding — Methodology Overview

Add an informational section to the setup wizard explaining 5/3/1 basics before the user enters training maxes.

**Key terms to define**
- **Training Max (TM)** — the weight the program calculates sets from; typically 85–90% of true 1RM
- **AMRAP (Plus sets)** — the final main set each week: lift as many reps as possible; performance drives joker sets and TM recommendations
- **Cycle structure** — 4 weeks: week 1 (5s), week 2 (3s), week 3 (5/3/1), week 4 (deload); TM increments after each deload

---

### TM Adjustment Recommendations

After completing a cycle, recommend whether to increase, hold, or reduce the TM for each lift based on AMRAP performance — rather than applying a fixed increment.

- If AMRAP reps are well above target (e.g. 10+ on week 3), suggest a larger jump
- If AMRAP reps are at or below minimum (e.g. ≤ 1 on week 3), suggest holding or reducing
- Surface as a prompt when deload week is completed

---

### Post-Session TM Prompt (from weight adjustments)

If the user bumped up the weight on the top set (AMRAP set) relative to the planned weight, surface a prompt at session completion: "You lifted Xlb on your top set — want to update your training max?" Opt-in only; TM does not change unless confirmed.

- Compare logged weight vs planned weight on the AMRAP set
- Only trigger if logged weight > planned (voluntary bump up, not a bail)
- Skip if cycle is on deload week (no AMRAP)

---

### Training Volume Insights

Per-session and per-week totals:
- Total tonnage (sum of weight × reps across all sets)
- Set count by category (main / FSL / accessory)
- Weekly frequency — how many days trained

Surface in History or a dedicated Stats tab.

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

### Assistance Category Tracking

Tag each accessory exercise as **Push**, **Pull**, or **Single Leg / Core**. Track rep totals per category per session and show progress toward the Wendler target of 25–100 reps from each bucket every workout.

---

### Session Notes Indicator in History

`sessions.notes` is stored and editable in HistoryEdit but invisible in the History list view. Surface a visual indicator (dot or truncated preview) on session rows that have notes, so users can find annotated sessions without expanding each one.

---

