#!/usr/bin/env node
/**
 * Headless verification of the service worker, notifications and diagnostic trace.
 * Requires a production build
 * (dist/) - run `pnpm build` first, then:
 *
 *   node scripts/verify-notify-hardening.js
 *
 * Drives the REAL app in Chromium headless against the harness static server
 * (`web-harness serve`: public/_headers applied as real headers, like Pages):
 *   A. offline hard reload at / and /workout renders the shell
 *   C. visible tab + SW control: page fires too (F107) - page 1, SW 1
 *   E. reload mid-rest fires the past-due nudge exactly once (SW)
 *   B. hidden tab: page ALSO fires (page + SW, tag-coalesced to one OS item)
 *   D. SW dead + hidden tab: page timer still fires
 *   H. diagnostic trace: the page sink records a real rest into localStorage
 *   F. a controlled navigation is answered from the precached shell, never the network
 *   G. a 502 never enters the cache-first precache
 *   I. after a deploy, a screen not yet opened still opens offline
 *   J. after a deploy whose SW failed to install, an offline launch still renders
 *   K. a deploy is found on resume, offered, and taking it lands on it
 *
 * I, J and K serve a second deploy synthesised from dist/ (see makeNextDeploy) on
 * their own port, so the SW update path is tested against this exact build.
 *
 * Each leg runs in a FRESH browser context (fresh OPFS + storage + SW), so no
 * production DB reset hook is required (that hook is DEV-only). Rest state is
 * injected via localStorage before a reload.
 */

import { cp, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'
import { createStaticServer } from '@azeajr/web-harness/static-server'

const BASE = 'http://127.0.0.1:5175'
const PORT = 5175
// Legs I, J and K swap the server under a live context, so they get their own
// origin rather than the one every other leg shares.
const DEPLOY_PORT = 5176
const DEPLOY_BASE = `http://127.0.0.1:${DEPLOY_PORT}`
const REST_MS = 90_000 // normal-rest threshold used by scheduleRest

const results = []

// In-process, not a child: killing a `pnpm exec` wrapper does not reach the
// server under it, so the old spawned preview outlived every run and held the
// port — the next run then either failed on it or, worse, tested it.
async function startServer() {
  return createStaticServer({ dir: 'dist', port: PORT })
}

// ─── app flow helpers ────────────────────────────────────────────────────────

/**
 * Setup is two steps: the lift roster, then the training maxes, which carries
 * START TRAINING itself. No leg depends on the TM values, so the defaults
 * (95/135/95/135) are accepted rather than dialled in — the steppers expose no
 * data-testid in a production build, and driving them by their `-`/`+` labels
 * would couple every leg to the wizard's layout for no gain.
 */
async function completeSetupWizard(page) {
  await page.getByRole('button', { name: 'NEXT' }).click() // roster -> training maxes
  await page.getByRole('button', { name: 'START TRAINING' }).click()
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

// The trace's page sink is localStorage, written synchronously. This leg drives
// it against a production build so the instrument itself is covered, rather than
// only the things it measures.
async function setTraceFlag(page) {
  await page.evaluate(() => { localStorage.setItem('notif-trace-on', '1') })
}

async function readPageTrace(page) {
  return page.evaluate(() => {
    try {
      const raw = localStorage.getItem('notif-trace')
      if (!raw) return []
      return (JSON.parse(raw).e ?? []).map((r) => r.ev)
    } catch {
      return []
    }
  })
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

// ─── deploy helpers (legs I, J, K) ───────────────────────────────────────────

/**
 * The next deploy of this same build: every file in assets/ renamed, as new
 * content hashes would, and every reference to it rewritten — index.html, the
 * chunks' dynamic imports, and the SW's injected precache list. That last one
 * changes the SW script's bytes, so the browser installs it as an update.
 *
 * The code itself is unchanged, deliberately. Anything these legs catch comes
 * from two deploys meeting, not from a change in the app.
 */
async function makeNextDeploy(from) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sw-next-deploy-'))
  await cp(from, dir, { recursive: true })
  const assets = path.join(dir, 'assets')
  const renames = new Map()
  for (const name of await readdir(assets)) {
    const ext = path.extname(name)
    renames.set(name, `${name.slice(0, -ext.length)}N${ext}`)
  }
  for (const [was, now] of renames) await rename(path.join(assets, was), path.join(assets, now))

  // Longest first, so no name can match inside a longer one.
  const escaped = [...renames.keys()]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(escaped.join('|'), 'g')
  const textFiles = [
    'index.html',
    'service-worker.js',
    ...[...renames.values()].filter((n) => /\.(js|css)$/.test(n)).map((n) => `assets/${n}`),
  ]
  for (const file of textFiles) {
    const full = path.join(dir, file)
    const text = await readFile(full, 'utf8')
    await writeFile(full, text.replace(pattern, (m) => renames.get(m)))
  }
  const renamed = (re) => {
    const hit = [...renames.values()].find((n) => re.test(n))
    if (!hit) throw new Error(`setup: no asset matches ${re}`)
    return `/assets/${hit}`
  }
  return { dir, renamed }
}

/** Fresh context on deploy 1: setup done, the SW installed and controlling. */
async function installDeployOne(browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`${DEPLOY_BASE}/`)
  await completeSetupWizard(page)
  await page.waitForURL('**/today', { timeout: 15_000 })
  await page.getByText('HISTORY').first().waitFor({ timeout: 15_000 })
  // Park the pointer. Hovering a nav link preloads its screen, and the cursor
  // was left wherever START TRAINING sat.
  await page.mouse.move(0, 0)
  // No clients.claim(): the page that installed the SW is not controlled by
  // it. The next real navigation is.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.goto(`${DEPLOY_BASE}/today`)
  await page.getByText('HISTORY').first().waitFor({ timeout: 15_000 })
  await waitForSwControl(page)
  return { context, page }
}

/** Ask for an update now, then wait for the install attempt to settle. */
async function settleUpdate(page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    await reg?.update().catch(() => {})
  })
  for (let i = 0; i < 60; i++) {
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return { installing: Boolean(reg?.installing), waiting: Boolean(reg?.waiting) }
    })
    if (!state.installing) return state
    await page.waitForTimeout(250)
  }
  throw new Error('setup: the update never finished installing')
}

