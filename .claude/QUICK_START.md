# Quick Start Commands

---

## Development

```bash
npm run dev                      # Vite dev server at localhost:5173
npm run build                    # tsc -b && vite build → dist/
npm run preview                  # preview production build locally
npm run lint                     # ESLint
```

## Testing

```bash
npm test                         # Vitest unit tests (run once)
npm run check                    # build + unit tests (pre-commit gate)
npm run test:e2e                 # Playwright e2e (needs built app or dev server)
```

Unit tests live next to source: `src/**/*.test.ts(x)`.
E2e tests: `tests/e2e/`.

## Common Workflows

1. **Adding a component**: create `src/components/Foo.tsx` + `Foo.test.tsx`
2. **Schema change**: edit `src/db/db.ts` — bump Dexie version, add migration block
3. **New screen**: add to `src/screens/`, wire route in `src/App.tsx`
4. **State change**: edit `src/store/workoutStore.ts` or `settingsStore.ts` (Zustand)
5. **Calc logic**: `src/lib/calc.ts` — always add to `calc.test.ts`

## Deploy

Push to `main` → GitHub Actions builds + deploys to GitHub Pages automatically.
Demo site uses `public/demo-seed.json` via demo mode flag.

---

**Last Updated**: 2026-05-12
