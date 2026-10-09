import { expect, test } from '@playwright/test'

const phones = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 15 Pro', width: 393, height: 852 },
  { name: 'Android compact', width: 360, height: 800 },
  { name: 'Android large', width: 412, height: 915 },
] as const

for (const phone of phones) {
  test(`${phone.name}: public mobile menu stays usable and within viewport`, async ({ page }) => {
    await page.setViewportSize({ width: phone.width, height: phone.height })
    await page.goto('/de/ai-lab')
    const menu = page.locator('[data-mobile-public-menu]')
    await expect(menu.locator('summary')).toBeVisible()
    await expect(page.locator('.localized-nav-desktop')).toBeHidden()
    await menu.locator('summary').click()
    await expect(menu.locator('a[href="/de/ai-lab"]')).toBeVisible()
    await expect(menu.getByRole('combobox')).toHaveValue('de')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(2)
  })
}

test('Arabic mobile navigation is right-to-left and preserves topic when language changes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/ar/customer-reviews')
  const header = page.locator('[data-localized-public-navbar]')
  await expect(header).toHaveAttribute('dir', 'rtl')
  await header.locator('[data-mobile-public-menu] summary').click()
  await header.locator('[data-mobile-public-menu] select').selectOption('ja')
  await expect(page).toHaveURL(/\/ja\/customer-reviews\/?$/)
})
