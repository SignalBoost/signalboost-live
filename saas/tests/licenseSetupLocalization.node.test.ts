import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LICENSE_EDITIONS,
  LICENSE_MINT_ERROR_CODES,
  LICENSE_MINT_FEATURE_IDS,
  LICENSE_MINT_REMEDY_CODES,
  LICENSE_MINT_WARNING_CODES,
} from '../lib/supervisor/licenseMintContract'
import { LICENSE_SETUP_COPY } from '../lib/i18n/licenseSetupCopy'

const supportedLocales = ['en', 'es', 'pt', 'pl', 'ru'] as const

function assertLocalizedRecord<Key extends string>(
  locale: (typeof supportedLocales)[number],
  english: Record<Key, string>,
  localized: Record<Key, string>,
  keys: readonly Key[],
  label: string,
) {
  assert.deepEqual(Object.keys(localized).sort(), [...keys].sort(), `${locale}.${label} must keep exact key parity`)
  for (const key of keys) {
    assert.equal(typeof localized[key], 'string', `${locale}.${label}.${key} must be a string`)
    assert.ok(localized[key].trim().length > 0, `${locale}.${label}.${key} must not be empty`)
    if (locale !== 'en') {
      assert.notEqual(localized[key].trim(), english[key].trim(), `${locale}.${label}.${key} still uses English copy`)
    }
  }
}

test('licence setup runtime values are localized in every supported language', () => {
  assert.deepEqual(Object.keys(LICENSE_SETUP_COPY).sort(), [...supportedLocales].sort())

  const english = LICENSE_SETUP_COPY.en
  for (const locale of supportedLocales) {
    const copy = LICENSE_SETUP_COPY[locale]
    assertLocalizedRecord(locale, english.editions, copy.editions, LICENSE_EDITIONS, 'editions')
    assertLocalizedRecord(locale, english.featureLabels, copy.featureLabels, LICENSE_MINT_FEATURE_IDS, 'featureLabels')
    assertLocalizedRecord(locale, english.errors, copy.errors, LICENSE_MINT_ERROR_CODES, 'errors')
    assertLocalizedRecord(locale, english.remedies, copy.remedies, LICENSE_MINT_REMEDY_CODES, 'remedies')
    assertLocalizedRecord(locale, english.warnings, copy.warnings, LICENSE_MINT_WARNING_CODES, 'warnings')
  }
})

test('licence setup page does not render raw API prose or catalogue identifiers', () => {
  const page = readFileSync(new URL('../app/dashboard/supervisor/license/page.tsx', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/api/supervisor/license/mint/route.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(page, /result\?\.(error|remedy|warnings)/)
  assert.doesNotMatch(page, />\{name\}<\/option>/)
  assert.doesNotMatch(page, /features \|\| \[\]\)\.join\(/)

  assert.doesNotMatch(route, /error:\s*['"`]/)
  assert.doesNotMatch(route, /remedy:\s*['"`]/)
  assert.doesNotMatch(route, /warnings:\s*\[/)
  assert.match(route, /errorCode:/)
  assert.match(route, /warningCodes:/)
})
