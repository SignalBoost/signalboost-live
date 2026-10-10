import { expect, test } from '@playwright/test'
import { normalizeReportLang, reportLangFromCookie } from '../lib/i18n/reportLanguage.ts'

const locales = ['en','es','pt','pl','ru','de','fr','it','ja','ko','ar'] as const

test.describe('report, notification, and dashboard locale contract', () => {
  test('accepts the eleven languages and regional locale subtags only', () => {
    for (const locale of locales) {
      expect(normalizeReportLang(locale)).toBe(locale)
      expect(normalizeReportLang(locale + '-XX')).toBe(locale)
      expect(reportLangFromCookie('signalboost_language=' + locale + '; other=1')).toBe(locale)
    }
    for (const invalid of ['arabic','arbitrary','english','espana','korean','unknown','']) {
      expect(normalizeReportLang(invalid)).toBe('en')
    }
    expect(reportLangFromCookie('signalboost_language=%ZZ')).toBe('en')
    expect(reportLangFromCookie('site-language=pt_BR')).toBe('pt')
    expect(reportLangFromCookie('unrelated=ar')).toBe('en')
  })

  for (const locale of locales) {
    test(`${locale}: dashboard preserves selected language after navigation`, async ({ page }) => {
      await page.addInitScript(lang => localStorage.setItem('signalboost_language', lang), locale)
      await page.route('**/api/reviews', route => route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Unauthorized"}' }))
      await page.goto('/dashboard/reviews')
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
      await expect.poll(() => page.evaluate(() => document.cookie)).toContain('signalboost_language=' + locale)
      await page.goto('/dashboard/lab')
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr')
    })
  }
})
