# Verification — SW hardening: page-primary notifications, offline shell, cache eviction scope

**Date:** 2026-08-09
**Commit:** working tree (follow-up to `a0fc86c`)
**Verdict:** PASS — automated tests **and** the browser legs. All five runtime legs (offline nav
reload, hidden-tab dedup and the rest) were executed in headless Chromium against a production
build by `scripts/verify-notify-hardening.js`; the table below records them as passed, and every
leg also has a unit-test pin.

> **Amended 2026-09-15.** This header previously read "Runtime legs requiring a browser … listed as
> TODO below", directly above the table marking them all passed — it was written before the legs ran
> and never updated after, and `docs/INDEX.md` repeated the stale claim. The harness now runs in CI
> as the `verify-sw` job, and carries two further legs added with the F65/F66 fix.

## Claims under test

1. **Page timers are the reliable path (Finding 1).** `src/lib/notify-timers.ts` is the single
   tag-keyed scheduler used by both the page and the SW. The SW's own `setTimeout` does not keep
   the worker alive (engine behavior; see COMMON_MISTAKES #11), so the page arms every schedule
   and the SW mirrors it. A hidden tab fires the page notification too, so the "screen locked /
   tab backgrounded" case no longer depends on SW survival.
2. **No duplicate notifications in the foreground (policy).** With a SW controlling the page, the
   page fires only while the tab is hidden; the SW owns the visible case. No SW (dev preview) →
   page always fires.
   **Amended 2026-09-16 (F107): this policy is withdrawn.** The SW cannot own the visible case —
   `navigator.serviceWorker.controller` reports control, not aliveness, and the SW's timers die
   with the worker (~30 s idle) and are never re-armed, so a 90 s bell had nothing to defer to and
   nothing fired at all. The page now fires regardless of visibility; the shared `tag` coalesces a
   live SW's notification with it into one OS item, without re-alerting. Leg C's expectation
   changed from `page 0 / SW 1` to `page 1 / SW 1` on the same date.
3. **Offline cold navigation works (Finding 2).** `index.html` is precached (`vite.config.ts`
   glob) and the fetch handler is network-first for navigations with a precached-shell fallback,
   so `/`, `/workout`, … render offline instead of a dead page.
4. **Cache eviction is scoped (Finding 3).** `activate` deletes only `precache-*` caches other
   than the live one; a future feature cache is never wiped.
5. **Catch-up (Finding 6).** Past-due targets fire on a deferred tick so a re-schedule's
   cancel-then-arm can drop them; page re-arm on load (RestTimer mounts with the persisted
   `restStartedAt` / session date) fires anything the dead page missed. Fully-closed-browser
   wake remains impossible without a backend — documented, not a bug.

## Automated evidence (2026-08-09)

| Gate | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `rtk lint` | PASS |
| `pnpm test` | PASS — 47 files, 1054 tests |
| `pnpm build` | PASS — injectManifest, 32 precache entries incl. `index.html` |

- `src/lib/notify-timers.test.ts` (new): fires at due; not before; past-due fires on next tick;
  same-tick cancel suppresses a past-due arm; multi-cue same-tag targets; tag-scoped cancel;
  single-handle cancel; `cancelAll`; fired handles pruned (no leak); `pending()` arm order.
- `src/lib/notifications.test.ts`: policy matrix — no-SW visible fires; SW+visible page silent;
  SW+hidden page fires; past-due+SW+visible page silent; cancel posts to SW **and** clears page
  timers; existing threshold/cancel/cross-tag behavior unchanged.
- `src/components/workout/RestTimer.test.tsx`: fail rest posts warning+critical schedules;
  re-start replaces (one cancel + one schedule); stopping rest cancels only the rest tag, the
  stalled timer stays armed.

## Runtime legs — headless browser verification

Executed by `scripts/verify-notify-hardening.js` against the production build
(`pnpm build` → `pnpm exec vite preview --strictPort`, headless Chromium):

| # | Check | Status |
|---|---|---|
| A | Offline hard reload at `/` and `/workout` renders the shell | PASS |
| B | Backgrounded tab: page AND SW each fire once (tag coalesces to one OS item) | PASS |
| C | Visible tab: no page notification while SW controls (SW fires exactly one) | PASS |
| D | SW unregistered + hidden tab → notification still arrives from the page timer | PASS |
| E | Reload mid-rest → past-due nudge fires exactly once on load | PASS |

Harness caveats (headless Chromium hard-denies OS notification permission):
- page `Notification.permission` getter stubbed to `'granted'` via an init script;
- the real SW's `registration.showNotification` is wrapped through a Playwright
  worker handle so SW-side fires are countable (message protocol + timers run
  for real; only OS delivery is faked);
- hidden tab emulated by shadowing `document.hidden` (CDP visibility emulation
  is not exposed in this Chromium build).

Re-run: `pnpm build && node scripts/verify-notify-hardening.js`.

## Residual limitation

With the browser fully closed, nothing can wake the SW (Notification Triggers ended development;
Web Push needs a backend — deferred in ROADMAP). The stalled-session alert is therefore a
page-lifetime feature; the SW mirror covers the backgrounded-tab case best-effort.