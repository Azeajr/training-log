import type { Page } from 'playwright/test'

export async function freshStart(page: Page) {
  await page.goto('/')
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    indexedDB.deleteDatabase('TrainingLog')
    localStorage.clear()
  })
  await page.reload()
  await page.waitForTimeout(800)
}

export async function completeSetupWizard(page: Page, tms = [95, 95, 135, 135]) {
  await page.waitForSelector('text=STEP 1')
  const inputs = await page.locator('input[type=number]').all()
  for (let i = 0; i < inputs.length; i++) {
    await inputs[i].fill(String(tms[i] ?? 100))
  }
  await page.click('button:has-text("NEXT")')
  await page.waitForSelector('text=STEP 2')
  await page.click('button:has-text("START TRAINING")')
  await page.waitForSelector('text=WEEK 1')
}

export async function startWorkout(page: Page) {
  await page.click('button:has-text("START WORKOUT")')
  await page.waitForSelector('text=COMPLETE SESSION')
}

export async function logSet(page: Page, reps: number) {
  await page.locator('input[type=number]').first().fill(String(reps))
  await page.click('button:has-text("LOG")')
  await page.waitForTimeout(400)
}
