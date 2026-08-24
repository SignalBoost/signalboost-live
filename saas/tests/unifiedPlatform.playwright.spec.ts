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
    await expect(page.locator('.thread-wrap')).toContainText(/Marketplace outreach forecast/i)
  })

  test('the COS-first home is localized in all five supported languages', async ({ page }) => {
    const cases = [
      ['en', /How can I help you today\?/],
      ['pt', /Como posso ajudar você hoje\?/],
      ['es', /¿Cómo puedo ayudarte hoy\?/],
      ['pl', /Jak mogę Ci dziś pomóc\?/],
      ['ru', /Чем я могу помочь вам сегодня\?/],
    ] as const

    for (const [lang, headline] of cases) {
      await page.addInitScript((value) => localStorage.setItem('signalboost_language', value), lang)
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toContainText(headline)
    }
  })
})
