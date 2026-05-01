#!/usr/bin/env node
/**
 * Headless browser debug script.
 *
 * What it does:
 *   1. Launches Chromium via Playwright (uses the bundled browser, no separate install needed)
 *   2. Optionally wipes IndexedDB so you get a true first-run experience
 *   3. Captures every JS page error and console.error call
 *   4. Walks through the setup wizard automatically
 *   5. Prints the visible page text and any captured errors
 *   6. Saves a screenshot to scripts/screenshot.png
 *
 * Usage:
 *   node scripts/debug-browser.js           # fresh run (clears DB)
 *   node scripts/debug-browser.js --no-wipe # keep existing DB state
 *
 * Prerequisites:
 *   - Dev server running:  npm run dev
 *   - Playwright installed: npm install -D playwright  (already in devDependencies)
 *   - Browser downloaded:  npx playwright install chromium
 */

import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = 'http://localhost:5173'
const SCREENSHOT_PATH = path.join(__dirname, 'screenshot.png')
const WIPE_DB = !process.argv.includes('--no-wipe')

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
  // Step 1 — enter training maxes
  const onStep1 = await waitForText(page, 'STEP 1')
  if (!onStep1) return

  console.log('  [setup] filling Step 1 — training maxes')
  const inputs = await page.locator('input[type=number]').all()
  // Use realistic defaults: OHP/Bench 95 lb, Squat/Deadlift 135 lb
  const defaults = [95, 95, 135, 135]
  for (let i = 0; i < inputs.length; i++) {
    await inputs[i].fill(String(defaults[i] ?? 100))
  }
  await page.click('button:has-text("NEXT")')
  await page.waitForTimeout(800)

  // Step 2 — confirm
  const onStep2 = await waitForText(page, 'STEP 2')
  if (!onStep2) return

  console.log('  [setup] confirming Step 2 — START TRAINING')
  await page.click('button:has-text("START TRAINING")')
  await page.waitForTimeout(1500)
}

const browser = await chromium.launch({ executablePath: resolveChromium() })
const context = await browser.newContext()

// ── 1. Wipe IndexedDB for a clean first-run ──────────────────────────────
if (WIPE_DB) {
  console.log('[debug] wiping IndexedDB (TrainingLog)...')
  const wipePage = await context.newPage()
  await wipePage.goto(BASE_URL)
  await wipePage.waitForTimeout(800)
  await wipePage.evaluate(() => indexedDB.deleteDatabase('TrainingLog'))
  await wipePage.close()
  console.log('[debug] DB wiped.')
} else {
  console.log('[debug] --no-wipe: keeping existing DB state')
}

// ── 2. Open the app and wire up error listeners ───────────────────────────
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

// ── 3. Walk through setup wizard if present ───────────────────────────────
const bodyText = await page.evaluate(() => document.body.innerText)
if (bodyText.includes('STEP 1')) {
  console.log('[debug] setup wizard detected — running through it...')
  await runSetupWizard(page)
}

// ── 4. Wait for the app to settle, then capture state ────────────────────
await page.waitForTimeout(1500)
const finalText = await page.evaluate(() => document.body.innerText)

// ── 5. Screenshot ─────────────────────────────────────────────────────────
await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true })
console.log(`[debug] screenshot saved → ${SCREENSHOT_PATH}`)

// ── 6. Report ─────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════')
console.log('PAGE ERRORS  :', pageErrors.length ? pageErrors : '(none)')
console.log('CONSOLE ERRS :', consoleErrors.length ? consoleErrors : '(none)')
console.log('──────────────────────────────────────────')
console.log('VISIBLE TEXT :\n', finalText.slice(0, 600))
console.log('══════════════════════════════════════════')

await browser.close()
process.exit(pageErrors.length > 0 ? 1 : 0)