/** Which main bundle the cached shell loads. */
const cachedShellBundle = (page) =>
  page.evaluate(async () => {
    const hit = await caches.match('/index.html')
    return hit ? ((await hit.text()).match(/assets\/index-[^"]+\.js/)?.[0] ?? null) : null
  })

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
  // Hard cap so a broken leg can never hang the harness. `unref` so the timer
  // does not itself keep the process alive once the legs are done — without it
  // a fully passing run still sat here for 200s and then exited 3.
  setTimeout(() => { console.error('watchdog: 200s cap hit, forcing exit'); process.exit(3) }, 200_000).unref()
  const next = await makeNextDeploy('dist')
  const browser = await chromium.launch()
  const server = await startServer()
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

    // The shell comes from the worker's own precache, not the network. It used
    // to be network-first, and a shell fetched from a newer deploy than the
    // worker serving it is what legs I and J catch. This holds the narrower
    // line: a controlled navigation never asks the network at all, so nothing
    // the network says (here, a 503) can reach the page or the cache.
    await leg('F: a navigation is answered from the precached shell, not the network', async () => {
      const { context, page } = await freshContext(browser)
      let asked = 0
      // Match on the path, not resourceType: the SW's own `fetch(req)` for a
      // navigation reaches Playwright as `fetch`, not `document`.
      const poison = async (route, request) => {
        if (new URL(request.url()).pathname === '/') {
          asked++
          await route.fulfill({
            status: 503,
            contentType: 'text/html',
            body: '<html><body>SERVICE UNAVAILABLE</body></html>',
          })
        } else {
          await route.continue()
        }
      }
      await context.route('**/*', poison)
      const res = await page.goto(`${BASE}/`)
      await context.unroute('**/*', poison)
      if (asked) throw new Error(`the SW asked the network for the shell (${asked}x, got ${res?.status()})`)
      if (res?.status() !== 200 || !res.fromServiceWorker()) {
        throw new Error(`navigation got ${res?.status()} (from SW: ${res?.fromServiceWorker()}), expected the cached 200`)
      }
      await page.getByText('HISTORY').first().waitFor({ timeout: 10_000 })
    })

    await leg('G: a 502 must not enter the cache-first precache', async () => {
      const { context, page } = await freshContext(browser)
      // `/manifest.webmanifest` is precached and carries no content hash, so it
      // is stable across builds. The precache branch is cache-first, so a bad
      // response stored here is never re-fetched — worse than the navigation
      // branch, where the next good navigation would heal it.
      const PATH = '/manifest.webmanifest'
      const cached = (p) =>
        page.evaluate(async (p) => {
          const name = (await caches.keys()).find((k) => k.startsWith('precache-'))
          const hit = name ? await (await caches.open(name)).match(p) : null
          return hit ? hit.status : null
        }, p)
      const evict = (p) =>
        page.evaluate(async (p) => {
          const name = (await caches.keys()).find((k) => k.startsWith('precache-'))
          if (name) await (await caches.open(name)).delete(p)
        }, p)

      await evict(PATH)
      if ((await cached(PATH)) !== null) throw new Error('setup: entry was not evicted')

      const bad = async (route, request) => {
        if (new URL(request.url()).pathname === PATH) {
          await route.fulfill({ status: 502, contentType: 'text/plain', body: 'BAD GATEWAY' })
        } else {
          await route.continue()
        }
      }
      await context.route('**/*', bad)
      const status = await page.evaluate(async (p) => (await fetch(p)).status, PATH)
      if (status !== 502) throw new Error(`setup: expected a 502, got ${status}`)
      await page.waitForTimeout(500)
      const poisoned = await cached(PATH)
      if (poisoned !== null) throw new Error(`502 was written to the precache (status ${poisoned})`)
      await context.unroute('**/*', bad)

      // Healthy again: the entry must now cache normally.
      const ok = await page.evaluate(async (p) => (await fetch(p)).status, PATH)
      if (ok !== 200) throw new Error(`recovery: expected a 200, got ${ok}`)
      await page.waitForTimeout(500)
      if ((await cached(PATH)) !== 200) throw new Error('a good response was not precached')
    })

    // F107: the page used to stay silent here, deferring to the SW. It cannot -
    // `controller` reports control, not aliveness, and the SW's timers die with
    // the worker. Both sides now fire; the shared tag coalesces them into one OS
    // item, and a replacement does not re-alert.
    await leg('C: visible tab - page fires alongside the SW (F107)', async () => {
      const { page, swWorker } = await freshContext(browser)
      await injectRest(page) // past-due: fires immediately on boot
      await page.reload()
      await waitForSwControl(page)
      await page.waitForTimeout(700)
      const c = await countNotifs(page, swWorker)
      if (c.page !== 1) throw new Error(`page fired ${c.page}, expected 1`)
      if (c.sw !== 1) throw new Error(`SW fired ${c.sw}, expected 1`)
    })

    await leg('E: reload mid-rest - past-due nudge fires once per path', async () => {
      const { page, swWorker } = await freshContext(browser)
      await injectRest(page)
      await page.reload()
      await waitForSwControl(page)
      await page.waitForTimeout(700)
      const c = await countNotifs(page, swWorker)
      if (c.page !== 1 || c.sw !== 1) throw new Error(`page=${c.page} sw=${c.sw}, expected 1/1`)
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
    await leg('H: diagnostic trace - the page sink records a real rest', async () => {
      const { page } = await freshContext(browser)
      await setTraceFlag(page)
      await injectRest(page)
      await page.reload()
      await waitForSwControl(page)
      await page.waitForTimeout(1_500)

      const events = await readPageTrace(page)
      if (!events.includes('rest.start')) {
        throw new Error(`page recorded no rest.start; got [${events.slice(0, 8).join(', ')}]`)
      }
      // The tick carries the worker's own clock, which is the measurement the
      // whole harness exists for.
      if (!events.includes('worker.tick')) {
        throw new Error(`page recorded no worker.tick; got [${events.slice(0, 8).join(', ')}]`)
      }
    })

    // A deploy must not leave the open app running one deploy's page under
    // another deploy's worker. When navigations were network-first, the first
    // online launch after a deploy ran the NEW page while the OLD worker stayed
    // in charge until every window closed; the old worker serves only its own
    // precache list, so the new page's lazily loaded screens had nothing to
    // serve them offline, even once the new worker had cached them.
    await leg('I: after a deploy, a screen not yet opened still opens offline', async () => {
      let server2 = await createStaticServer({ dir: 'dist', port: DEPLOY_PORT })
      let context
      try {
        const one = await installDeployOne(browser)
        context = one.context
        const page = one.page
        const settingsLoads = []
        const failed = []
        page.on('request', (r) => {
          if (new URL(r.url()).pathname.startsWith('/assets/Settings-')) settingsLoads.push(r.url())
        })
        page.on('requestfailed', (r) => failed.push(new URL(r.url()).pathname))

        // Deploy 2 goes live. The app is opened online and left open.
        await server2.close()
        server2 = await createStaticServer({ dir: next.dir, port: DEPLOY_PORT })
        await page.goto(`${DEPLOY_BASE}/today`)
        await page.getByText('HISTORY').first().waitFor({ timeout: 15_000 })
        const update = await settleUpdate(page)
        if (!update.waiting) throw new Error('setup: deploy 2 SW did not install')
        if (settingsLoads.length) {
          throw new Error('setup: Settings loaded while online, so this leg cannot test it')
        }

        // Signal drops. Settings is opened for the first time this session.
        await context.setOffline(true)
        await page.locator('a[href="/settings"]').first().click()
        try {
          await page.getByText('REST NOTIFICATIONS').first().waitFor({ timeout: 10_000 })
        } catch {
          const running = await page.evaluate(
            () => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src'),
          )
          const chunk = next.renamed(/^Settings-/)
          const inCache = await page.evaluate(async (p) => Boolean(await caches.match(p)), chunk)
          throw new Error(
            `Settings did not open offline. Page runs ${running}; failed: [${failed.join(', ')}]; ` +
              `${chunk} in cache: ${inCache}`,
          )
        }
      } finally {
        await context?.close()
        await server2.close()
      }
    })

    // A failed install must leave the old version working. The new SW's install
    // fails part-way: one precache fetch dies, so cache.addAll() rejects (F72
    // was one way to get there, a dropped connection mid-download is another).
    // When navigations were network-first, the launch that found the deploy had
    // already written deploy 2's shell into the cache deploy 1's worker serves
    // offline, and that shell named scripts no cache held.
    await leg('J: after a deploy whose SW failed to install, an offline launch still renders', async () => {
      let server2 = await createStaticServer({ dir: 'dist', port: DEPLOY_PORT })
      let context
      try {
        const one = await installDeployOne(browser)
        context = one.context
        // A screen chunk this leg never opens, so the only thing that fetches
        // it is the install's addAll. Failing something the page also loads
        // (the wasm, say) breaks the online page too, and an SW that proxies
        // misses through its own fetch makes those requests look like the
        // install's.
        const victim = next.renamed(/^HistoryEdit-/)
        let aborted = 0
        await context.route('**/*', async (route, request) => {
          if (new URL(request.url()).pathname === victim) {
            aborted++
            await route.abort()
          } else {
            await route.continue()
          }
        })

        await server2.close()
        server2 = await createStaticServer({ dir: next.dir, port: DEPLOY_PORT })
        await one.page.goto(`${DEPLOY_BASE}/today`)
        await one.page.getByText('HISTORY').first().waitFor({ timeout: 15_000 })
        const update = await settleUpdate(one.page)
        if (!aborted) throw new Error("setup: deploy 2's SW never fetched its precache")
        if (update.waiting) throw new Error('setup: deploy 2 SW installed despite the failed fetch')
        const shell = await cachedShellBundle(one.page)

        // Closed, then opened again with no signal.
        await one.page.close()
        await context.setOffline(true)
        const page = await context.newPage()
        const failed = []
        page.on('requestfailed', (r) => failed.push(new URL(r.url()).pathname))
        try {
          await page.goto(`${DEPLOY_BASE}/`)
          await page.getByText('HISTORY').first().waitFor({ timeout: 10_000 })
        } catch (err) {
          throw new Error(
            `offline launch did not render (${String(err).split('\n')[0]}). ` +
              `Cached shell loads ${shell}; failed: [${failed.join(', ')}]`,
            { cause: err },
          )
        }
      } finally {
        await context?.close()
        await server2.close()
      }
    })

    // The other half of serving the shell from the worker's own cache: a deploy
    // reaches the page only when its worker takes over, so the page must find
    // it, offer it, and land on it. No navigation here: a single-page app
    // resumed from the background makes none, so coming back to the
    // foreground is the only thing that can find the deploy.
    await leg('K: a deploy is found on resume, offered, and taking it lands on it', async () => {
      let server2 = await createStaticServer({ dir: 'dist', port: DEPLOY_PORT })
      let context
      try {
        const one = await installDeployOne(browser)
        context = one.context
        const page = one.page
        const bundle = () =>
          page.evaluate(
            () => document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src'),
          )
        const before = await bundle()

        await server2.close()
        server2 = await createStaticServer({ dir: next.dir, port: DEPLOY_PORT })
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
        const offer = page.getByRole('button', { name: /UPDATE READY/ })
        await offer.waitFor({ timeout: 15_000 })
        if ((await bundle()) !== before) throw new Error('the page changed deploy before the update was taken')

        await Promise.all([page.waitForEvent('load', { timeout: 15_000 }), offer.click()])
        await page.getByText('HISTORY').first().waitFor({ timeout: 15_000 })
        const after = await bundle()
        const expected = next.renamed(/^index-.*\.js$/)
        if (after !== expected) throw new Error(`after the update the page runs ${after}, expected ${expected}`)
        const precaches = await page.evaluate(async () =>
          (await caches.keys()).filter((k) => k.startsWith('precache-')),
        )
        if (precaches.length !== 1) {
          throw new Error(`expected one precache after the update, found [${precaches.join(', ')}]`)
        }
        if (await offer.isVisible()) throw new Error('the update is still offered after it was taken')

        // And deploy 2 works offline from its own cache, the old one now gone.
        await context.setOffline(true)
        await page.reload()
        await page.getByText('HISTORY').first().waitFor({ timeout: 10_000 })
      } finally {
        await context?.close()
        await server2.close()
      }
    })

  } finally {
    await browser.close()
    await server.close()
    await rm(next.dir, { recursive: true, force: true })
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
