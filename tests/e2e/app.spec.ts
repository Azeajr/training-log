import { test, expect } from './fixtures'
import { freshStart, completeSetupWizard } from './helpers'

test.describe('first run', () => {
  test('shows setup wizard on fresh DB', async ({ page }) => {
    await freshStart(page)
    await expect(page.getByText('STEP 1')).toBeVisible()
    await expect(page.getByText('OHP')).toBeVisible()
    await expect(page.getByText('BENCH')).toBeVisible()
    await expect(page.getByText('SQUAT')).toBeVisible()
    await expect(page.getByText('DEADLIFT')).toBeVisible()
  })

  test('setup wizard navigates through both steps', async ({ page }) => {
    await freshStart(page)
    await page.getByText('STEP 1').waitFor()
    await page.getByRole('button', { name: 'NEXT' }).click()
    await expect(page.getByText('STEP 2')).toBeVisible()
    await expect(page.getByText('START TRAINING')).toBeVisible()
  })

  test('after setup lands on Today with WEEK 1', async ({ page }) => {
    await freshStart(page)
    await completeSetupWizard(page)
    await expect(page.getByText('WEEK 1')).toBeVisible()
    await expect(page.getByRole('button', { name: /OHP/ }).first()).toBeVisible()
    await expect(page.getByText('START WORKOUT')).toBeVisible()
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
    await page.reload()
    await page.getByText('WEEK 1').waitFor()
    await expect(page.getByText('WEEK 1')).toBeVisible()
    await expect(page.getByText('STEP 1')).not.toBeVisible()
  })
})
