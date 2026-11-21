import { test, expect } from './fixtures'
import type { Locator, Page } from 'playwright/test'
import { completeSetupWizard, startWorkout } from './helpers'

// An iPhone 13 mini, the narrowest phone this is used on. Layout is the one
// thing jsdom cannot check, so these read real boxes from a real build.
test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

// A text-xs line is 16px; anything past this has wrapped onto a second one.
const ONE_LINE = 24

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not rendered')
  return b
}

async function renameLift(page: Page, from: string, to: string) {
  const row = page.locator('div.py-1').filter({ has: page.getByText(from, { exact: true }) })
  await row.getByRole('button', { name: 'rename' }).click()
  await page.locator('input[type="text"]').first().fill(to)
  await page.getByRole('button', { name: 'SAVE' }).click()
  await expect(page.getByText(to, { exact: true })).toBeVisible()
}

test('long lift names keep workout headers whole on a 375px phone', async ({ page }) => {
  const main = 'Close-Grip Paused Bench Press'
  const cross = 'Close-Grip Bench Press'

  await expect(page.getByRole('heading', { name: /STEP 1/ })).toBeVisible()
  await renameLift(page, 'OHP', main)
  await renameLift(page, 'Bench', cross)
  const row = page.locator('div.py-1').filter({ has: page.getByText(main, { exact: true }) })
  await row.getByRole('button', { name: 'advanced' }).click()
  const modal = page.getByRole('dialog')
  await modal.getByRole('button', { name: cross.toUpperCase(), exact: true }).click()
  await modal.getByRole('button', { name: 'ADD BLOCK' }).click()
  await modal.getByRole('button', { name: 'DONE' }).click()
  await expect(modal).toHaveCount(0)

  await page.getByRole('button', { name: 'NEXT' }).click()
  for (const name of [main, 'Deadlift', cross, 'Squat']) {
    const stepper = page.getByTestId(`stepper-tm-${name.toLowerCase().replace(/\s+/g, '-')}`)
    await stepper.getByTestId('stepper-value').click()
    await stepper.getByTestId('stepper-input').fill('135')
    await stepper.getByTestId('stepper-input').press('Enter')
  }
  await page.getByRole('button', { name: 'START TRAINING' }).click()
  await page.getByRole('button', { name: 'START WORKOUT' }).click()
  await expect(page.getByRole('button', { name: 'FINISH' })).toBeVisible()

  // The name gives way, not the week: it used to run the suffix off the edge
  // of the header, clipped. Measured on the text itself, whatever holds it.
  const header = page.getByRole('button', { name: /^View history for/ })
  const weekRight = await header.evaluate(el => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = n.textContent!.indexOf('WEEK 1')
      if (at < 0) continue
      const range = document.createRange()
      range.setStart(n, at)
      range.setEnd(n, at + 'WEEK 1'.length)
      return range.getBoundingClientRect().right
    }
    return Infinity
  })
  const headerBox = await box(header)
  expect(weekRight).toBeLessThanOrEqual(headerBox.x + headerBox.width)

  // Work the whole cross block so it folds. Its header kept the name, the
  // prescription and "5 sets done" on one line and broke two of them in half.
  const block = page.locator('[data-section^="cross-"]')
  for (let set = 0; set < 5; set++) await block.getByRole('button', { name: 'LOG' }).click()
  const done = block.getByText('5 sets done')
  await expect(done).toBeVisible()
  expect((await box(done)).height).toBeLessThan(ONE_LINE)
  expect((await box(block.getByText('5 × 10 FSL'))).height).toBeLessThan(ONE_LINE)

  // A sheet's "← BACK" gave way beside its title rule and broke over two lines.
  await page.getByRole('button', { name: '+ ADD EXTRA ASSISTANCE' }).click()
  const back = page.getByRole('dialog').getByRole('button', { name: '← BACK' })
  expect((await box(back)).height).toBeLessThan(ONE_LINE)
})

// The document never scrolls; <main> does (COMMON_MISTAKES #13). On iOS 27 a
// zero-height visual viewport let the layout viewport lag the page by up to a
// screen, and with the document as the scroller every fixed bar rode along.
// The browsers here report a real viewport, so this cannot reproduce that. It
// guards the layout that makes it harmless.
test('screens scroll inside main, never the document, and open at the top', async ({ page }) => {
  await completeSetupWizard(page)
  const scroll = () => page.evaluate(() => ({
    doc: scrollY,
    room: document.documentElement.scrollHeight - innerHeight,
    main: document.querySelector('main')!.scrollTop,
  }))

  // Settings is the longest screen. Reaching a control near its end moves
  // <main> and nothing else, and the nav stays on the bottom edge.
  await page.getByRole('link', { name: 'SETTINGS' }).click()
  await page.getByRole('button', { name: 'Start recording' }).scrollIntoViewIfNeeded()
  const settings = await scroll()
  expect(settings.doc).toBe(0)
  expect(settings.room).toBeLessThanOrEqual(0)
  expect(settings.main).toBeGreaterThan(0)
  const nav = await box(page.locator('[data-layout-anchor="bottom-nav"]'))
  expect(nav.y + nav.height).toBeCloseTo(812, 0)

  // A screen opens at its top. The router resets the window's scroll, which
  // never moves now, so the shell resets <main>'s. Without that, Settings
  // (already loaded, so no fallback in between) opened where Workout was left.
  await page.getByRole('link', { name: 'TODAY' }).click()
  await startWorkout(page)
  await page.getByPlaceholder('session notes...').scrollIntoViewIfNeeded()
  expect((await scroll()).main).toBeGreaterThan(0)
  await page.getByRole('link', { name: 'SETTINGS' }).click()
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeAttached()
  expect(await scroll()).toEqual({ doc: 0, room: 0, main: 0 })
})
