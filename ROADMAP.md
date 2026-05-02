# Training Log — Roadmap

## Done

### Editable History
Route `/history/:sessionId/edit` — edit weight, reps, notes, and accessory exercises on any completed session. Swapping an accessory exercise deletes the old sets and reinserts under the new exercise ID.

### Exit Session Without Saving
EXIT WITHOUT SAVING button on the Workout screen abandons the current attempt, deletes any sets already written to the DB, and leaves the session as `pending` so it can be restarted.

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

### Plate Calculator

Given a target weight, show which plates to load on each side of the bar. Useful at the gym when you don't want to do the math mid-set.

- Standard bar = 45 lb, configurable
- Available plate denominations configurable in Settings
- Show as a simple list: "2 × 45, 1 × 25, 1 × 10"

---

### Estimated 1RM History Chart

The History screen already shows TM over time. An estimated 1RM chart from AMRAP performance would be more meaningful — it reflects actual strength rather than programmed TM.

- Derive est. 1RM from each AMRAP set using the Epley formula (already in `calc.ts`)
- Plot alongside or instead of TM in the By Lift chart

---

### TM Adjustment Recommendations

After completing a cycle, recommend whether to increase, hold, or reduce the TM for each lift based on AMRAP performance — rather than applying a fixed increment.

- If AMRAP reps are well above target (e.g. 10+ on week 3), suggest a larger jump
- If AMRAP reps are at or below minimum (e.g. ≤ 1 on week 3), suggest holding or reducing
- Surface as a prompt when deload week is completed

---

### Custom Accessory Exercises

Currently the exercise list is seeded at startup and fixed. Allow adding new exercises (name + type: reps/timed/distance) from Settings, and assigning them to lifts.

---

### Training Volume Insights

Per-session and per-week totals:
- Total tonnage (sum of weight × reps across all sets)
- Set count by category (main / FSL / accessory)
- Weekly frequency — how many days trained

Surface in History or a dedicated Stats tab.
