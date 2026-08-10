# Verification — Rest-timer system notifications

**Date:** 2026-08-09
**Commit:** `25524bd`
**Verdict:** AUTOMATED-TEST PASS — runtime pass pending (needs a browser)

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

## Runtime pass — pending (needs a browser)

Not performed here; a human with a real browser should check:

1. Permission prompt appears on enabling the setting (and on first schedule);
   granting is required for SW notifications to show.
2. With the SW installed and the tab backgrounded/locked, the nudge fires at
   the threshold for a normal rest; warning/critical fire for a fail-type
   rest.
3. Restarting a rest replaces the pending nudge (tag coalescing — no double
   notification).
4. Stopping/skipping rest kills pending notifications; clearing the session
   kills the stalled timer; the stalled alert fires 2 h after the session
   started with no interaction.
5. Disabling the setting mid-rest cancels pending timers (page-timer path
   falls back for the remainder only when no SW controller is live).

## Since verified

To be revisited on the runtime pass; if the manual findings confirm the
automated evidence, flip this record's Verdict to PASS and fold the observed
steps in the deload-toggle doc's style.