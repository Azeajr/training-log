# CLAUDE.md

**Quick-start guide for Claude Code**

---

## Project Overview

5/3/1 strength training log — offline-first PWA. Tracks cycles, sessions, sets, cross-lift and
accessory work, and training maxes.

**Tech Stack**: Solid.js — **not React** (signals, no re-render, no hooks rules). TypeScript, Vite,
Tailwind 4, Vitest. Package manager is **pnpm**.

**Database**: `@sqlite.org/sqlite-wasm` runs in a Web Worker + OPFS in prod, but in-process under vitest.

**Deployment**: Cloudflare Pages (static, no server; `.github/workflows/deploy.yml`). The workflow is
path-filtered, and it **does** gate: it runs `pnpm run check:ci` (`lint` + `test:coverage` + `build`)
before deploying, so a failure blocks the deploy. Note `test:coverage`, not plain `test` — the
coverage thresholds only ever run in CI, which is why their `include` scope matters.
`.github/workflows/ci.yml` runs the same `check:ci` on every PR, plus a `verify-sw` job driving the
real service worker against a production build (`pnpm run verify:sw`).

## Gotchas that cost time

- `tsc -p tsconfig.json` checks nothing (the root config is a solution file). Use `pnpm typecheck`.
- Cycle length is a setting: `cycleFinalWeek(hasDeloadWeek)` → 3 or 4. Never hardcode week 4.
- e1RM is **Wathan**, not Epley.
- A schema change touches six files — see Common Mistakes #1 before starting one.

---

## Key Docs

- **Common Mistakes**: `.claude/COMMON_MISTAKES.md` ⚠️
- **Quick Start**: `.claude/QUICK_START.md`
- **Architecture**: `.claude/ARCHITECTURE_MAP.md`
- **Engineering Passes**: `ENGINEERING_PASSES.md` — reusable agent prompts for refactor / security /
  testing / mutation / bug-hunt / UI / schema work
- **Roadmap & changelog**: `ROADMAP.md`
- **Doc map**: `docs/INDEX.md`

**⚠️ NEVER auto-load:**
- `.claude/completions/` — only on explicit request
- `.claude/sessions/` — only on explicit request
- `docs/archive/` — only on explicit request

---

**Last Updated**: 2026-07-29
