# CLAUDE.md

**Quick-start guide for Claude Code**

---

## Project Overview

5/3/1 strength training log — offline-first PWA. Tracks cycles, sessions, sets, accessories, and training maxes.

**Tech Stack**: Solid.js 1, TypeScript 6, Vite 8, Tailwind CSS 4, `@sqlite.org/sqlite-wasm` (Web Worker + OPFS in prod, in-process under vitest), Vitest 4, Playwright 1, @solidjs/router

**Deployment**: Cloudflare Pages (static, no server; deployed by `.github/workflows/deploy.yml`)

---

## Quick Start Commands

```bash
pnpm dev             # dev server (Vite)
pnpm test            # unit tests (Vitest)
pnpm check           # build + test
pnpm test:e2e        # Playwright e2e
pnpm build           # tsc + vite build
pnpm lint            # ESLint
```

**See**: `.claude/QUICK_START.md` for full reference

---

## Key Docs

- **Common Mistakes**: `.claude/COMMON_MISTAKES.md` ⚠️
- **Architecture**: `.claude/ARCHITECTURE_MAP.md`
- **Quick Start**: `.claude/QUICK_START.md`

**⚠️ NEVER auto-load:**
- `.claude/completions/` — only on explicit request
- `.claude/sessions/` — only on explicit request
- `docs/archive/` — only on explicit request

---

**Last Updated**: 2026-05-31
