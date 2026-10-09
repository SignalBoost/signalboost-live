import { expect, test } from '@playwright/test'

const devices = [
  { name: 'small Android', width: 360, height: 800 },
  { name: 'iPhone', width: 393, height: 852 },
  { name: 'Android landscape', width: 800, height: 360 },
  { name: 'tablet', width: 768, height: 1024 },
] as const

const routes = [
  '/dashboard',
  '/dashboard/builder',
  '/dashboard/reviews',
  '/dashboard/cos-university-telemetry',
] as const

for (const device of devices) {
  for (const route of routes) {
    test(`${device.name}: ${route} has accessible mobile shell`, async ({ page }) => {
      await page.setViewportSize({ width: device.width, height: device.height })
      const response = await page.goto(route)
      expect(response?.status()).toBeLessThan(500)
      await expect(page.locator('main')).toBeVisible()
      const metrics = await page.evaluate(() => ({
        viewport: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        mainWidth: document.querySelector('main')?.getBoundingClientRect().width ?? 0,
      }))
      expect(metrics.mainWidth).toBeGreaterThan(0)
      expect(metrics.pageWidth - metrics.viewport, `${route} spills horizontally on ${device.name}`).toBeLessThanOrEqual(4)
      const burger = page.locator('.sbnav-burger')
      if (await burger.isVisible()) {
        await burger.click()
        await expect(page.locator('.sbnav-mobile')).toBeVisible()
        await expect(page.locator('.sbnav-language-mobile')).toBeVisible()
      }
    })
  }
}
