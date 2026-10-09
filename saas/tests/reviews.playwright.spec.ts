import { expect, test } from '@playwright/test'

const locales = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar']
const guestNotice: Record<string, RegExp> = {
  en: /Please sign in/i,
  es: /Por favor inicia sesión/i,
  pt: /Por favor faça login/i,
  pl: /Zaloguj się/i,
  ru: /Пожалуйста, войдите/i,
  de: /Bitte melden Sie sich an/i,
  fr: /Veuillez vous connecter/i,
  it: /Accedi per vedere le tue recensioni/i,
  ja: /レビューを表示するにはサインインしてください/,
  ko: /리뷰를 보려면 로그인하세요/,
  ar: /يرجى تسجيل الدخول/,
}

test.describe('Reviews module responsive SaaS page', () => {
  for (const locale of locales) {
    test(`renders guest-safe review controls for ${locale}`, async ({ page }) => {
      await page.addInitScript((lang) => localStorage.setItem('signalboost_language', lang as string), locale)
      await page.goto('/dashboard/reviews')

      await expect(page.getByRole('heading', { name: /Review collector|Colector|Coletor|Kolektor|Сборщик/i })).toBeVisible()
      const filtersRegion = page.locator('section.sb-review-controls[aria-label]')
      await expect(filtersRegion).toBeVisible()
      await expect(filtersRegion).toHaveAttribute('aria-label', /\S+/)
      await expect(page.locator('.sb-review-alert').getByText(guestNotice[locale])).toBeVisible()
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
    await expect(page.locator('.sb-review-alert').getByText(guestNotice.en)).toBeVisible()
    await expect(reviewCards.getByRole('button', { name: /Approve|Clear flag|Flag/i })).toHaveCount(0)
  })
})
