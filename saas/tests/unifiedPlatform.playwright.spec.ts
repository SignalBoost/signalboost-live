import { expect, test } from '@playwright/test'

test.describe('Unified SignalBoost public shell', () => {
  test('admin route keeps guest users outside the restricted console', async ({ page }) => {
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('banner', { name: /Owner Console/i })).toHaveCount(0)
  })

  test('concierge supports keyboard-driven prompts without a live AI dependency', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('signalboost_language', 'en'))
    await page.route('**/api/concierge', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Marketplace outreach forecast is ready for review.' }),
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: /Concierge/i }).click()

    const concierge = page.getByRole('complementary', { name: /Concierge/i })
    await expect(concierge).toBeVisible()
    await concierge.getByLabel(/Ask anything/i).fill('Show outreach campaign forecasts for marketplace partners')
    await page.keyboard.press('Enter')
    await expect(concierge.getByRole('log')).toContainText(/Marketplace outreach forecast/i)
  })
})
