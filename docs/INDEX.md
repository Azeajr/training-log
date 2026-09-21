# Documentation Index

Every markdown doc in the repo, what it is for, and when to load it.

---

## Load at session start

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | Stack, deploy model, the gotchas that cost time, pointers to everything else |
| `.claude/COMMON_MISTAKES.md` | Recurring failure modes with symptom → check → fix |
| `.claude/QUICK_START.md` | Commands and the common workflows (new screen, schema change, calc logic) |

## Load when the task calls for it

| Doc | Purpose |
|---|---|
| `.claude/ARCHITECTURE_MAP.md` | Directory tree, routes, SQLite tables, key patterns, boot order |
| `ENGINEERING_PASSES.md` | Seven self-contained agent prompts: refactor, security, testing, mutation, bug hunt, UI, schema |
| `ROADMAP.md` | Shipped changelog, planned features, security posture, tech debt |
| `README.md` | User-facing overview: features, stack, program structure, how to run |

## Field instruments

- `docs/diagnostic-trace.md` — the rest-timer / audio / notification trace: how to
  capture one on a phone, how to read each record, and what it cannot see. Load
  this before asking a user what they observed.

## Design notes

- `docs/design/plate-loading-model.md` — the `{ plateMode, implementBase }` generalization of
  `usesBarbell`. **Shipped**; kept as the rationale record.
- `docs/design/band-loading.md` — band-assisted and weighted work: the measured
  calibrations, why effective load is exact rather than snapped to 5 lb, why a
  profile is opt-in, and what each set snapshots. **Shipped**; current.

## Verification records

Dated runtime-verification logs, one per claim checked against the running app.

- `docs/verification/2026-06-27-deload-toggle.md` — the 3-WEEK / 4-WEEK cycle toggle.
- `docs/verification/2026-08-09-rest-timer-notifications.md` — rest-timer system
  notifications (SW + page-timer fallback). **PASS** — automated tests plus a Chrome desktop
  runtime pass; the record names which legs remain unverified.
- `docs/verification/2026-09-17-keepalive-and-audio-clock.md` — an inaudible loop
  holds the iOS process alive across an app switch (**PASS**); whether the bell then
  arrives on time is **not tested**; `AudioContext.state` lies after a background
  (**F109**).
- `docs/verification/2026-08-09-swe-hardening.md` — page-primary notification scheduling,
  offline navigation shell, scoped cache eviction. **PASS** — all five runtime legs executed in
  headless Chromium against a production build by `scripts/verify-notify-hardening.js`, which now
  runs in CI as the `verify-sw` job (two more legs were added with the F65/F66 fix).

## Review notes

- `docs/deep-code-review.md` — exhaustive review evidence: 94 findings with per-file
  coverage and bounded batches. **Review complete 2026-09-15; the document is frozen.**
  Read it to learn what a finding *is*.

- `docs/deep-code-review-fixes.md` — the fix ledger for those 94 findings: state,
  commit, PR and regression test, one row each. Read it to learn whether a finding
  is *resolved*. Update it in the same commit as the code change it describes.

- `docs/workflow-review-fixes.md` — the 2026-09-20/21 workflow, PT and band reviews,
  consolidated into one implementation plan **and** fix ledger: 22 items (A1–E1) with
  verified anchors, the code for each change, the traps each naive fix walks into, and
  per-item state. Self-contained — the seven working reviews it consolidates are not in
  the repo. Update this doc in the same commit as the code change it describes.

- `docs/ui-consistency-review.md` — UI/UX consistency findings from the history-modal /
  history-label work. **RESOLVED 2026-08-08**: all nine findings validated, then fixed
  in one design-system pass; resolutions recorded inline. Kept as the rationale record.

## Not loaded automatically

`.claude/completions/`, `.claude/sessions/`, and `docs/archive/` are excluded via `.claudeignore`.
Read them only on explicit request.

---

**Last Updated**: 2026-09-15
