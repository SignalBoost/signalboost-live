import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  normalizeSupportedLanguage,
} from '../lib/i18n/supportedLanguages.ts'
import { resolveResponseLanguage } from '../lib/i18n/responseLanguage.ts'

const ROOT = process.cwd()

test('platform exposes exactly five first-class languages', () => {
  assert.deepEqual([...SUPPORTED_LANGUAGES], ['en', 'es', 'pt', 'pl', 'ru'])
  assert.equal(DEFAULT_LANGUAGE, 'en')
})

test('BCP-47 and regional variants normalize into the five platform languages', () => {
  assert.equal(normalizeSupportedLanguage('en-US'), 'en')
  assert.equal(normalizeSupportedLanguage('es-MX'), 'es')
  assert.equal(normalizeSupportedLanguage('pt-BR'), 'pt')
  assert.equal(normalizeSupportedLanguage('pl-PL'), 'pl')
  assert.equal(normalizeSupportedLanguage('ru-RU'), 'ru')
  assert.equal(normalizeSupportedLanguage('de-DE'), 'en')
})

test('current prompt language outranks UI locale unless user explicitly requests another output language', () => {
  const polish = 'Mam 9 godzin w Amsterdamie. Ląduję na Schiphol i chcę tani plan zwiedzania oraz transport.'
  assert.equal(resolveResponseLanguage(polish, 'en'), 'pl')
  assert.equal(resolveResponseLanguage(`${polish} Odpowiedz po angielsku.`, 'pl'), 'en')
})

test('five-language platform build gate covers all major locale stores', () => {
  const gate = readFileSync(join(ROOT, 'scripts/check-five-language-platform.mjs'), 'utf8')
  for (const fragment of [
    "locales/${lang}.json",
    "locales/pages.${lang}.json",
    "lib/i18n/console.${lang}.json",
    "lib/i18n/audit.${lang}.json",
    'lib/i18n/onboardingLocales.json',
    'lib/i18n/marketingSalesLocales.json',
    'lib/i18n/auditCenterLocales.json',
    'lib/i18n/supervisorSocLocales.json',
    'lib/i18n/homepageLocales.json',
    'lib/i18n/homepageUiLocales.ts',
    'lib/i18n/platformCopy.ts',
  ]) assert.ok(gate.includes(fragment), `missing gate coverage for ${fragment}`)
})

test('prebuild blocks deployment on production i18n regressions', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.match(pkg.scripts['validate:i18n-platform'], /check-generated-ui-locale-completeness\.mjs/)
  assert.match(pkg.scripts['validate:i18n-platform'], /check-five-language-platform\.mjs/)
  assert.match(pkg.scripts['validate:i18n-platform'], /cosResponseLanguage\.node\.test\.ts/)
  assert.match(pkg.scripts['validate:i18n-platform'], /platformFiveLanguageI18n\.node\.test\.ts/)
  assert.doesNotMatch(pkg.scripts['validate:i18n-platform'], /check-hardcoded-copy\.mjs/)
  assert.doesNotMatch(pkg.scripts['validate:i18n-platform'], /migrate-page-copy-to-locales/)
  assert.match(pkg.scripts['audit:i18n-hardcoded'], /check-hardcoded-copy\.mjs/)
  assert.match(pkg.scripts['audit:i18n-migration'], /migrate-page-copy-to-locales\.mjs/)
  assert.match(pkg.scripts.prebuild, /validate:i18n-platform/)
})

test('zero hardcoded-English debt remains grandfathered', () => {
  const baseline = JSON.parse(readFileSync(join(ROOT, 'scripts/i18n-hardcoded-baseline.json'), 'utf8'))
  assert.equal(baseline.fileCount, 0)
  assert.deepEqual(baseline.files, {})
})
