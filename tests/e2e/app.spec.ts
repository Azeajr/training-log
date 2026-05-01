import { test, expect } from 'playwright/test'
import { freshStart, completeSetupWizard } from './helpers'

test.describe('first run', () => {
  test('shows setup wizard on fresh DB', async ({ page }) => {
    await freshStart(page)
    await expect(page.locator('text=STEP 1')).toBeVisible()
    await expect(page.locator('text=OHP')).toBeVisible()
    await expect(page.locator('text=BENCH')).toBeVisible()
    await expect(page.locator('text=SQUAT')).toBeVisible()
    await expect(page.locator('text=DEADLIFT')).toBeVisible()
  })

  test('setup wizard navigates through both steps', async ({ page }) => {
    await freshStart(page)

    // Step 1: fill TMs
    const inputs = await page.locator('input[type=number]').all()
    for (const inp of inputs) await inp.fill('100')
    await page.click('button:has-text("NEXT")')

    // Step 2: confirmation screen
    await expect(page.locator('text=STEP 2')).toBeVisible()
    await expect(page.locator('text=START TRAINING')).toBeVisible()
  })

  test('after setup lands on Today with WEEK 1', async ({ page }) => {
    await freshStart(page)
    await completeSetupWizard(page)

    await expect(page.locator('text=WEEK 1')).toBeVisible()
    await expect(page.getByRole('button', { name: /OHP/ }).first()).toBeVisible()
    await expect(page.locator('text=START WORKOUT')).toBeVisible()
  })

  test('no errors on first run', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))

    await freshStart(page)
    await completeSetupWizard(page)

    expect(errors).toHaveLength(0)
  })

  test('second visit without refresh skips setup wizard', async ({ page }) => {
    await freshStart(page)
    await completeSetupWizard(page)

    // Reload — should go straight to Today, not setup
    await page.reload()
    await page.waitForTimeout(1000)

    await expect(page.locator('text=WEEK 1')).toBeVisible()
    await expect(page.locator('text=STEP 1')).not.toBeVisible()
  })
})
