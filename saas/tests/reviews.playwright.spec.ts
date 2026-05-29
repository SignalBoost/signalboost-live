import { expect, test } from '@playwright/test'

const locales = ['en', 'es', 'pt', 'pl', 'ru']

test.describe('Reviews module responsive SaaS page', () => {
  for (const locale of locales) {
    test(`renders review workflow controls for ${locale}`, async ({ page }) => {
      await page.addInitScript((lang) => localStorage.setItem('signalboost_language', lang as string), locale)
      await page.goto('/dashboard/reviews')
      await expect(page.getByRole('heading', { name: /Review collector|Recolector|Central|Centrum|Центр/i })).toBeVisible()
      await expect(page.getByLabel(/Review filters and sorting/i)).toBeVisible()
      await expect(page.getByLabel(/Admin Console reviews telemetry/i)).toBeVisible()
    })
  }

  test('supports mobile responsive review cards and moderation actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard/reviews')
    await expect(page.getByRole('button', { name: /Approve|Aprobar|Aprovar|Clear flag|Flag|ИИ/i }).first()).toBeVisible()
    await expect(page.getByText(/Sentiment trend|Tendencia|Trend|тональности/i)).toBeVisible()
  })
})
