# Training Log

A progressive strength training tracker built for the **5/3/1 program**. Designed as a mobile-first PWA for use at the gym.

**Live app:** https://training-log.pages.dev  
**Demo (pre-seeded data):** https://training-log-demo.pages.dev

## Features

- **5/3/1 program logic** — calculates warmup, main, and FSL sets from your training max each week
- **AMRAP tracking** — logs rep PRs on the third main set and shows targets based on prior performance
- **Accessory work** — select assistance exercises per lift, log reps/weight/duration/distance
- **Rest timer** — in-session countdown with audio and vibration cues; different durations for normal, transition, and failed sets
- **4-week cycles** — auto-advances week and applies TM progression after each deload
- **History** — view completed sessions by lift or date, TM progression chart, editable after the fact
- **Export / Import** — full JSON or CSV backup and restore
- **PWA** — installable, works offline

## Stack

| Layer | Library |
|---|---|
| UI | SolidJS 1.9, TypeScript, Tailwind CSS 4 |
| Routing | @solidjs/router 0.16 |
| State | SolidJS stores |
| Database | SQLite Wasm (Worker-based) |
| Charts | Custom SVG |
| Build | Vite + vite-plugin-pwa |
| Tests | Vitest + @solidjs/testing-library |

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and enter your training maxes to begin.

## Running Tests

```bash
npm test
```

Tests are split into two layers:

| Layer | Location | Tools |
|---|---|---|
| Unit | `src/lib/*.test.ts`, `src/store/*.test.ts` | Vitest |
| Component integration | `src-solid/screens/*.test.tsx`, `src-solid/components/*.test.tsx` | Vitest + @solidjs/testing-library + jsdom |

Component integration tests render the full component tree and interact through `userEvent`. Every screen exercises the full stack: UI event → SolidJS store → SQLite → rendered output. No DB layer is mocked — tests run against `fake-indexeddb` through the real SQLite Wasm layer.

## Program Structure

Each cycle is 4 weeks across 4 lifts (OHP, Deadlift, Bench, Squat):

| Week | Set 1 | Set 2 | Set 3 (AMRAP) |
|---|---|---|---|
| 1 | 65% × 5 | 75% × 5 | 85% × 5+ |
| 2 | 70% × 3 | 80% × 3 | 90% × 3+ |
| 3 | 75% × 5 | 85% × 3 | 95% × 1+ |
| 4 (deload) | 40% × 5 | 50% × 5 | 60% × 5 |

FSL (First Set Last) is 5 × 10 at the first working set weight after every non-deload session (65% / 70% / 75% TM for weeks 1 / 2 / 3).

TM progression after each deload: +5 lb upper body, +10 lb lower body.

## Demo Deployment

The demo at `training-log-demo.pages.dev` is built with `VITE_DEMO=true`. On first visit to an empty database it fetches `/demo-seed.json` and seeds ~2.5 cycles of pre-filled data so you can explore history, charts, and editing without entering your own numbers. Your data in the production app is completely separate — the demo flag is baked into the build, not a URL parameter, so it can never affect a production deployment.

Both deployments run as parallel jobs in `.github/workflows/deploy.yml` on every push to `main`.
