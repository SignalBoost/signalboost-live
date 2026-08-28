import { expect, test } from '@playwright/test'

const locales = ['en', 'es', 'pt', 'pl', 'ru']
const guestNotice = /Please sign in|Por favor inicia sesión|Faça login|Zaloguj się|Войдите/i

test.describe('Reviews module responsive SaaS page', () => {
  for (const locale of locales) {
    test(`renders guest-safe review controls for ${locale}`, async ({ page }) => {
      await page.addInitScript((lang) => localStorage.setItem('signalboost_language', lang as string), locale)
      await page.goto('/dashboard/reviews')

      await expect(page.getByRole('heading', { name: /Review collector|Recolector|Coletor|Kolektor|Сборщик/i })).toBeVisible()
      await expect(page.getByRole('region', { name: /Review filters and sorting/i })).toBeVisible()
      await expect(page.locator('.sb-review-alert').getByText(guestNotice)).toBeVisible()
      await expect(page.getByLabel(/Admin Console reviews telemetry/i)).toHaveCount(0)
    })
  }

  test('keeps the guest review layout usable on a mobile viewport', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('signalboost_language', 'en'))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard/reviews')

    await expect(page.getByRole('region', { name: /Review filters and sorting/i })).toBeVisible()
    const reviewCards = page.getByRole('region', { name: /Review cards/i })
    await expect(reviewCards).toBeVisible()
    await expect(page.locator('.sb-review-alert').getByText(guestNotice)).toBeVisible()
    await expect(reviewCards.getByRole('button', { name: /Approve|Clear flag|Flag/i })).toHaveCount(0)
  })
})
