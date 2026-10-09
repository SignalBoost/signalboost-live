import { expect, test } from '@playwright/test'

const tablets = [
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 768 },
  { name: 'Android tablet', width: 800, height: 1280 },
] as const

for (const device of tablets) {
  test(`${device.name}: localized public menu supports touch and stays inside viewport`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, hasTouch: true, isMobile: true })
    const page = await context.newPage()
    try {
      await page.goto('/fr/ai-lab')
      const mobile = page.locator('[data-mobile-public-menu]')
      if (device.width <= 767) {
        await expect(mobile.locator('summary')).toBeVisible()
        await mobile.locator('summary').tap()
        await expect(mobile.locator('a[href="/fr/ai-lab"]')).toBeVisible()
      } else {
        await expect(page.locator('.localized-nav-desktop')).toBeVisible()
        await expect(page.locator('.localized-nav-desktop a[href="/fr/ai-lab"]')).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2)
    } finally {
      await context.close()
    }
  })
}

test('touch-capable Android tablet shows dashboard navigation and 11 language options', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  try {
    await page.goto('/dashboard/reviews')
    await page.locator('.sbnav-burger').tap()
    const picker = page.locator('.sbnav-mobile select.sbnav-language-mobile')
    await expect(picker).toBeVisible()
    await expect(picker.locator('option')).toHaveCount(11)
  } finally {
    await context.close()
  }
})
