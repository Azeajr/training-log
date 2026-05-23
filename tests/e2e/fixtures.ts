import { test as base } from 'playwright/test'

export const test = base.extend<{ _noPageErrors: void }>({
  _noPageErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', err => errors.push(err.message))
    await use()
    if (errors.length > 0) throw new Error(`Page errors:\n${errors.join('\n')}`)
  }, { auto: true }],
})

export { expect } from 'playwright/test'
