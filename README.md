# Training Log

A progressive strength training tracker built for the **5/3/1 program**. Designed as a mobile-first PWA for use at the gym.

**Live app:** https://531-log.pages.dev

## Features

- **5/3/1 program logic** — calculates warmup, main, and supplemental sets from your training max each week; warmup follows Wendler's 40/50/60% TM prescription (3 sets × 5/5/3 reps)
- **AMRAP tracking** — logs the third main set as AMRAP; detects rep PRs (more reps at the same weight) and e1RM PRs (higher Wathan estimated 1RM than any prior AMRAP) and shows a toast; shows a rep target derived from recent performance
- **Joker sets** — unlock extra sets after a strong AMRAP; weight increment scales with performance
- **Supplemental template** — global selector in Settings (defaults to FSL+BBB): FSL (5×5 at the first working weight), SSL (5×5 at the second), BBB (5×10 at 50% TM), FSL+BBB (5×10 at the first set weight), SSL+BBB (5×10 at the second set weight), BBS (10×5 at 60/70/80% TM), or None
- **Cross-lift supplemental** — optional per-training-day blocks that run volume sets of *another* main lift's movement, loaded at that lift's FSL weight or a straight percentage of its TM
- **Assistance work** — three slots per session (push / pull / legs+core) with a per-lift default that follows your last pick; log reps, weight, duration, or distance, plus a free-text note per exercise; per-exercise TM progression rate
- **Equipment-aware plate math** — each lift and accessory is `none` / `paired` / `total` with its own implement base weight, so straight bars, hex bars, belt squats, and dip belts all read correctly
- **Rest timer** — in-session countdown with audio and vibration cues; Screen Wake Lock keeps the display active; separate durations for normal, transition, and failed sets
- **Configurable cycle shape** — 3-week (no deload) or 4-week (deload) cycles; on a deload week, supplemental volume can be skipped, run at deload percentages, or run at week-1 percentages. TMs progress and the next cycle opens automatically at the end; manual week override and SKIP DELOAD in Settings; the cycle-complete modal shows old → new TM per lift
- **History** — browse completed sessions by lift, by date, or on a calendar heatmap; editable after the fact; estimated-1RM history charted alongside TM
- **Stats** — best estimated 1RM and heaviest actual lift per lift, plus training-max progression
- **Theming** — 11 themes (OLED, OLED Light, Rosé Pine, Frappé, Macchiato, Mocha, Latte, Solarized, Gruvbox, Nord, Dracula) driven by 14 CSS-variable tokens
- **Export / Import** — full JSON or CSV backup and restore
- **PWA** — installable, works offline

## Stack

| Layer | Library |
|---|---|
| UI | SolidJS 1.9, TypeScript 6, Tailwind CSS 4 |
| Routing | @solidjs/router 0.16 |
| State | SolidJS stores |
| Database | SQLite Wasm (dedicated Web Worker + OPFS) |
| Charts | Custom SVG |
| Build | Vite 8 + vite-plugin-pwa |
| Tests | Vitest 4 + @solidjs/testing-library + Playwright 1 |
| Mutation | Stryker 9 + @stryker-mutator/vitest-runner |

## Getting Started

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` and enter your training maxes to begin.

## Running Tests

```bash
pnpm test             # unit + component integration (Vitest)
pnpm test:e2e         # end-to-end (Playwright)
pnpm test:coverage    # coverage report (v8)
pnpm test:mutation    # mutation score (Stryker)
```

**Arch Linux**: Playwright's bundled Chromium requires system libs not installed by default:

```bash
sudo pacman -S atk at-spi2-atk libxcomposite libxdamage libxfixes libxrandr alsa-lib nss cups
```

Tests are split into three layers:

| Layer | Location | Tools |
|---|---|---|
| Unit | `src/lib/*.test.ts`, `src/store/*.test.ts`, `src/db/*.test.ts` | Vitest + in-process `@sqlite.org/sqlite-wasm` |
| Component integration | `src/screens/*.test.tsx`, `src/components/**/*.test.tsx` | Vitest + @solidjs/testing-library + jsdom |
| End-to-end | `tests/e2e/*.spec.ts` | Playwright |

Component integration tests render the full component tree and interact through the DOM. Every screen exercises the full stack: UI event → SolidJS store → in-process SQLite (no Worker, no OPFS) → rendered output. The vitest alias `/sqlite-client$/` swaps the production worker-based client for the in-process one, which shares the rest of the query layer. No DB layer is mocked.

Coverage gate: ≥80% line, branch, function, and statement across `src/lib`, `src/screens`, `src/store`.
Mutation testing runs over `src/lib`; the Stryker run fails below a 40% score, with 80% as the target.

## Program Structure

A cycle runs across every active lift, either three weeks or four (a deload week, on by default — toggle in Settings):

| Week | Set 1 | Set 2 | Set 3 (AMRAP) |
|---|---|---|---|
| 1 | 65% × 5 | 75% × 5 | 85% × 5+ |
| 2 | 70% × 3 | 80% × 3 | 90% × 3+ |
| 3 | 75% × 5 | 85% × 3 | 95% × 1+ |
| 4 (deload, optional) | 40% × 5 | 50% × 5 | 60% × 5 |

The deload week has no AMRAP and no joker sets, and BBS is hidden.

The default supplemental template is FSL+BBB: 5 × 10 at the first working set weight (FSL's weight, BBB's volume). Alternatives (FSL, SSL, SSL+BBB, BBB, BBS, None) are selectable in Settings; the choice is global across lifts.

Warmup sets follow Wendler's prescription — 3 sets calculated from TM, not working weight:

| Set | Weight | Reps |
|---|---|---|
| 1 | 40% TM | 5 |
| 2 | 50% TM | 5 |
| 3 | 60% TM | 3 |

Any set at or above the first working weight is dropped. Weights below the bar weight are floored to it. Consecutive sets that round to the same weight are deduplicated.

TM progression at the end of each cycle is per-lift (`progressionIncrement`, seeded at +5 lb upper body / +10 lb lower). A strong AMRAP can prompt a mid-cycle TM bump, and a cycle where every working week cleared the threshold offers a one-time doubled increment.

## Deployment

Pushes to `main` deploy automatically to Cloudflare Pages via `.github/workflows/deploy.yml`. The workflow is path-filtered to source and config changes, and does not run the test suite — tests are a local gate.
