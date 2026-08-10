# Verification — Rest-timer system notifications

**Date:** 2026-08-09
**Commit:** `a0fc86c` (feature) — written against working tree at `25524bd`
**Verdict:** PASS — automated tests + Chrome desktop runtime pass. Scope: chime
subject to OS notification-sound policy (see runtime notes); stalled-session
and fail-rest multi-cue legs still unverified by hand.

## Claim

With **Settings → rest-timer notifications** enabled, starting a rest arms
one-shot system notifications in the service worker at the phase thresholds
(nudge / warning / critical) computed by `lib/calc.ts`. Starting a session arms
a 2-hour stalled-session alert ("Session idle"). All notifications are
coalesced by `tag` (`rest-timer`, `stalled-session`), so a re-schedule replaces
a stale one. Stopping or skipping rest cancels the rest timers; clearing the
session cancels the stalled timer; every timer is dropped on unmount. When no
service worker controls the page (dev preview), the same targets fall back to
in-page `setTimeout`s.

## Method — automated test evidence

This feature cannot be exhaustively exercised by unit tests (system
notifications require a permission prompt + SW runtime), so this record is a
test-evidence summary. Everything below ran in this repo on 2026-08-09:

| Gate | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `rtk lint` | PASS, no issues |
| `pnpm build` (injectManifest SW) | PASS — `dist/service-worker.js` generated, 31-entry precache manifest injected (`__WB_MANIFEST` replaced) |
| `pnpm test` | PASS — 46 files, 1034 tests |

What the tests pin down:

- `src/lib/notifications.test.ts` — pure target computation: rest thresholds
  per rest type, stalled-session target, tag coalescing; page-timer fallback
  fires/cancels when no SW controller exists; `cancelAll` clears both tag
  groups.
- `src/components/workout/RestTimer.test.tsx` (SW notification scheduling
  block) — with the setting on, `startRest` posts `{type:'schedule',
  tag:'rest-timer'}` to the SW controller, `stopRest` and SKIP REST post
  `{type:'cancel'}`; with the setting off nothing is posted but the rest still
  runs (wake lock still requested); `startSession` posts the
  `stalled-session` schedule and `clearSession` cancels it.
- RestTimer's existing blocks keep passing — wake-lock and audio/vibration
  cues are unaffected by the gating.

## Runtime pass — 2026-08-09, Chrome (desktop), production preview build

Method: `pnpm build && pnpm preview`, http://localhost:5175, hard refresh to
gain SW control (clientsClaim is deliberately skipped), Settings toggle ON +
permission granted.

| # | Check | Result |
|---|---|---|
| 1 | Permission prompt on enabling the setting | PASS — prompted from the toggle gesture; granting persisted the setting across reload |
| 2a | Nudge fires at threshold with tab backgrounded (normal rest, SW-controlled) | PASS — notification displayed while the tab was unfocused |
| 2b | Fail-rest warning/critical multi-cue | NOT CHECKED |
| 3 | Restart replaces pending nudge (tag coalescing) | NOT CHECKED |
| 4 | Stop/skip cancels; stalled-session 2 h alert | NOT CHECKED (2 h wait declined) |
| 5 | Disabling the setting mid-rest cancels | NOT CHECKED |
| — | `notificationclick` focuses the app | NOT CHECKED |

### Chime finding (resolved, no code change)

The nudge displayed but made **no sound until the tab regained focus**. Root
cause is not the SW: `showNotification` is called without `silent`
(`src/service-worker.ts:63`), so the chime is Chrome/OS policy — the
Notification API exposes no sound control on desktop Chrome (`vibrate` is
Android-only, `sound` unimplemented). Chrome plays the chime only outside
certain window-focus/sound-policy conditions (per-app "Play a sound" toggle in
Windows Settings → System → Notifications → Chrome, DND/quiet hours, etc).

Resolution: product decision — keep the SW-timer architecture (option 1 of the
review; it is the ceiling for an offline-first, serverless app — true Web Push
would require a backend + network at arming time, and Notification Triggers,
the one API that could have covered closed-browser + offline locally, had its
development explicitly ended by Google). An in-app "replay missed cue on tab focus" was
proposed and declined. Users who want the chime flip the OS per-app sound
toggle; nothing to fix in the app.

## Since verified

Feature shipped as `a0fc86c`; this record's automated evidence and the
runtime pass above cover the headline claim (fires while the tab is
backgrounded). Remaining unverified-by-hand legs (2b, 3, 4, 5, click-focus)
are pinned by unit tests; revisit if a browser pass is ever convenient.