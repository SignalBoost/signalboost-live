import { expect, test } from '@playwright/test'

test.describe('Unified SignalBoost public shell', () => {
  test('admin route keeps guest users outside the restricted console', async ({ page }) => {
    await page.goto('/admin')

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('banner', { name: /Owner Console/i })).toHaveCount(0)
  })

  test('the COS-first home accepts keyboard prompts without the duplicate dock', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('signalboost_language', 'en'))
    await page.route('**/api/concierge', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Marketplace outreach forecast is ready for review.' }),
      })
    })

    await page.goto('/')
    await expect(page.getByRole('complementary', { name: /Concierge/i })).toHaveCount(0)

    const prompt = page.getByLabel(/Ask COS/i)
    await prompt.fill('Show outreach campaign forecasts for marketplace partners')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toContainText(/Marketplace outreach forecast/i)
  })
})
