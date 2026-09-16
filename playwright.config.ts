import { defineConfig } from 'playwright/test'
import { execSync } from 'child_process'
import { existsSync } from 'fs'

function findChrome(): string | undefined {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/tmp/pw-browsers',
    `${process.env.HOME}/.cache/ms-playwright`,
  ].filter((x): x is string => Boolean(x))

  for (const root of roots) {
    try {
      const hit = execSync(
        `find "${root}" -name chrome -type f 2>/dev/null | head -1`,
        { encoding: 'utf8' }
      ).trim()
      if (hit && existsSync(hit)) return hit
    } catch { /* ignore */ }
  }
}

const executablePath = findChrome()

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  // `vite preview` against a real build, not `pnpm dev`. The dev server does
  // not register the service worker (VitePWA has no devOptions) and does not
  // apply public/_headers, so the suite exercised neither the SW, nor the
  // production bundle, nor the production CSP — the exact surface F65 and F66
  // lived on was invisible to it by construction (F78).
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 5175 --strictPort',
    url: 'http://localhost:5175',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
