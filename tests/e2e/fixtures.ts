import { test as base } from 'playwright/test'
import { createHarnessTest } from '@azeajr/web-harness/playwright'
import harness from '../../harness.config.mjs'
import { freshStart } from './helpers'

// The shared fault guard (web-harness): page errors, console errors, failed or
// erroring same-origin requests and escaped external calls fail a passing
// test — the same policy an agent's harness session is judged by. A test that
// causes a fault on purpose declares it with `allowPageFaults` or
// `expectPageFault`, for that test alone.
const harnessTest = createHarnessTest(base, harness)

export const test = harnessTest.extend<{ _freshDb: void }>({
  // Reset OPFS DB + localStorage before every test so each starts on a fresh
  // setup wizard. Tests that need a completed setup call `completeSetupWizard`
  // themselves in their own beforeEach.
  _freshDb: [async ({ page }, use) => {
    await freshStart(page)
    await use()
  }, { auto: true }],
})

export { expect } from 'playwright/test'
