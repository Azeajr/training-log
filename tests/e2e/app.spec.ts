import { test, expect } from './fixtures'
import { completeSetupWizard } from './helpers'

test.describe('first run', () => {
  test('shows setup wizard on fresh DB', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /STEP 1/ })).toBeVisible()
    await expect(page.getByTestId('stepper-tm-ohp')).toBeVisible()
    await expect(page.getByTestId('stepper-tm-bench')).toBeVisible()
    await expect(page.getByTestId('stepper-tm-squat')).toBeVisible()
    await expect(page.getByTestId('stepper-tm-deadlift')).toBeVisible()
  })

  test('setup wizard navigates through both steps', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /STEP 1/ })).toBeVisible()
    await page.getByRole('button', { name: 'NEXT' }).click()
    await expect(page.getByRole('heading', { name: /STEP 2/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'START TRAINING' })).toBeVisible()
  })

  test('after setup lands on Today with WEEK 1', async ({ page }) => {
    await completeSetupWizard(page)
    await expect(page.getByText('WEEK 1')).toBeVisible()
    await expect(page.getByRole('button', { name: /^OHP/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'START WORKOUT' })).toBeVisible()
  })

  test('second visit without refresh skips setup wizard', async ({ page }) => {
    await completeSetupWizard(page)
    await page.reload()
    await expect(page.getByText('WEEK 1')).toBeVisible()
    await expect(page.getByRole('heading', { name: /STEP 1/ })).not.toBeVisible()
  })
})
