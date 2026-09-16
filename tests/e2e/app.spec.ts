import { test, expect } from './fixtures'
import { completeSetupWizard } from './helpers'

test.describe('first run', () => {
  test('shows setup wizard on fresh DB', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /STEP 1/ })).toBeVisible()
    await expect(page.getByText('OHP')).toBeVisible()
    await expect(page.getByText('BENCH')).toBeVisible()
    await expect(page.getByText('SQUAT')).toBeVisible()
    await expect(page.getByText('DEADLIFT')).toBeVisible()
  })

  // Two steps, not three: the roster step and the training-max step, and the
  // latter carries START TRAINING itself. The spec still clicked a second NEXT
  // and waited for a STEP 3 heading that has not existed since the wizard was
  // reshaped — the helper was updated and this was not (F85).
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
