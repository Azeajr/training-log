# CLAUDE.md

**Quick-start guide for Claude Code**

---

## Project Overview

5/3/1 strength training log — offline-first PWA. Tracks cycles, sessions, sets, accessories, and training maxes.

**Tech Stack**: Solid.js — **not React** (signals, no re-render, no hooks rules). TypeScript, Vite, Tailwind, Vitest. Package manager is **pnpm**.

**Database**: `@sqlite.org/sqlite-wasm` runs in a Web Worker + OPFS in prod, but in-process under vitest.

**Deployment**: Cloudflare Pages (static, no server; deployed by `.github/workflows/deploy.yml`)

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

**Last Updated**: 2026-07-28
