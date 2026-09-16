#!/usr/bin/env node
/**
 * Headless browser debug script.
 *
 * What it does:
 *   1. Launches Chromium via Playwright (uses the bundled browser, no separate install needed)
 *   2. Captures every JS page error and console.error call
 *   3. Walks through the setup wizard automatically
 *   4. Prints the visible page text and any captured errors
 *   5. Saves a screenshot to scripts/screenshot.png
 *
 * Every run IS a first run, and nothing here has to make it one: each launch
 * gets a fresh `browser.newContext()`, which is incognito-alike, so OPFS and
 * localStorage both start empty. That is why the setup wizard walk below always
 * has a wizard to walk.
 *
 * This used to open with "optionally wipes IndexedDB so you get a true
 * first-run experience", and did `indexedDB.deleteDatabase('TrainingLog')` to
 * deliver it. The app has used no IndexedDB since the SQLite migration —
 * persistence is OPFS plus localStorage — so that call resolved successfully
 * and silently against a database that never existed. The `--no-wipe` flag it
 * advertised changed nothing either way. The step is gone rather than fixed:
 * an ephemeral context already provides what it claimed to (F80).
 *
 * Usage:
 *   node scripts/debug-browser.js
 *
 * Prerequisites:
 *   - Dev server running:  pnpm dev
 *   - Playwright installed: pnpm add -D playwright  (already in devDependencies)
 *   - Browser downloaded:  pnpm exec playwright install chromium
 */

import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_PATH = path.join(__dirname, 'screenshot.png')

// Resolve the Chromium executable: try the Playwright default first, then
// fall back to a broader search under common PLAYWRIGHT_BROWSERS_PATH roots.
function resolveChromium() {
  const defaultPath = chromium.executablePath()
  if (existsSync(defaultPath)) return defaultPath

  // Common alternate locations (CI, containers, /tmp installs)
  const searchRoots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/tmp/pw-browsers',
    path.join(process.env.HOME ?? '', '.cache', 'ms-playwright'),
  ].filter(Boolean)

  for (const root of searchRoots) {
    try {
      const found = execSync(`find "${root}" -name chrome -type f 2>/dev/null | head -1`, { encoding: 'utf8' }).trim()
      if (found && existsSync(found)) return found
    } catch { /* ignore */ }
  }

  throw new Error(
    'Chromium not found. Run: npx playwright install chromium\n' +
    `(searched: ${searchRoots.join(', ')})`
  )
}

async function waitForText(page, text, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const body = await page.evaluate(() => document.body.innerText)
    if (body.includes(text)) return true
    await page.waitForTimeout(200)
  }
  return false
}

async function runSetupWizard(page) {
  // Step 1 — MAIN LIFTS (defaults pre-populated): just advance.
  if (!await waitForText(page, 'STEP 1')) return
  console.log('  [setup] Step 1 — main lifts (defaults) → NEXT')
  await page.click('button:has-text("NEXT")')
  await page.waitForTimeout(600)

  // Step 2 — TRAINING MAXES: fill one number input per lift.
  if (!await waitForText(page, 'STEP 2')) return
  console.log('  [setup] Step 2 — filling training maxes')
  const inputs = await page.locator('input[type=number]').all()
  // Realistic defaults: OHP/Bench 95 lb, Squat/Deadlift 135 lb
  const defaults = [95, 95, 135, 135]
  for (let i = 0; i < inputs.length; i++) {
    await inputs[i].fill(String(defaults[i] ?? 100))
  }
  // Step 2 carries START TRAINING itself — the old read-only confirm step is gone.
  console.log('  [setup] Step 2 — START TRAINING')
  await page.click('button:has-text("START TRAINING")')
  await page.waitForTimeout(1500)
}

const browser = await chromium.launch({ executablePath: resolveChromium() })
const context = await browser.newContext()

// ── 1. Open the app and wire up error listeners ───────────────────────────
const page = await context.newPage()

const pageErrors = []
const consoleErrors = []

// JS exceptions thrown in the page (uncaught errors, React errors, Dexie errors, etc.)
page.on('pageerror', err => {
  pageErrors.push(err.message)
  console.error('[pageerror]', err.message)
})

// console.error() calls inside the app (React warnings, custom logging, etc.)
page.on('console', msg => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text())
    console.error('[console.error]', msg.text())
  }
})

console.log(`[debug] navigating to ${BASE_URL} ...`)
await page.goto(BASE_URL)
await page.waitForTimeout(1500)

// ── 2. Walk through setup wizard if present ───────────────────────────────
const bodyText = await page.evaluate(() => document.body.innerText)
if (bodyText.includes('STEP 1')) {
  console.log('[debug] setup wizard detected — running through it...')
  await runSetupWizard(page)
}

// ── 3. Wait for the app to settle, then capture state ────────────────────
await page.waitForTimeout(1500)
const finalText = await page.evaluate(() => document.body.innerText)

// ── 4. Screenshot ─────────────────────────────────────────────────────────
await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })
console.log(`[debug] screenshot saved → ${SCREENSHOT_PATH}`)

// ── 5. Report ─────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════')
console.log('PAGE ERRORS  :', pageErrors.length ? pageErrors : '(none)')
console.log('CONSOLE ERRS :', consoleErrors.length ? consoleErrors : '(none)')
console.log('──────────────────────────────────────────')
console.log('VISIBLE TEXT :\n', finalText.slice(0, 600))
console.log('══════════════════════════════════════════')

await browser.close()
process.exit(pageErrors.length > 0 ? 1 : 0)
