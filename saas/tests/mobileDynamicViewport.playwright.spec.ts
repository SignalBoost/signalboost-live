import { expect, test } from '@playwright/test'

test('mobile navigation tracks a reduced viewport and remains scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/dashboard/reviews')
  await page.locator('.sbnav-burger').click()
  const menu = page.locator('.sbnav-mobile')
  await expect(menu).toBeVisible()
  await page.setViewportSize({ width: 375, height: 340 })
  await expect(menu.locator('select.sbnav-language-mobile')).toBeVisible()
  const dimensions = await menu.evaluate(element => {
    const style = getComputedStyle(element)
    return { height: element.getBoundingClientRect().height, overflow: style.overflowY, maxHeight: parseFloat(style.maxHeight) }
  })
  expect(dimensions.overflow).toBe('auto')
  expect(dimensions.height).toBeLessThanOrEqual(340)
  expect(dimensions.maxHeight).toBeLessThanOrEqual(340)
})
