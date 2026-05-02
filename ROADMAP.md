# Training Log — Roadmap

## Push Notifications

Currently the rest timer fires audio + vibration cues in-app. When the screen locks or the browser is backgrounded (common in the gym), these cues go silent. Push notifications solve this.

### What's needed

**Service worker** — already registered by vite-plugin-pwa. Needs a `notificationclick` handler and access to the Notification API.

**Permission request** — `Notification.requestPermission()` should be triggered by a deliberate user action (e.g. a toggle in Settings), not on first load. iOS 16.4+ requires the app to be installed as a PWA before notifications are available at all.

**Scheduling** — Two approaches:
- `setTimeout` inside the service worker, scheduled at the moment a set is logged. Survives backgrounding on Android; unreliable on iOS due to aggressive SW suspension.
- Push API (`PushManager.subscribe`) with a backend sending a Web Push message at the right timestamp. Reliable cross-platform but requires a server component (e.g. a Cloudflare Worker) and VAPID keys.

### Notification types to implement

| Trigger | Message | Action on tap |
|---|---|---|
| Rest threshold reached (normal/transition) | "Time for your next set" | Open app → workout screen |
| Rest threshold reached (fail) | "Rest up — take your time" | Open app → workout screen |
| Fail max (300s) reached | "Get back under the bar" | Open app → workout screen |
| Session left open > 2 hours | "Did you finish your session?" | Open app → resume or complete prompt |
| Scheduled workout reminder (future) | "Time to train — OHP today" | Open app → today screen |

### Platform notes

- **Android Chrome**: full support — service worker scheduling + Web Push both work
- **iOS 16.4+ (installed PWA only)**: notifications available; SW suspension means scheduled `setTimeout` may not fire reliably; prefer Web Push
- **Desktop**: full support, but vibration is a no-op
- **iOS Safari (not installed)**: no notification support at all

### Implementation order

1. Settings toggle: "Notify me when rest is over" (off by default)
2. On enable: call `Notification.requestPermission()`
3. Schedule notification via SW `setTimeout` at set-log time (covers Android + desktop)
4. Evaluate Web Push backend if SW scheduling proves unreliable on iOS

### Dependencies

- No new npm packages needed for SW scheduling
- Web Push path: `web-push` npm package on a Cloudflare Worker, VAPID key pair stored in env

---

## Editable History

Completed sessions are currently read-only once the Workout screen is left.

### What's needed

**History screen** — list of completed sessions grouped by date or cycle, accessible from BottomNav. Each row shows lift name, week, date, and a summary (e.g. AMRAP reps).

**Session detail view** — tapping a session opens a read/edit view showing all logged sets (warmup, main, FSL). Each set row should allow inline rep editing, the same edit-mode flow already used in the active Workout screen (`SetRow` → edit mode → SAVE).

**Persistence** — edits write through to `db.sets` via `db.sets.update(id, { reps })`, same as the live `handleEdit` path in Workout.tsx.

### Scope

- Edit reps only (weight is fixed by the program at log time)
- No adding or deleting sets from history
- No editing session date, week, or lift

### Implementation order

1. History screen: list sessions, route `/history/:sessionId` for detail
2. SessionDetail component: reuse `SetRow` in completed+editable mode
3. Wire `onEdit` to `db.sets.update` for historical sessions
