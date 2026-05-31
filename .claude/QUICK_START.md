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
Vitest aliases `/sqlite-client$/` → `src/db/sqlite-test-client.ts` so tests run against
in-process `@sqlite.org/sqlite-wasm` (no Web Worker, no OPFS) but through the same
`SQLiteTable` query layer as production.

## Common Workflows

1. **Adding a screen-level component**: `src/screens/Foo.tsx` + `Foo.test.tsx` (coverage gate
   includes `screens/**/*.tsx`). Components under `components/` only need a test when they own
   non-trivial logic (see `RestTimer`, `SetRow`, `InlineConfirm`).
2. **Schema change**: one source of truth — `src/db/schema.ts`:
   - Add the column to `SCHEMA` (`CREATE TABLE`) so fresh installs get it.
   - Push a matching `ALTER TABLE … ADD COLUMN` into `ADDITIVE_MIGRATIONS` so already-deployed
     DBs pick it up.
   - Update `ALL_TABLES` if you added a brand-new table.
   - Mirror the column in `src/types/domain.ts`.
   - Wire any non-trivial serialization (Date / bool / JSON) into the matching `SQLiteTable`
     instance in `src/db/index.ts`.
3. **New route/screen**: add to `src/screens/`, wire `<Route>` in `src/App.tsx`.
4. **State change**: edit `src/store/workout-store.ts` or `settings-store.ts` (Solid `createStore`,
   not Zustand). Persisted workout state is keyed by `STORAGE_VERSION` in `workout-store.ts` —
   bump it when changing the persisted shape so old state is dropped on reload.
5. **Calc logic**: `src/lib/calc.ts` (pure) — always add to `calc.test.ts`. **PR detection**: `src/lib/pr.ts` (`detectAmrapPRs`) — always add to `pr.test.ts`.
6. **TM recommendation logic**: `src/lib/tm-recommendations.ts` — `getSessionTmRecommendation`
   (post-session AMRAP e1RM check, ≥15% delta) and `getCycleDoublingCandidates` (cycle-end
   doubling eligibility). Thresholds: `SESSION_TM_BUMP_THRESHOLD = 0.15`,
   `CYCLE_DOUBLE_THRESHOLD = 0.10`. Always add to `tm-recommendations.test.ts`.
7. **DB-backed business logic**: `src/lib/cycle.ts`, `training-max.ts`, `exercise.ts`, etc. Take a
   `TrainingDB` parameter (`type TrainingDB = typeof db`, exported from `src/db/index.ts`).
   The previous `lib/types.ts` indirection was removed — import the type directly from
   `db/index`. Keeps signatures explicit and tests trivial.

## Deploy

Push to `main` → GitHub Actions builds + deploys to GitHub Pages automatically.
`public/demo-seed.json` is a manual-import payload (Settings → IMPORT JSON), not an automatic
demo-mode seed.

---

**Last Updated**: 2026-05-31
