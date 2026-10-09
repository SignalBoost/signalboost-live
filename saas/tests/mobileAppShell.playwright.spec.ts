import { expect, test } from '@playwright/test'

const mobileSizes = [
  { name: 'compact Android', width: 360, height: 800 },
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'modern iPhone', width: 393, height: 852 },
  { name: 'large Android', width: 412, height: 915 },
] as const

test.describe('application mobile shell acceptance', () => {
  for (const phone of mobileSizes) {
    test(`${phone.name}: guest dashboard and navigation usable at ${phone.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height })
      await page.addInitScript(() => localStorage.setItem('signalboost_language', 'en'))
      await page.route('**/api/reviews', route => route.fulfill({
        status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}',
      }))
      await page.goto('/dashboard/reviews')
      const menu = page.locator('.sbnav-burger')
      await expect(menu).toBeVisible()
      await menu.click()
      await expect(page.locator('.sbnav-mobile')).toBeVisible()
      const picker = page.locator('.sbnav-mobile select.sbnav-language-mobile')
      await expect(picker).toBeVisible()
      await expect(picker.locator('option')).toHaveCount(11)
      await expect(page.locator('section.sb-review-controls[aria-label]')).toBeVisible()
      await expect(page.getByRole('region', { name: /Review cards/i })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      expect(overflow, `document overflow at ${phone.width}px`).toBeLessThanOrEqual(2)
    })
  }
})
