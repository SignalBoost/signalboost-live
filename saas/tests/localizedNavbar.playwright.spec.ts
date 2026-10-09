import { expect, test } from '@playwright/test'
import { PUBLIC_COPY } from '../lib/seo/publicCopy.ts'

const expandedLocales = ['de', 'fr', 'it', 'ja', 'ko', 'ar'] as const

test.describe('localized public navbar', () => {
  for (const locale of expandedLocales) {
    test(`${locale} navbar uses page-language labels and route-specific topic links`, async ({ page }) => {
      await page.goto(`/${locale}/ai-lab`)
      const navbar = page.locator('[data-localized-public-navbar]')
      await expect(navbar).toBeVisible()
      await expect(navbar).toHaveAttribute('lang', locale)
      await expect(navbar).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
      await expect(navbar.getByRole('link', { name: PUBLIC_COPY[locale].home, exact: true })).toBeVisible()
      await expect(navbar.getByRole('link', { name: PUBLIC_COPY[locale].labTitle, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(navbar.getByRole('link', { name: PUBLIC_COPY[locale].reviewsTitle, exact: true })).toHaveAttribute('href', `/${locale}/customer-reviews`)
      await expect(navbar.getByRole('combobox', { name: PUBLIC_COPY[locale].languages })).toHaveValue(locale)
    })
  }

  test('language switcher retains the current topic', async ({ page }) => {
    await page.goto('/de/ai-lab')
    await page.locator('[data-localized-public-navbar] select').selectOption('fr')
    await expect(page).toHaveURL(/\/fr\/ai-lab\/?$/)
    await expect(page.locator('[data-localized-public-navbar]')).toHaveAttribute('lang', 'fr')
    await expect(page.locator('[data-localized-public-navbar]').getByRole('link', { name: PUBLIC_COPY.fr.home, exact: true })).toBeVisible()
  })
})
