# Quick Start Commands

---

## Development

```bash
pnpm dev                         # Vite dev server at localhost:5173
pnpm typecheck                   # tsc -b
pnpm build                       # tsc -b && vite build → dist/
pnpm preview                     # preview the production build at localhost:5175
pnpm lint                        # ESLint (no-floating-promises on src/ and tests/e2e/)
```

The root `tsconfig.json` is a solution file (`files: []`). `tsc -p tsconfig.json` checks **nothing**
and reports a false green — always use `tsc -b` (i.e. `pnpm typecheck` or `pnpm build`).

## Testing

```bash
pnpm test                        # Vitest unit + component tests (run once)
pnpm test:coverage               # + v8 coverage gate: 80% over lib/, screens/, store/
pnpm test:mutation               # Stryker over src/lib; report in reports/mutation/
pnpm check                       # build + unit tests (pre-commit gate)
pnpm test:e2e                    # Playwright; auto-starts the dev server
pnpm debug:browser               # chromium walks the setup wizard, dumps errors + screenshot
```

Unit tests live next to source: `src/**/*.test.ts(x)`. E2E: `tests/e2e/`.

Vitest aliases `/sqlite-client$/` → `src/db/sqlite-test-client.ts` so tests run against in-process
`@sqlite.org/sqlite-wasm` (no Web Worker, no OPFS) through the same `SQLiteTable` query layer as
production. lib and db suites reset with `__resetForTest()` in their own `beforeEach`; screen suites
clear the tables they seed. There is no autouse fixture.

`pnpm debug:browser`'s wipe step deletes an IndexedDB named `TrainingLog`, unused since the SQLite
migration — it does **not** clear OPFS. Use `pnpm test:e2e` (its `_freshDb` fixture calls
`window.__e2eResetDb`) for a genuine first-run state.

**Arch Linux**: Playwright's bundled Chromium needs system libs not installed by default:
```bash
sudo pacman -S atk at-spi2-atk libxcomposite libxdamage libxfixes libxrandr alsa-lib nss cups
```

## Common Workflows

1. **New route/screen**: add `src/screens/Foo.tsx` + `Foo.test.tsx`, wire a `<Route>` in `src/App.tsx`.
   The coverage gate includes `screens/**/*.tsx`. Components under `components/` only need a test when
   they own non-trivial logic (`Stepper`, `RestTimer`, `SetRow`, `InlineConfirm`, `AccessoryPicker`,
   `AmrapTargets`, `NotesField`, `DurationInput`, `TmRecommendationModal` are the precedents).
2. **Schema change**: six coordinated edits — see `.claude/COMMON_MISTAKES.md` #1. The short version:
   `SCHEMA` + `ADDITIVE_MIGRATIONS` (+ `ALL_TABLES` for a new table) in `src/db/schema.ts`, the field in
   `src/types/domain.ts`, serialization in `src/db/index.ts`, the column in `COLS` (and `importSpec`
   for a new table) in `src/lib/export-import.ts`, plus any defaults/seed/resolver consumers.
   Then verify against a DB that already holds data — tests always start from a fresh `SCHEMA`.
3. **State change**: `src/store/workout-store.ts` or `settings-store.ts` (Solid `createStore`, not
   Zustand). Persisted workout state is keyed by `STORAGE_VERSION` — bump it when the shape changes,
   and add a `PERSISTED_VALIDATORS` entry for any new key.
4. **Calc logic**: `src/lib/calc.ts` (pure) — always add to `calc.test.ts`. e1RM is **Wathan**
   (`weight / (0.488 + 0.538·e^(−0.075·reps))`, with `reps === 1` short-circuiting to `weight`), and
   AMRAP targets seed off the median estimate over the last 3 non-deload AMRAPs (`seedE1Rm`,
   `getRecentAmraps`). **PR detection**: `src/lib/pr.ts` (`detectAmrapPRs`) — always add to `pr.test.ts`.
5. **TM recommendation logic**: `src/lib/tm-recommendations.ts` — `getSessionTmRecommendation`
   (post-session AMRAP check, ≥15% delta) and `getCycleDoublingCandidates` (cycle-end doubling).
   Thresholds: `SESSION_TM_BUMP_THRESHOLD = 0.15`, `CYCLE_DOUBLE_THRESHOLD = 0.10`. Add to
   `tm-recommendations.test.ts`.
6. **Cycle length**: a cycle runs weeks 1–3 or 1–4 depending on `settings.hasDeloadWeek`.
   `cycleFinalWeek(hasDeloadWeek)` is the only source for that — never hardcode 4.
7. **DB-backed business logic**: `src/lib/cycle.ts`, `training-max.ts`, `lift.ts`, `session.ts`, etc.
   take a `TrainingDB` parameter — import the type from `src/db/index.ts` (`TrainingDB` is the exported
   alias for `TrainingSQLiteDB`). Keeps signatures explicit and tests trivial.
8. **Positional lists in Solid**: use `<Index>`, not `<For>` — see `.claude/COMMON_MISTAKES.md` #6.

## Deploy

Push to `main` → GitHub Actions builds and deploys to Cloudflare Pages
(`wrangler pages deploy dist --project-name 531-log`, see `.github/workflows/deploy.yml`).

The workflow is **path-filtered**: it only runs when the diff touches `src/**` (excluding
`src/**/*.test.*`), `public/**`, `index.html`, `package.json`, `pnpm-lock.yaml`, `vite.config.*`, or
`tsconfig*`. A docs- or test-only commit produces no run. CI never runs lint or tests, so
`pnpm build && pnpm lint && pnpm test` locally is the only regression gate.

---

**Last Updated**: 2026-07-29
