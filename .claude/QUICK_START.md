# Quick Start Commands

---

## Development

```bash
npm run dev                      # Vite dev server at localhost:5173
npm run build                    # tsc -b && vite build → dist/
npm run preview                  # preview production build at localhost:5175
npm run lint                     # ESLint
```

## Testing

```bash
npm test                         # Vitest unit tests (run once)
npm run test:coverage            # Vitest with v8 coverage (gated 80%)
npm run test:mutation            # Stryker mutation testing
npm run check                    # build + unit tests (pre-commit gate)
npm run test:e2e                 # Playwright e2e (needs built app or dev server)
```

Unit tests live next to source: `src/**/*.test.ts(x)`.
E2e tests: `tests/e2e/`.
Vitest aliases `db/index` → `db/db.ts` so tests run against Dexie + fake-indexeddb instead of the
SQLite worker.

## Common Workflows

1. **Adding a screen-level component**: `src/screens/Foo.tsx` + `Foo.test.tsx` (coverage gate
   includes `screens/**/*.tsx`). Components under `components/` only need a test when they own
   non-trivial logic (see `RestTimer`, `SetRow`, `InlineConfirm`).
2. **Schema change**: edit BOTH backends in lockstep:
   - `src/db/sqlite.worker.ts` — add column to the `SCHEMA` `CREATE TABLE` block, plus an
     `ALTER TABLE … ADD COLUMN` for already-deployed DBs.
   - `src/db/db.ts` — Dexie schema. Only bump `this.version(N+1).stores(...)` if you changed an
     indexed field; Dexie is schemaless for plain fields, but keeping versions matched avoids
     test/prod drift.
   - `src/types/domain.ts` — entity interface.
3. **New route/screen**: add to `src/screens/`, wire `<Route>` in `src/App.tsx`.
4. **State change**: edit `src/store/workout-store.ts` or `settings-store.ts` (Solid `createStore`,
   not Zustand). Persisted workout state is keyed by `STORAGE_VERSION` in `workout-store.ts` —
   bump it when changing the persisted shape so old state is dropped on reload.
5. **Calc logic**: `src/lib/calc.ts` (pure) — always add to `calc.test.ts`.
6. **DB-backed business logic**: `src/lib/cycle.ts`, `training-max.ts`, `exercise.ts`, etc. Take a
   `TrainingDB` (interface in `lib/types.ts`), never import `db/index` directly — keeps tests
   able to swap in Dexie.

## Deploy

Push to `main` → GitHub Actions builds + deploys to GitHub Pages automatically.
`public/demo-seed.json` is a manual-import payload (Settings → IMPORT JSON), not an automatic
demo-mode seed.

---

**Last Updated**: 2026-05-21
