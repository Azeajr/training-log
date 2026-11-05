import { createServer, request } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test as base, expect } from 'playwright/test'
import { createStaticServer } from '@azeajr/web-harness/static-server'
import { createHarnessTest } from '@azeajr/web-harness/playwright'
import harness from '../../harness.config.mjs'

// The harness's static server serves /index.html directly. Pages redirects it
// to /, so precaching it stores a Response with redirected=true. Use an actual
// HTTP redirect: mocking a Response would miss the browser's navigation checks.
const test = createHarnessTest(base, harness).extend<{
  redirectSite: { url: string; disconnect: () => Promise<void> }
}>({
  // WebKit's temporary contexts cannot open the app's OPFS database. Use a
  // disposable persistent profile, as the harness's WebKit sessions do.
  context: async ({ playwright, browserName, baseURL }, use) => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'sw-redirect-'))
    const context = await playwright[browserName].launchPersistentContext(profile, { baseURL })
    try {
      await use(context)
    } finally {
      await context.close()
      await rm(profile, { recursive: true, force: true })
    }
  },
  baseURL: async ({ redirectSite }, use) => use(redirectSite.url),
  // eslint-disable-next-line no-empty-pattern
  redirectSite: async ({}, use) => {
    const site = await createStaticServer({ dir: 'dist', port: 0 })
    const proxy = createServer((req, res) => {
      if (new URL(req.url!, site.url).pathname === '/index.html') {
        res.writeHead(308, { location: '/' }).end()
        return
      }
      const upstream = request(new URL(req.url!, site.url), (response) => {
        res.writeHead(response.statusCode!, response.headers)
        response.pipe(res)
      })
      upstream.on('error', () => res.writeHead(502).end())
      req.pipe(upstream)
    })
    let disconnected = false
    const disconnect = async () => {
      if (disconnected) return
      disconnected = true
      await new Promise<void>((resolve) => {
        proxy.close(() => resolve())
        proxy.closeAllConnections()
      })
    }
    try {
      await new Promise<void>((resolve, reject) => {
        proxy.once('error', reject)
        proxy.listen(0, '127.0.0.1', resolve)
      })
      const address = proxy.address()
      if (!address || typeof address === 'string') throw new Error('missing proxy port')
      await use({ url: `http://127.0.0.1:${address.port}`, disconnect })
    } finally {
      await disconnect()
      await site.close()
    }
  },
})

test.use({ browserName: 'webkit' })

test('a redirected precached shell loads online and offline without losing training data', async ({ page, redirectSite }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /STEP 1/ })).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  // Prove we exercised Pages' redirect, rather than a direct local file.
  expect(await page.evaluate(async () => (await caches.match('/index.html'))?.redirected)).toBe(true)

  await page.getByRole('button', { name: 'NEXT' }).click()
  await page.getByRole('button', { name: 'START TRAINING' }).click()
  await expect(page.getByText('WEEK 1')).toBeVisible()

  const response = await page.goto('/settings')
  expect(response?.fromServiceWorker()).toBe(true)
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'")
  await expect(page.getByText('REST NOTIFICATIONS').first()).toBeVisible()

  // Stop the origin instead of WebKit's broken offline emulation, which also
  // rejects literal service-worker responses (microsoft/playwright#42775).
  await redirectSite.disconnect()
  await page.reload()
  await expect(page.getByText('REST NOTIFICATIONS').first()).toBeVisible()
  await page.goto('/today')
  await expect(page.getByText('WEEK 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible()
})
