# Training Log

A progressive strength training tracker built for the **5/3/1 program**. Designed as a mobile-first PWA for use at the gym.

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
| UI | React 19, TypeScript, Tailwind CSS 4 |
| Routing | React Router v7 |
| State | Zustand 5 |
| Database | Dexie (IndexedDB) 4 |
| Charts | Recharts 3 |
| Build | Vite + vite-plugin-pwa |
| Tests | Vitest |

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
| Component integration | `src/screens/*.test.tsx`, `src/components/*.test.tsx` | Vitest + RTL + jsdom |

Component integration tests render the full component tree and interact through `userEvent`. The goal is to replace all DB mocks with `fake-indexeddb` so tests exercise the real Dexie layer. See [ROADMAP.md](ROADMAP.md) for current coverage status.

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
