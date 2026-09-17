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

    await page.getByRole('button', { name: 'START' }).click()
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
    await expect(page.getByText('2/3')).toBeVisible()
  })

  test('discards a run without recording it', async ({ page }) => {
    await page.goto('/pt/new')
    await page.getByLabel('Routine name').fill('Knee')
    await page.getByLabel('Exercise 1 name').fill('Wall slide')
    await page.getByRole('button', { name: 'DONE' }).click()

    await page.getByRole('button', { name: 'START' }).click()
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

    await page.getByRole('button', { name: 'START' }).click()
    await page.getByRole('checkbox').first().click()
    await page.getByRole('button', { name: 'FINISH' }).click()
    await expect(page.getByText('PT HISTORY')).toBeVisible()

    await page.getByRole('link', { name: 'EDIT' }).click()
    await page.getByRole('button', { name: 'ARCHIVE ROUTINE' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'ARCHIVE' }).click()

    await expect(page.getByText('ARCHIVED', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'START' })).toHaveCount(0)
    // The run it produced outlives the routine's retirement (one of three
    // prescribed sets was ticked).
    await expect(page.getByText('1/3')).toBeVisible()

    await page.getByRole('button', { name: 'RESTORE' }).click()
    await expect(page.getByText('ARCHIVED', { exact: true })).toBeHidden()
    await expect(page.getByRole('button', { name: 'START' })).toBeVisible()
  })

  test('reaches PT from the Today screen', async ({ page }) => {
    await page.goto('/pt/new')
    await page.getByLabel('Routine name').fill('Knee')
    await page.getByLabel('Exercise 1 name').fill('Wall slide')
    await page.getByRole('button', { name: 'DONE' }).click()
    // Wait for DONE's own navigate('/pt') to land first: clicking TODAY while
    // it is still in flight navigates away and is then bounced straight back.
    await expect(page.getByRole('button', { name: 'START' })).toBeVisible()

    await page.getByRole('link', { name: 'TODAY' }).click()
    await expect(page.getByRole('button', { name: /Knee.*START/ })).toBeVisible()
  })
})
