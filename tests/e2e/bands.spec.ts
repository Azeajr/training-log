import { test, expect } from './fixtures'
import { completeSetupWizard, startWorkout, getWorkoutState } from './helpers'

test('main-lift bands survive reload and raw-load recalibration on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
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
  await page.getByRole('combobox', { name: 'band', exact: true }).first().selectOption('Green')
  // 191 raw − 50 assistance = 141, the measured load itself, not a grid value.
  await expect(page.getByTestId('active-weight')).toHaveText('141lb')
  await page.getByRole('button', { name: 'LOG', exact: true }).first().click()
  await expect.poll(async () => (await getWorkoutState(page))?.loggedSets).toMatchObject([
    { weight: 141, bandLoad: { band: 'Green', rawLoad: 191, assistance: 50, addedWeight: 0 } },
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
  await page.getByRole('combobox', { name: 'band', exact: true }).first().selectOption('Green')
  await expect(page.getByTestId('active-weight')).toHaveText('151lb')
  await expect.poll(async () => (await getWorkoutState(page))?.loggedSets).toMatchObject([{ weight: 141, bandLoad: { rawLoad: 191 } }])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
