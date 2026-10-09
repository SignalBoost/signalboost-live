import test from 'node:test'
import assert from 'node:assert/strict'
import { INTERNATIONAL_LOCALES, canonicalIntlLocale, formatLocalizedNumber, formatLocalizedDate, languageDirection } from '../lib/i18n/internationalFormatting.ts'

test('all eleven planned language codes have deterministic Intl mappings', () => {
  assert.deepEqual(Object.keys(INTERNATIONAL_LOCALES), ['en','es','pt','pl','ru','de','fr','it','ja','ko','ar'])
  for (const [key, tag] of Object.entries(INTERNATIONAL_LOCALES)) {
    assert.equal(canonicalIntlLocale(key.toUpperCase()+'-XX'), tag)
    assert.ok(formatLocalizedNumber(12345.67, key).length > 0)
    assert.ok(formatLocalizedDate(new Date('2026-10-08T00:00:00Z'), key, {year:'numeric'}).length > 0)
  }
})
test('Arabic is RTL; code and unknown locales default safely', () => {
  assert.equal(languageDirection('ar-SA'),'rtl')
  assert.equal(languageDirection('ja-JP'),'ltr')
  assert.equal(canonicalIntlLocale('unsupported'),'en-US')
})
