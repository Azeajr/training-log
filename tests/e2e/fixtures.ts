import { test as base } from 'playwright/test'
import { freshStart } from './helpers'

export const test = base.extend<{ _noPageErrors: void; _freshDb: void }>({
  _noPageErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await use()
    if (errors.length > 0) throw new Error(`Page errors:\n${errors.join('\n')}`)
  }, { auto: true }],

  // Reset OPFS DB + localStorage before every test so each starts on a fresh
  // setup wizard. Tests that need a completed setup call `completeSetupWizard`
  // themselves in their own beforeEach.
  _freshDb: [async ({ page }, use) => {
    await freshStart(page)
    await use()
  }, { auto: true }],
})

export { expect } from 'playwright/test'
