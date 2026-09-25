import { test, expect } from './fixtures'
import type { Page } from 'playwright/test'
import { completeSetupWizard, startWorkout, getWorkoutState } from './helpers'

// Swap to exactly these bands, with nothing on the belt: the suggestion a set
// opens on may carry plates, and a swap keeps them.
async function setUp(page: Page, bands: string[]) {
  const group = page.getByRole('group', { name: 'bands', exact: true }).first()
  await group.getByRole('button', { name: 'NONE', exact: true }).click()
  for (const band of bands) await group.getByRole('button', { name: band, exact: true }).click()
  await page.getByRole('button', { name: /^Edit added weight, currently/ }).first().click()
  await page.getByRole('spinbutton', { name: 'added weight', exact: true }).fill('0')
  await page.getByRole('spinbutton', { name: 'added weight', exact: true }).press('Enter')
}

test('main-lift bands survive reload and raw-load recalibration on mobile', async ({ page }) => {
  // An iPhone 13 mini, the narrowest phone this is used on: five chips have to
  // wrap inside it rather than push the page sideways.
  await page.setViewportSize({ width: 375, height: 812 })
  await completeSetupWizard(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'rename', exact: true }).first().click()
  await page.locator('input[type="text"]').first().fill('Chin-ups')
  await page.getByRole('button', { name: 'SAVE', exact: true }).click()
  // Bands are opt-in: naming a lift "Chin-ups" does not switch them on, so
  // there is no band picker until the calibration is accepted and saved. The
  // dialog opens prefilled from the supplied measurements, but UNTICKED — a
  // profile replaces the weight stepper, and a dialog that arrives already
  // ticked is the same name-matching one layer up.
  //
  // Setting one up happens HERE, in Settings: the logging screens only carry
  // the shortcut for a movement that already uses bands, so the label on this
  // row says so too.
  await expect(page.getByRole('button', { name: 'Band settings for Chin-ups', exact: true }))
    .toHaveText('SET UP BANDS')
  await page.getByRole('button', { name: 'Band settings for Chin-ups', exact: true }).click()
  const optIn = page.getByRole('checkbox', { name: 'Use raw load and bands', exact: true })
  await expect(optIn).not.toBeChecked()
  await optIn.check()
  await page.getByRole('button', { name: 'SAVE BAND SETTINGS', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Band settings for Chin-ups', exact: true }))
    .toHaveText('BANDS')

  await page.goto('/today')
  await startWorkout(page)
  await setUp(page, ['Green'])
  // 191 raw − 50 assistance = 141, the measured load itself, not a grid value.
  await expect(page.getByTestId('active-weight')).toHaveText('141lb')
  // Bands stack: Purple on top of Green assists 50 + 30.
  await page.getByRole('group', { name: 'bands', exact: true }).first().getByRole('button', { name: 'Purple', exact: true }).click()
  await expect(page.getByTestId('active-weight')).toHaveText('111lb')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'LOG', exact: true }).first().click()
  await expect.poll(async () => (await getWorkoutState(page))?.loggedSets).toMatchObject([
    { weight: 111, bandLoad: { bands: ['Green', 'Purple'], rawLoad: 191, assistance: 80, addedWeight: 0 } },
  ])
  // Rest starts after the SQLite write succeeds; wait before testing reload.
  await expect(page.getByRole('button', { name: 'SKIP REST', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Band settings for Chin-ups', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Band settings for Chin-ups', exact: true }).click()
  await page.getByRole('button', { name: 'Edit raw load, currently 191', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'raw load', exact: true }).fill('201')
  await page.getByRole('spinbutton', { name: 'raw load', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'SAVE BAND SETTINGS', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await setUp(page, ['Green'])
  await expect(page.getByTestId('active-weight')).toHaveText('151lb')
  await expect.poll(async () => (await getWorkoutState(page))?.loggedSets).toMatchObject([{ weight: 111, bandLoad: { rawLoad: 191 } }])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
