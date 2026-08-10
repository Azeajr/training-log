#!/usr/bin/env node
/**
 * Headless verification of the SW-hardening legs A-E recorded in
 * docs/verification/2026-08-09-swe-hardening.md. Requires a production build
 * (dist/) - run `pnpm build` first, then:
 *
 *   node scripts/verify-notify-hardening.js
 *
 * Drives the REAL app in Chromium headless against `vite preview`:
 *   A. offline hard reload at / and /workout renders the shell
 *   C. visible tab + SW control: page silent, exactly one SW notification
 *   E. reload mid-rest fires the past-due nudge exactly once (SW)
 *   B. hidden tab: page ALSO fires (page + SW, tag-coalesced to one OS item)
 *   D. SW dead + hidden tab: page timer still fires
 *
 * Each leg runs in a FRESH browser context (fresh OPFS + storage + SW), so no
 * production DB reset hook is required (that hook is DEV-only). Rest state is
 * injected via localStorage before a reload.
 */

import { chromium } from 'playwright'
import { spawn } from 'child_process'

const BASE = 'http://localhost:5175'
const PORT = 5175
const REST_MS = 90_000 // normal-rest threshold used by scheduleRest

const results = []

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { await fetch(url); return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`preview server did not come up at ${url}`)
}

async function spawnPreview() {
  const p = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  })
  await waitForServer(`${BASE}/`)
  return p
}

// ─── app flow helpers ────────────────────────────────────────────────────────

async function fillStepper(page, testId, value) {
  await page.getByTestId(testId).click()
  const input = page.getByTestId('stepper-input')
  await input.fill(String(value))
  await input.press('Enter')
}

async function completeSetupWizard(page) {
  const names = ['ohp', 'deadlift', 'bench', 'squat']
  const tms = [95, 95, 135, 135]
  await page.getByRole('button', { name: 'NEXT' }).click() // step 1
  for (let i = 0; i < names.length; i++) await fillStepper(page, `stepper-tm-${names[i]}`, tms[i])
  await page.getByRole('button', { name: 'NEXT' }).click() // step 2
  await page.getByRole('button', { name: 'START TRAINING' }).click() // step 3
}

async function enableRestNotifications(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle', timeout: 10_000 })
  await page.getByText('REST NOTIFICATIONS').first().waitFor({ timeout: 10_000 })
  const row = page.getByText('REST NOTIFICATIONS').locator('..')
  await row.getByRole('button', { name: 'OFF' }).click({ timeout: 10_000 })
  await row.getByRole('button', { name: 'ON' }).waitFor({ timeout: 10_000 })
  await page.reload({ waitUntil: 'networkidle', timeout: 10_000 }) // persisted (DB), not in-memory
  await page.getByText('REST NOTIFICATIONS').first().locator('..').getByRole('button', { name: 'ON' }).waitFor({ timeout: 10_000 })
}

async function waitForSwControl(page) {
  for (let i = 0; i < 20; i++) {
    const ok = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller))
    if (ok) return
    await page.waitForTimeout(250)
  }
  throw new Error('service worker never controlled the page')
}

/** Seed a resting session whose nudge is due at startedAt + REST_MS. */
async function injectRest(page, startedAt = Date.now() - REST_MS - 10_000) {
  await page.evaluate(({ startedAt, rest }) => {
    const state = {
      activeSession: {
        cycleId: 1, liftId: 1, week: 1,
        date: new Date(Date.now() - 3600_000).toISOString(),
        notes: null, status: 'pending',
      },
      loggedSets: [], loggedCrossSets: [], currentSetIndex: 0,
      isResting: true, restStartedAt: startedAt, restType: rest,
      activeAccessories: [], notes: '',
    }
    localStorage.setItem('workout-store', JSON.stringify({ v: 1, state }))
  }, { startedAt, rest: 'normal' })
}

async function countNotifs(page, swWorker) {
  const sw = swWorker ? await swWorker.evaluate(() => (self.__swNotifs ?? []).length).catch(() => 0) : 0
  const p = await page.evaluate(() => (window.__pageNotifs ?? []).length)
  return { sw, page: p }
}

/** Attach to the SW and stub showNotification so its fires are countable. */
async function stubSwWorker(context) {
  let worker = null
  for (let i = 0; i < 20 && !worker; i++) {
    const workers = await context.serviceWorkers()
    if (workers.length) worker = workers[0]
    else await new Promise((r) => setTimeout(r, 250))
  }
  if (!worker) throw new Error('no service worker attached for stubbing')
  await worker.evaluate(() => {
    self.__swNotifs = []
    const reg = self.registration
    reg.showNotification = (title, opts) => {
      self.__swNotifs.push({ title, opts })
      return Promise.resolve()
    }
  })
  return worker
}

async function hidePage(page, hidden) {
  // CDP page-visibility emulation isn't exposed in this Chromium build;
  // stub document.hidden (own data property shadows the prototype getter).
  await page.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  }, hidden)
}

