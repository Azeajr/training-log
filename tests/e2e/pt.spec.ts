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

  test('keeps step height alongside weight, sets, and reps through edit, run, and history', async ({ page }) => {
    // Only the row's expander carries aria-expanded; the reorder and remove
    // controls share the exercise name, so matching on name alone is ambiguous.
    const stepDownRow = page.locator('button[aria-expanded]').filter({ hasText: 'Step down' })
    await page.goto('/pt/new')
    await page.getByLabel('Routine name').fill('Step-down rehab')
    await page.getByLabel('Exercise 1 name').fill('Step down')
    await page.getByRole('button', { name: 'WEIGHT', exact: true }).click()
    await page.getByLabel('Exercise 1 equipment height', { exact: true }).fill('6.5')
    const prescription = '3 x 10 reps . 10 lb . 6.5 in high'
    await expect(page.getByText(prescription, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'DONE', exact: true }).click()
    await page.getByRole('link', { name: 'EDIT', exact: true }).click()
    await page.reload()
    await stepDownRow.click()
    await expect(page.getByLabel('Exercise 1 equipment height', { exact: true })).toHaveValue('6.5')
    await expect(page.getByLabel('Exercise 1 equipment height unit')).toHaveValue('in')
    await page.getByRole('button', { name: 'DONE', exact: true }).click()
    await page.getByRole('button', { name: 'START', exact: true }).click()
    await expect(page.getByText(prescription, { exact: true })).toBeVisible()
    await page.getByRole('checkbox').first().click()
    await page.getByRole('button', { name: 'FINISH', exact: true }).click()
    await page.getByRole('button', { name: /Step-down rehab.*1\/3/ }).click()
    await expect(page.getByText(prescription, { exact: true })).toBeVisible()

    await page.getByRole('link', { name: 'EDIT', exact: true }).click()
    await stepDownRow.click()
    await page.getByLabel('Exercise 1 equipment height unit').selectOption('cm')
    await page.getByLabel('Exercise 1 equipment height', { exact: true }).fill('15')
    await expect(page.getByText('3 x 10 reps . 10 lb . 15 cm high', { exact: true })).toBeVisible()
    await page.getByLabel('Exercise 1 equipment height', { exact: true }).fill('')
    await page.getByRole('button', { name: 'DONE', exact: true }).click()
    await page.getByRole('link', { name: 'EDIT', exact: true }).click()
    await stepDownRow.click()
    await expect(page.getByLabel('Exercise 1 equipment height', { exact: true })).toBeEmpty()
    await expect(page.getByText('3 x 10 reps . 10 lb', { exact: true })).toBeVisible()
  })

  test('corrects a recorded run from history and keeps the correction', async ({ page }) => {
    await page.goto('/pt/new')
    await page.getByLabel('Routine name').fill('Knee')
    await page.getByLabel('Exercise 1 name').fill('Step down')
    await page.getByRole('button', { name: 'DONE', exact: true }).click()
    await page.getByRole('button', { name: 'START', exact: true }).click()

    // Log all three sets as prescribed, then finish.
    for (const n of [1, 2, 3]) {
      await page.getByRole('checkbox', { name: new RegExp(`Step down set ${n}`) }).click()
    }
    await page.getByRole('button', { name: 'FINISH', exact: true }).click()
    await page.getByRole('button', { name: /Knee.*3\/3/ }).click()

    await page.getByRole('button', { name: 'EDIT RUN', exact: true }).click()
    const setOne = page.getByRole('checkbox', { name: /Step down set 1/ })
    await setOne.locator('..').getByRole('button', { name: /reps/ }).click()
    await page.getByLabel('Decrease set 1 reps').click()
    // Wait for the stepper to actually hold 9 before logging — clicking LOG in
    // the same tick races the change and saves the original value.
    await expect(page.getByLabel(/Edit set 1 reps, currently 9/)).toBeVisible()
    await page.getByRole('button', { name: 'LOG', exact: true }).click()
    // The editor holds the correction before it is written.
    await expect(page.getByText('× 9 reps')).toBeVisible()
    await page.getByRole('button', { name: 'SAVE CHANGES', exact: true }).click()

    // Back to the read-only detail, which is the signal the write landed.
    await expect(page.getByRole('button', { name: 'EDIT RUN', exact: true })).toBeVisible()
    await expect(page.getByText('9 reps')).toBeVisible()

    // And it survives a reload, so it came from the database and not the view.
    await page.reload()
    await page.getByRole('button', { name: /Knee.*3\/3/ }).click()
    await expect(page.getByText('STEP DOWN')).toBeVisible()
    await expect(page.getByText('9 reps')).toBeVisible()
    // Only set 1 changed; the other two still read as prescribed.
    await expect(page.getByText('10 reps', { exact: true })).toHaveCount(2)
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
    await page.getByRole('button', { name: 'RESUME PT SESSION . 2 routines', exact: true }).click()
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
