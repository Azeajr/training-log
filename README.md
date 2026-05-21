# Training Log

A progressive strength training tracker built for the **5/3/1 program**. Designed as a mobile-first PWA for use at the gym.

**Live app:** https://531-log.pages.dev

## Features

- **5/3/1 program logic** — calculates warmup, main, and FSL sets from your training max each week; warmup follows Wendler's 40/50/60% TM prescription (3 sets × 5/5/3 reps)
- **AMRAP tracking** — logs rep PRs on the third main set and shows targets based on prior performance
- **Joker sets** — unlock extra sets after a strong AMRAP; weight increment scales with performance
- **Accessory work** — select assistance exercises per lift, log reps/weight/duration/distance; per-exercise TM progression rate
- **Rest timer** — in-session countdown with audio and vibration cues; Screen Wake Lock keeps display active; different durations for normal, transition, and failed sets
- **Supplemental template** — per-lift selector in Settings: FSL (5×5 at first working weight), SSL (5×5 at second), BBB (5×10 at 50% TM), BBS (10×5 at 60/70/80% TM), or None
- **4-week cycles** — auto-advances week and applies TM progression after each deload; manual week override in Settings
- **History** — view completed sessions by lift or date, editable after the fact, estimated 1RM history chart alongside TM
- **Export / Import** — full JSON or CSV backup and restore
- **PWA** — installable, works offline

## Stack

| Layer | Library |
|---|---|
| UI | SolidJS 1.9, TypeScript 6, Tailwind CSS 4 |
| Routing | @solidjs/router 0.16 |
| State | SolidJS stores |
| Database | SQLite Wasm (dedicated Web Worker) |
| Charts | Custom SVG |
| Build | Vite 8 + vite-plugin-pwa |
| Tests | Vitest 4 + @solidjs/testing-library + Playwright 1 |
| Mutation | Stryker 9 + @stryker-mutator/vitest-runner |

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and enter your training maxes to begin.

## Running Tests

```bash
npm test             # unit + component integration (Vitest)
npm run test:e2e     # end-to-end (Playwright)
npm run test:coverage  # coverage report (v8)
npm run test:mutation  # mutation score (Stryker)
```

Tests are split into three layers:

| Layer | Location | Tools |
|---|---|---|
| Unit | `src/lib/*.test.ts`, `src/store/*.test.ts` | Vitest + fake-indexeddb |
| Component integration | `src/screens/*.test.tsx`, `src/components/*.test.tsx` | Vitest + @solidjs/testing-library + jsdom |
| End-to-end | `tests/e2e/*.spec.ts` | Playwright |

Component integration tests render the full component tree and interact through the DOM. Every screen exercises the full stack: UI event → SolidJS store → SQLite (in-memory worker) → rendered output. No DB layer is mocked.

Coverage targets: ≥80% line, branch, function, statement across `src/lib`, `src/screens`, `src/store`.
Mutation score target: ≥80% (Stryker, `src/lib` only).

## Program Structure

Each cycle is 4 weeks across 4 lifts (OHP, Deadlift, Bench, Squat):

| Week | Set 1 | Set 2 | Set 3 (AMRAP) |
|---|---|---|---|
| 1 | 65% × 5 | 75% × 5 | 85% × 5+ |
| 2 | 70% × 3 | 80% × 3 | 90% × 3+ |
| 3 | 75% × 5 | 85% × 3 | 95% × 1+ |
| 4 (deload) | 40% × 5 | 50% × 5 | 60% × 5 |

The default supplemental template is FSL (First Set Last): 5 × 5 at the first working set weight after every non-deload session (65% / 70% / 75% TM for weeks 1 / 2 / 3). Alternative templates (SSL, BBB, BBS, None) are configurable per lift in Settings.

Warmup sets follow Wendler's prescription — 3 sets calculated from TM, not working weight:

| Set | Weight | Reps |
|---|---|---|
| 1 | 40% TM | 5 |
| 2 | 50% TM | 5 |
| 3 | 60% TM | 3 |

Any set at or above the first working weight is skipped. Weights below 45 lb are floored to bar weight. Consecutive sets that round to the same weight are deduplicated.

TM progression after each deload: +5 lb upper body, +10 lb lower body.

## Deployment

Pushes to `main` deploy automatically to Cloudflare Pages via `.github/workflows/deploy.yml`.
