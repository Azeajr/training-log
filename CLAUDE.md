# CLAUDE.md

**Quick-start guide for Claude Code**

---

## Project Overview

5/3/1 strength training log — offline-first PWA. Tracks cycles, sessions, sets, accessories, and training maxes.

**Tech Stack**: Solid.js 1, TypeScript 6, Vite 8, Tailwind CSS 4, `@sqlite.org/sqlite-wasm` (Web Worker + OPFS in prod, in-process under vitest), Vitest 4, Playwright 1, @solidjs/router

**Deployment**: GitHub Pages (static, no server)

---

## Quick Start Commands

```bash
npm run dev          # dev server (Vite)
npm test             # unit tests (Vitest)
npm run check        # build + test
npm run test:e2e     # Playwright e2e
npm run build        # tsc + vite build
npm run lint         # ESLint
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

**Last Updated**: 2026-05-22
