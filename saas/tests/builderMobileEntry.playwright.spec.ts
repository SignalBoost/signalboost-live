import { expect, test } from '@playwright/test'

const phones = [
  { name: 'iPhone compact', width: 375, height: 812 },
  { name: 'Android compact', width: 360, height: 800 },
  { name: 'Android large', width: 412, height: 915 },
] as const

test.describe('Builder entry mobile usability, guest-safe', () => {
  for (const phone of phones) {
    test(`${phone.name} at ${phone.width}px can reach the assistant composer without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: phone.width, height: phone.height })
      await page.addInitScript(() => localStorage.setItem('signalboost_language', 'en'))
      const response = await page.goto('/dashboard/assistant')
      expect(response?.status()).toBeLessThan(500)
      const composer = page.locator('textarea').first()
      await expect(composer).toBeVisible()
      const box = await composer.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(-2)
      expect(box!.x + box!.width).toBeLessThanOrEqual(phone.width + 2)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `Builder entry horizontal overflow at ${phone.width}px`).toBeLessThanOrEqual(2)
    })
  }
})
