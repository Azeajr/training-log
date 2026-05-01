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
  use: {
    baseURL: 'http://localhost:5173',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
