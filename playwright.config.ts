import { defineConfig } from 'playwright/test'
import { productionServer } from '@azeajr/web-harness/playwright'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  use: {
    // 127.0.0.1, not localhost: the server binds IPv4 only, and the fault
    // policy judges "external" against exactly this origin.
    baseURL: 'http://127.0.0.1:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // The production build, served the way Cloudflare Pages serves it —
  // public/_headers applied as real headers, SPA fallback — not `pnpm dev`.
  // The dev server registers no service worker and sends none of the
  // production headers, so the exact surface F65 and F66 lived on was
  // invisible to it by construction (F78). `vite preview` fixed the bundle but
  // needed its own copy of the header policy, which drifted from _headers.
  //
  // Never reuses a listening server: a leftover one from an earlier build was
  // silently tested instead of the code under review. The browser is
  // Playwright's own, matched to this Playwright version — no hunting the disk
  // for whichever `chrome` binary turns up first.
  webServer: productionServer({ port: 5175, build: 'pnpm build' }),
})
