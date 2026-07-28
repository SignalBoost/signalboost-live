import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TARGET_UI_LOCALES,
  placeholderTokens,
  shouldTranslateUiCopy,
} from './generated-ui-locale-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOCALE_DIR = path.join(ROOT, 'locales')

function readLocale(locale) {
  const file = path.join(LOCALE_DIR, `${locale}.json`)
  if (!fs.existsSync(file)) throw new Error(`Missing locale file: locales/${locale}.json`)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  const generatedUi = data?.generatedUi
  if (!generatedUi || typeof generatedUi !== 'object' || Array.isArray(generatedUi)) {
    throw new Error(`locales/${locale}.json must contain a generatedUi object`)
  }
  return generatedUi
}

function tokensMatch(source, target) {
  return JSON.stringify(placeholderTokens(source)) === JSON.stringify(placeholderTokens(target))
}

const english = readLocale('en')
const englishKeys = Object.keys(english).sort()
const failures = []

if (!englishKeys.length) failures.push('English generatedUi dictionary is empty.')

for (const locale of TARGET_UI_LOCALES) {
  const localized = readLocale(locale)
  const localizedKeys = Object.keys(localized).sort()
  const missing = englishKeys.filter(key => !(key in localized))
  const stale = localizedKeys.filter(key => !(key in english))

  if (missing.length) failures.push(`${locale}: ${missing.length} missing generatedUi keys (first: ${missing.slice(0, 8).join(', ')})`)
  if (stale.length) failures.push(`${locale}: ${stale.length} stale generatedUi keys (first: ${stale.slice(0, 8).join(', ')})`)

  let eligible = 0
  let unchanged = 0
  const untranslatedSentences = []

  for (const key of englishKeys) {
    const source = english[key]
    const target = localized[key]
    if (typeof source !== 'string') {
      failures.push(`en:${key} must be a string`)
      continue
    }
    if (typeof target !== 'string' || !target.trim()) {
      failures.push(`${locale}:${key} is empty or not a string`)
      continue
    }
    if (!tokensMatch(source, target)) failures.push(`${locale}:${key} changed a placeholder, URL, email, or code token`)
    if (!shouldTranslateUiCopy(source)) continue

    eligible += 1
    if (target.trim() === source.trim()) {
      unchanged += 1
      const words = source.match(/[A-Za-z]{2,}/g) || []
      if (words.length >= 4 || source.trim().length >= 36) untranslatedSentences.push(key)
    }
  }

  const unchangedRatio = eligible ? unchanged / eligible : 0
  if (untranslatedSentences.length) {
    failures.push(`${locale}: ${untranslatedSentences.length} untranslated sentences remain (first: ${untranslatedSentences.slice(0, 8).join(', ')})`)
  }
  if (unchangedRatio > 0.08) {
    failures.push(`${locale}: ${(unchangedRatio * 100).toFixed(1)}% of translatable generatedUi values remain identical to English`)
  }
}

if (failures.length) {
  for (const failure of failures.slice(0, 120)) console.error(`[validate:i18n-generated-ui] ${failure}`)
  if (failures.length > 120) console.error(`[validate:i18n-generated-ui] ...and ${failures.length - 120} more failures`)
  process.exit(1)
}

console.log(`[validate:i18n-generated-ui] PASS — ${englishKeys.length} generated UI keys are complete across en/es/pt/pl/ru.`)
