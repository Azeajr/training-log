import { test, expect } from './fixtures'
import { completeSetupWizard } from './helpers'

// PT against a real build: the checklist is the one flow whose whole point is
// that nothing is written until FINISH, and that is only true end to end — the
// draft lives in localStorage, the commit is one transaction, and the history
// row is read back from SQLite in the worker.
test.describe('PT checklist', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await completeSetupWizard(page)
  })

  test('builds a routine, runs it, and records the run', async ({ page }) => {
    await page.goto('/pt')
    await expect(page.getByText('No routines yet')).toBeVisible()

    await page.getByRole('link', { name: '+ NEW ROUTINE' }).click()
    await page.getByLabel('Routine name').fill('Shoulder rehab')
    await page.getByLabel('Exercise 1 name').fill('Band pull-apart')
    await page.getByRole('button', { name: 'BAND', exact: true }).click()
    await page.getByLabel('Exercise 1 band').fill('red')

    // Nothing is in the database yet — the editor holds a draft.
    await expect(page.getByText('3 x 10 reps . red band')).toBeVisible()
    await page.getByRole('button', { name: 'DONE' }).click()

    await expect(page.getByText('Shoulder rehab')).toBeVisible()
    await expect(page.getByText('1 exercise')).toBeVisible()

    await page.getByRole('button', { name: 'START', exact: true }).click()
    const boxes = page.getByRole('checkbox')
    await expect(boxes).toHaveCount(3)

    await boxes.nth(0).click()
    await boxes.nth(1).click()
    await expect(page.getByText('Shoulder rehab . 2/3')).toBeVisible()

    // Still nothing written: a reload must resume the same half-finished run.
    await page.reload()
    await expect(page.getByRole('checkbox').nth(0)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('checkbox').nth(2)).toHaveAttribute('aria-checked', 'false')

    await page.getByLabel('Note for Band pull-apart').fill('shoulder tight')
    await page.getByRole('button', { name: 'FINISH' }).click()

    await expect(page.getByText('PT HISTORY')).toBeVisible()
    await expect(page.getByRole('button', { name: /Shoulder rehab.*2\/3/ })).toBeVisible()
  })

  test('discards a run without recording it', async ({ page }) => {
    await page.goto('/pt/new')
    await page.getByLabel('Routine name').fill('Knee')
    await page.getByLabel('Exercise 1 name').fill('Wall slide')
    await page.getByRole('button', { name: 'DONE' }).click()

    await page.getByRole('button', { name: 'START', exact: true }).click()
    await page.getByRole('checkbox').first().click()
    await page.getByRole('button', { name: 'DISCARD' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'DISCARD' }).click()

    await expect(page.getByText('No PT runs recorded yet')).toBeVisible()
  })

  test('archives a routine and restores it, keeping the run history', async ({ page }) => {
    await page.goto('/pt/new')
    await page.getByLabel('Routine name').fill('Knee block')
    await page.getByLabel('Exercise 1 name').fill('Wall slide')
    await page.getByRole('button', { name: 'DONE' }).click()

    await page.getByRole('button', { name: 'START', exact: true }).click()
    await page.getByRole('checkbox').first().click()
    await page.getByRole('button', { name: 'FINISH' }).click()
    await expect(page.getByText('PT HISTORY')).toBeVisible()

    await page.getByRole('link', { name: 'EDIT' }).click()
    await page.getByRole('button', { name: 'ARCHIVE ROUTINE' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'ARCHIVE' }).click()

    await expect(page.getByText('ARCHIVED', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'START', exact: true })).toHaveCount(0)
    // The run it produced outlives the routine's retirement (one of three
    // prescribed sets was ticked).
    await expect(page.getByRole('button', { name: /Knee block.*1\/3/ })).toBeVisible()

    await page.getByRole('button', { name: 'RESTORE' }).click()
    await expect(page.getByText('ARCHIVED', { exact: true })).toBeHidden()
    await expect(page.getByRole('button', { name: 'START', exact: true })).toBeVisible()
  })

  test('combines routines, restores progress, and saves separate history', async ({ page }) => {
    for (const [routine, exercise] of [['Shoulder', 'Band pull-apart'], ['Knee', 'Wall slide']]) {
      await page.goto('/pt/new')
      await page.getByLabel('Routine name').fill(routine)
      await page.getByLabel('Exercise 1 name').fill(exercise)
      await page.getByRole('button', { name: 'DONE', exact: true }).click()
      await expect(page.getByLabel(`Include ${routine}`)).toBeVisible()
    }

    await page.getByLabel('Include Shoulder').check()
    await page.getByLabel('Include Knee').check()
    await page.getByRole('button', { name: 'START SESSION (2)', exact: true }).click()
    const shoulderSet = page.getByRole('checkbox', { name: 'Band pull-apart set 1, 10 reps', exact: true })
    const kneeSet = page.getByRole('checkbox', { name: 'Wall slide set 2, 10 reps', exact: true })
    await shoulderSet.click()
    await kneeSet.click()
    await page.getByLabel('Notes for Shoulder', { exact: true }).fill('shoulder session note')
    await page.getByLabel('Note for Wall slide', { exact: true }).fill('knee exercise note')
    await page.reload()
    await expect(shoulderSet).toHaveAttribute('aria-checked', 'true')
    await expect(kneeSet).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('Notes for Shoulder', { exact: true })).toHaveValue('shoulder session note')
    await expect(page.getByLabel('Note for Wall slide', { exact: true })).toHaveValue('knee exercise note')

    await page.getByRole('link', { name: 'TODAY', exact: true }).click()
    await page.getByRole('button', { name: 'RESUME PT SESSION · 2 routines', exact: true }).click()
    await expect(shoulderSet).toHaveAttribute('aria-checked', 'true')
    await expect(kneeSet).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('button', { name: 'FINISH SESSION', exact: true }).click()

    await expect(page.getByText('PT HISTORY', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /RESUME PT SESSION/ })).toHaveCount(0)
    const shoulderHistory = page.getByRole('button', { name: /Shoulder.*1\/3/ })
    const kneeHistory = page.getByRole('button', { name: /Knee.*1\/3/ })
    await expect(shoulderHistory).toBeVisible()
    await expect(kneeHistory).toBeVisible()
    await shoulderHistory.click()
    await expect(page.getByText('shoulder session note', { exact: true })).toBeVisible()
    await kneeHistory.click()
    await expect(page.getByText('knee exercise note', { exact: true })).toBeVisible()
  })

  test('selects and starts multiple PT routines from Today', async ({ page }) => {
    for (const [routine, exercise] of [['Knee', 'Wall slide'], ['Shoulder', 'Band pull-apart']]) {
      await page.goto('/pt/new')
      await page.getByLabel('Routine name').fill(routine)
      await page.getByLabel('Exercise 1 name').fill(exercise)
      await page.getByRole('button', { name: 'DONE', exact: true }).click()
      // Wait for DONE's navigation before leaving the routines page.
      await expect(page.getByLabel(`Include ${routine}`)).toBeVisible()
    }

    await page.getByRole('link', { name: 'TODAY' }).click()
    await expect(page.getByRole('button', { name: 'START PT SESSION (0)', exact: true })).toBeDisabled()
    await page.getByLabel('Include Knee').check()
    await page.getByLabel('Include Shoulder').check()
    await expect(page).toHaveURL(/\/today$/)
    await page.getByRole('button', { name: 'START PT SESSION (2)', exact: true }).click()
    await expect(page).toHaveURL(/\/pt\/run$/)
    await expect(page.getByRole('checkbox', { name: 'Wall slide set 1, 10 reps', exact: true })).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Band pull-apart set 1, 10 reps', exact: true })).toBeVisible()
  })
})
