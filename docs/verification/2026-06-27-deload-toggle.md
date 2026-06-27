# Verification — Deload week toggle (4-WEEK / 3-WEEK)

**Date:** 2026-06-27
**Commit verified:** `e72e46d` (feat(amrap,cycle): robust median 1RM seed + configurable deload week)
**Verdict:** PASS

## Claim

A global `hasDeloadWeek` toggle in Settings → SUPPLEMENTAL section. Selecting
**3-WEEK** hides the deload-supplemental controls (SKIP IT / DELOAD % / NORMAL)
and shrinks the cycle to weeks 1–3; **4-WEEK** keeps them and runs weeks 1–4.
The choice persists. Verified against the diff.

## Method

Runtime observation at the pixel surface. Drove the real app (`npm run dev`,
localhost:5173) with a Playwright script using bundled chromium — the MCP
Playwright server was pinned to an uninstallable `chrome` channel. Fresh OPFS
state, so the 3-step setup was completed first to create an active cycle (the
week selector only renders when `currentCycleWeek() !== null`).

## Steps

| # | Action on running app | Observed |
|---|---|---|
| 1 | Open Settings, default state | `4-WEEK` selected; SKIP IT visible; week selector = `["1","2","3","4"]` |
| 2 | Click `3-WEEK` | supplemental controls gone; "TMs progress after week 3" note shown; week selector = `["1","2","3"]` |
| 3 | Reload page | `3-WEEK` still selected (`border-accent`); supplemental still hidden; weeks still `["1","2","3"]` → **persists** |
| 4 | Click `4-WEEK` | supplemental controls return; week selector back to `["1","2","3","4"]` |
| 5 (probe) | Set deload-supplemental to non-default **SKIP IT**, flip 3-WEEK → 4-WEEK | SKIP IT **still selected** — toggle hides but does not wipe the `deloadSupplemental` value |
| 6 (probe) | Rapid double-click `3-WEEK` | stays selected, supplemental hidden, no flicker/desync |

## Findings

- All happy-path steps and both probes held; nothing broke.
- The week selector (1–3 vs 1–4) is coupled to an active cycle — hidden on a
  fresh DB until setup completes. Expected, not a bug.
- `deloadSupplemental` selection survives toggling the deload week off and on;
  no surprise reset.
