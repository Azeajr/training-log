# CLAUDE.md

**Quick-start guide for Claude Code**

---

## Project Overview

5/3/1 strength training log — offline-first PWA. Tracks cycles, sessions, sets, cross-lift and
accessory work, and training maxes. Also carries **PT checklists** (`/pt`) — rehab routines ticked
off set by set, on their own tables, feeding none of the training math.

**Tech Stack**: Solid.js — **not React** (signals, no re-render, no hooks rules). TypeScript, Vite,
Tailwind 4, Vitest. Package manager is **pnpm**.

**Database**: `@sqlite.org/sqlite-wasm` runs in a Web Worker + OPFS in prod, but in-process under vitest.

**Deployment**: Cloudflare Pages (static, no server; `.github/workflows/deploy.yml`). The workflow is
path-filtered, and it **does** gate: it runs `pnpm run check:ci` (`lint` + `test:coverage` + `build`)
before deploying, so a failure blocks the deploy. Note `test:coverage`, not plain `test` — the
coverage thresholds only ever run in CI, which is why their `include` scope matters.
`.github/workflows/ci.yml` always reports a status on PRs. Code changes run `check:ci`,
`verify-sw` (real service worker against a production build), and E2E; prose-only changes skip
those suites.

## Gotchas that cost time

- `tsc -p tsconfig.json` checks nothing (the root config is a solution file). Use `pnpm typecheck`.
- Cycle length is a setting: `cycleFinalWeek(hasDeloadWeek)` → 3 or 4. Never hardcode week 4.
- e1RM is **Wathan**, not Epley.
- A PT run writes nothing until FINISH — ticks live in `store/pt-store`, not the DB.
- A schema change touches six files — see Common Mistakes #1 before starting one.

---

## Key Docs

- **Common Mistakes**: `.claude/COMMON_MISTAKES.md` ⚠️
- **Commands and setup**: `README.md`
- **Open work**: `ROADMAP.md`
- **Rest/audio diagnostic procedure**: `docs/diagnostic-trace.md`
- **Band loading behavior**: `docs/design/band-loading.md`

---

**Last Updated**: 2026-09-25