/** Brand-new context: wizard, notifications ON, SW installed + controlling. */
async function freshContext(browser) {
  const context = await browser.newContext()
  await context.grantPermissions(['notifications'], { origin: BASE })
  // Count page-constructed notifications (SW-constructed ones are invisible to
  // page globals - counted separately via getNotifications()).
  await context.addInitScript(() => {
    const Ctor = window.Notification
    if (typeof Ctor === 'undefined') return
    window.__pageNotifs = []
    window.Notification = class extends Ctor {
      constructor(title, opts) { window.__pageNotifs.push({ title, opts }); super(title, opts) }
    }
    // Headless Chromium hard-denies notification permission and never persists
    // a requestPermission result. The app's own guards read this — stub it so
    // the fire paths are exercised; OS delivery itself is out of scope.
    Object.defineProperty(window.Notification, 'permission', {
      get: () => 'granted', configurable: true,
    })
  })
  const page = await context.newPage()
  await page.goto(`${BASE}/`)
  await completeSetupWizard(page)
  // START TRAINING persists cycles async; wait until the shell settles on
  // /today (re-navigating mid-write re-shows the wizard).
  await page.waitForURL('**/today', { timeout: 15_000 })
  await page.getByText('HISTORY').first().waitFor({ timeout: 15_000 })
  await enableRestNotifications(page)
  await page.goto(`${BASE}/workout`)
  await waitForSwControl(page)
  const swWorker = await stubSwWorker(context)
  return { context, page, swWorker }
}

// ─── legs ────────────────────────────────────────────────────────────────────

async function leg(name, fn) {
  const start = Date.now()
  try {
    await fn()
    results.push({ name, pass: true, ms: Date.now() - start })
  } catch (err) {
    results.push({ name, pass: false, ms: Date.now() - start, error: String(err).split('\n')[0] })
  }
}

async function main() {
  // Hard cap so a broken leg can never hang the harness.
  setTimeout(() => { console.error('watchdog: 200s cap hit, forcing exit'); process.exit(3) }, 200_000)
  const browser = await chromium.launch()
  const preview = await spawnPreview()
  try {
    await leg('A: offline reload renders shell (/ and /workout)', async () => {
      const { context, page } = await freshContext(browser)
      await context.setOffline(true)
      await page.goto(`${BASE}/`)
      await page.getByText('HISTORY').first().waitFor({ timeout: 10_000 })
      await page.reload()
      await page.getByText('HISTORY').first().waitFor({ timeout: 10_000 })
      await context.setOffline(false)
    })

    await leg('C: visible tab - page silent, SW fires once', async () => {
      const { page, swWorker } = await freshContext(browser)
      await injectRest(page) // past-due: fires immediately on boot
      await page.reload()
      await waitForSwControl(page)
      await page.waitForTimeout(700)
      const c = await countNotifs(page, swWorker)
      if (c.page !== 0) throw new Error(`page fired ${c.page}, expected 0`)
      if (c.sw !== 1) throw new Error(`SW fired ${c.sw}, expected 1`)
    })

    await leg('E: reload mid-rest - past-due nudge fires once', async () => {
      const { page, swWorker } = await freshContext(browser)
      await injectRest(page)
      await page.reload()
      await waitForSwControl(page)
      await page.waitForTimeout(700)
      const c = await countNotifs(page, swWorker)
      if (c.page !== 0 || c.sw !== 1) throw new Error(`page=${c.page} sw=${c.sw}, expected 0/1`)
    })

    await leg('B: hidden tab - page fires alongside SW', async () => {
      const { page, swWorker } = await freshContext(browser)
      await injectRest(page, Date.now() - REST_MS + 1_500) // 1.5s before fire
      await page.reload()
      await hidePage(page, true) // win the race: fire is 1.5s out
      await page.waitForTimeout(2_500)
      const c = await countNotifs(page, swWorker)
      if (c.page !== 1) throw new Error(`page fired ${c.page}, expected 1`)
      if (c.sw !== 1) throw new Error(`SW fired ${c.sw}, expected 1`)
    })

    await leg('D: SW gone + hidden tab - page timer still fires', async () => {
      const { page, swWorker } = await freshContext(browser)
      await page.evaluate(async () => {
        const regs = await navigator.serviceWorker.getRegistrations()
        for (const r of regs) await r.unregister()
      })
      await injectRest(page, Date.now() - REST_MS + 1_500)
      await page.reload()
      await hidePage(page, true)
      await page.waitForTimeout(2_500)
      const c = await countNotifs(page, swWorker)
      if (c.page !== 1) throw new Error(`page fired ${c.page}, expected 1`)
      if (c.sw !== 0) throw new Error(`SW fired ${c.sw}, expected 0`)
    })
  } finally {
    await browser.close()
    preview?.kill()
  }

  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms}ms)${r.error ? '  - ' + r.error : ''}`)
  }
  if (results.some((r) => !r.pass)) {
    console.error('\nhardening legs FAILED')
    process.exit(1)
  }
  console.log('\nall hardening legs PASS')
}

main().catch((err) => { console.error(err); process.exit(1) })