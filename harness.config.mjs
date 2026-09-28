// Agent harness adapter (https://github.com/Azeajr/web-harness). What the shared controller,
// Playwright fixture, production smoke and CI need to know about THIS app. Functions marked
// SERIALIZED are shipped as source text into the browser tooling: they may not close over
// anything in this file.
import { defineHarness } from '@azeajr/web-harness/config'

// SERIALIZED. The startup screen is index.html's LOADING… placeholder, replaced once SQLite is
// open and the app has mounted (or a startup error has).
const ready = async (page) => {
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root')
      return Boolean(root?.firstElementChild) && !root.textContent?.includes('LOADING…')
    },
    null,
    { timeout: 30_000 },
  )
}

// Node side. The wizard's defaults are fine for every fixture that only needs "set up".
const completeSetup = async (page) => {
  await page.getByRole('button', { name: 'NEXT' }).click()
  await page.getByRole('button', { name: 'START TRAINING' }).click()
  await page.getByText('WEEK 1').waitFor({ timeout: 15_000 })
}

export default defineHarness({
  name: 'training-log',
  // E2E owns 5175; sessions default elsewhere so both can run at once.
  port: 5185,
  // The phone this app is actually used on.
  defaults: { browser: 'webkit', device: 'iPhone 13 Mini' },
  dev: {
    command: (port) => ['pnpm', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    marker: '/src/main.tsx',
  },
  production: {
    build: (outDir) => ['pnpm', 'exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir'],
  },
  ready,
  fixtures: {
    fresh: { description: 'First launch: the setup wizard, empty database' },
    configured: {
      description: 'Setup completed with default training maxes; Today screen, week 1',
      // SERIALIZED
      apply: async (page) => {
        await page.getByRole('button', { name: 'NEXT' }).click()
        await page.getByRole('button', { name: 'START TRAINING' }).click()
        await page.getByText('WEEK 1').waitFor({ timeout: 15_000 })
        return { week: 1 }
      },
    },
  },
  defaultFixture: 'configured',
  state: {
    sections: ['session', 'cycle', 'pt', 'settings', 'counts'],
    defaults: ['session', 'cycle', 'counts'],
    // SERIALIZED, runs in the page. src/dev/harness.ts installs the accessor in dev builds only,
    // through a dynamic import, so it can land a moment after first paint.
    read: async (sections) => {
      for (let i = 0; i < 50 && !window.__harness; i++) await new Promise((r) => setTimeout(r, 100))
      if (!window.__harness) throw new Error('Development state accessor unavailable.')
      return window.__harness.snapshot(sections)
    },
  },
  smoke: {
    requiredHeaders: [
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'referrer-policy',
      'cross-origin-opener-policy',
    ],
    ready,
    persist: async (page) => {
      await completeSetup(page)
      return 'WEEK 1'
    },
    // Setup lives in OPFS SQLite: surviving a reload (and an offline reload) means the wizard
    // stays gone and the cycle is still there.
    verify: async (page, text) => {
      await page.getByText(text).waitFor({ timeout: 15_000 })
      if (await page.getByRole('button', { name: 'START TRAINING' }).isVisible())
        throw new Error('Setup did not persist: the wizard is back.')
    },
    // The update phase publishes a second version by changing the worker script's bytes; ours is
    // the injectManifest build of src/service-worker.ts, not the default sw.js.
    update: { sw: 'service-worker.js' },
  },
  e2e: { config: 'playwright.config.ts', snapshots: ['tests/e2e'] },
  // Critical journeys and what proves each (`pnpm harness scenarios`; CI checks the mapping, and
  // with the E2E JSON report, that every mapped test ran and passed). A gap is listed as a gap.
  scenarios: [
    {
      id: 'first-run-setup',
      title: 'Fresh install walks the wizard and lands on week 1',
      covers: [
        { file: 'tests/e2e/app.spec.ts', test: 'shows setup wizard on fresh DB' },
        { file: 'tests/e2e/app.spec.ts', test: 'after setup lands on Today with WEEK 1' },
      ],
    },
    {
      id: 'log-and-rest',
      title: 'Logging a set starts the rest timer; skipping ends it',
      covers: [
        { file: 'tests/e2e/workout.spec.ts', test: 'logging a set starts the rest timer' },
        { file: 'tests/e2e/workout.spec.ts', test: 'SKIP REST dismisses the timer' },
      ],
    },
    {
      id: 'session-survives-reload',
      title: 'An in-progress session and its rest timer survive a reload',
      covers: [
        { file: 'tests/e2e/workout.spec.ts', test: 'logged sets are still shown after reload' },
        { file: 'tests/e2e/workout.spec.ts', test: 'rest timer is still running after reload' },
      ],
    },
    {
      id: 'resume-or-abandon',
      title: 'Starting another lift mid-session asks first; the same lift resumes',
      covers: [
        { file: 'tests/e2e/workout.spec.ts', test: 'starting a different lift shows abandon confirm dialog' },
        { file: 'tests/e2e/workout.spec.ts', test: 'START WORKOUT for the same lift resumes without wiping logged sets' },
      ],
    },
    {
      id: 'jokers',
      title: 'A qualifying AMRAP offers an escalating joker set',
      covers: [
        { file: 'tests/e2e/workout.spec.ts', test: 'joker button appears after AMRAP logged at minimum reps (week 1 = 5)' },
        { file: 'tests/e2e/workout.spec.ts', test: 'second joker button shows escalated weight — 85lb joker → 90lb next' },
      ],
    },
    {
      id: 'pt-run',
      title: 'A PT routine runs set by set and records only on finish',
      covers: [
        { file: 'tests/e2e/pt.spec.ts', test: 'builds a routine, runs it, and records the run' },
        { file: 'tests/e2e/pt.spec.ts', test: 'discards a run without recording it' },
      ],
    },
    {
      id: 'band-loading',
      title: 'Band-assisted load survives reload on a phone',
      covers: [{ file: 'tests/e2e/bands.spec.ts', test: 'main-lift bands survive reload and raw-load recalibration on mobile' }],
    },
    {
      id: 'phone-layout',
      title: 'Workout headers stay whole at 375px',
      covers: [{ file: 'tests/e2e/narrow.spec.ts', test: 'long lift names keep workout headers whole on a 375px phone' }],
    },
    {
      id: 'offline-install',
      title: 'The shipped build installs, persists and reloads offline',
      covers: [{ lane: 'smoke' }, { lane: 'verify-sw' }],
    },
    {
      id: 'finish-session',
      title: 'Finishing a session records it in History and advances the week',
      status: 'not-run',
      reason: 'No E2E finishes a session yet; Workout.test.tsx covers it in-process only.',
    },
    {
      id: 'locked-phone-rest-alert',
      title: 'Rest alert while the iPhone is locked',
      status: 'unsupported',
      reason: 'A locked iPhone freezes page timers; no emulator reproduces it. Real device only.',
    },
  ],
})
