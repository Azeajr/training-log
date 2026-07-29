# Documentation Index

Every markdown doc in the repo, what it is for, and when to load it.

---

## Load at session start

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | Stack, deploy model, the gotchas that cost time, pointers to everything else |
| `.claude/COMMON_MISTAKES.md` | Nine recurring failure modes with symptom → check → fix |
| `.claude/QUICK_START.md` | Commands and the common workflows (new screen, schema change, calc logic) |

## Load when the task calls for it

| Doc | Purpose |
|---|---|
| `.claude/ARCHITECTURE_MAP.md` | Directory tree, routes, SQLite tables, key patterns, boot order |
| `ENGINEERING_PASSES.md` | Seven self-contained agent prompts: refactor, security, testing, mutation, bug hunt, UI, schema |
| `ROADMAP.md` | Shipped changelog, planned features, security posture, tech debt |
| `README.md` | User-facing overview: features, stack, program structure, how to run |

## Design notes

- `docs/design/plate-loading-model.md` — the `{ plateMode, implementBase }` generalization of
  `usesBarbell`. **Shipped**; kept as the rationale record.

## Verification records

Dated runtime-verification logs, one per claim checked against the running app.

- `docs/verification/2026-06-27-deload-toggle.md` — the 3-WEEK / 4-WEEK cycle toggle.

## Not loaded automatically

`.claude/completions/`, `.claude/sessions/`, and `docs/archive/` are excluded via `.claudeignore`.
Read them only on explicit request.

---

**Last Updated**: 2026-07-29
