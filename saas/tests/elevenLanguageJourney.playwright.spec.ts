import { expect, test } from '@playwright/test'
import { PUBLIC_COPY } from '../lib/seo/publicCopy.ts'

const locales = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'] as const
const topics = ['ai-website-builder', 'customer-reviews', 'ai-content', 'ai-lab'] as const

test.describe('eleven-language public route acceptance', () => {
  for (const locale of locales) {
    test(`${locale}: home, every topic, mobile navigation, and durable preference`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      for (const topic of topics) {
        await page.goto(`/${locale}/${topic}`)
        const nav = page.locator('[data-localized-public-navbar]')
        await expect(nav).toHaveAttribute('lang', locale)
        await expect(nav).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
        const mobile = nav.locator('[data-mobile-public-menu]')
        await mobile.locator('summary').click()
        await expect(mobile.locator(`a[href="/${locale}/${topic}"]`)).toHaveAttribute('aria-current', 'page')
        await expect(mobile.getByRole('combobox', { name: PUBLIC_COPY[locale].languages })).toHaveValue(locale)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        expect(overflow, `${locale}/${topic} horizontal overflow`).toBeLessThanOrEqual(2)
      }
      await page.goto(`/${locale}`)
      await expect(page.locator('[data-localized-public-navbar]')).toHaveAttribute('lang', locale)
      await expect.poll(async () => page.evaluate(() => localStorage.getItem('signalboost_language'))).toBe(locale)
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
      await page.goto('/dashboard/reviews')
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
    })
  }

  test('mobile language switch retains the selected product topic and RTL direction', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/ar/ai-content')
    const mobile = page.locator('[data-mobile-public-menu]')
    await mobile.locator('summary').click()
    await mobile.getByRole('combobox', { name: PUBLIC_COPY.ar.languages }).selectOption('ja')
    await expect(page).toHaveURL(/\/ja\/ai-content\/?$/)
    await expect(page.locator('[data-localized-public-navbar]')).toHaveAttribute('dir', 'ltr')
  })
})
