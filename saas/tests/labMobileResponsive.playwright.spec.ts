import { expect, test } from '@playwright/test'

for (const width of [360, 375, 393, 412, 768, 1024]) {
  test(`LAB workspace fits ${width}px and prompt stays editable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/dashboard/lab')
    const grid = page.locator('.sb-lab-workspace-grid')
    await expect(grid).toBeVisible()
    const input = page.locator('.sb-lab-prompt-controls input:not([type="file"])')
    await expect(input).toBeVisible()
    await input.fill('Draft a demo workflow')
    await expect(input).toHaveValue('Draft a demo workflow')
    const bounds = await grid.evaluate(node => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, right: rect.right, columns: getComputedStyle(node).gridTemplateColumns }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(-2)
    expect(bounds.right).toBeLessThanOrEqual(width + 2)
    if (width <= 900) {
      expect(bounds.columns.trim().split(/\\s+/)).toHaveLength(1)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(overflow, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(2)
  })
}
