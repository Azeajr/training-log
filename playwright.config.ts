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
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
