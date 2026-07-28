import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TARGET_UI_LOCALES, placeholderTokens } from './generated-ui-locale-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOCALE_DIR = path.join(ROOT, 'locales')
const TOKEN_PATTERN = /\{\{[^{}]+\}\}|\$\{[^{}]+\}|\{[^{}]+\}|%(?:\d+\$)?[sdif]|https?:\/\/[^\s)\]}]+|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|`[^`]+`/g

function readLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, `${locale}.json`), 'utf8'))
}

function writeLocale(locale, data) {
  fs.writeFileSync(path.join(LOCALE_DIR, `${locale}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function tokensMatch(source, target) {
  return JSON.stringify(placeholderTokens(source)) === JSON.stringify(placeholderTokens(target))
}

function tokensInOrder(value) {
  return [...String(value).matchAll(TOKEN_PATTERN)].map(match => match[0])
}

function restoreSourceTokens(source, target) {
  const sourceTokens = tokensInOrder(source)
  const targetTokens = tokensInOrder(target)
  if (sourceTokens.length !== targetTokens.length) {
    throw new Error(`Cannot repair token count ${targetTokens.length}; expected ${sourceTokens.length}.`)
  }

  let index = 0
  return String(target).replace(TOKEN_PATTERN, () => sourceTokens[index++])
}

const englishData = readLocale('en')
const english = englishData.generatedUi
if (!english || typeof english !== 'object' || Array.isArray(english)) {
  throw new Error('English generatedUi dictionary is missing.')
}

for (const locale of TARGET_UI_LOCALES) {
  const data = readLocale(locale)
  const localized = data.generatedUi
  if (!localized || typeof localized !== 'object' || Array.isArray(localized)) {
    throw new Error(`${locale} generatedUi dictionary is missing.`)
  }

  let repaired = 0
  for (const [key, source] of Object.entries(english)) {
    const target = localized[key]
    if (typeof source !== 'string' || typeof target !== 'string' || tokensMatch(source, target)) continue
    const restored = restoreSourceTokens(source, target)
    if (!tokensMatch(source, restored)) throw new Error(`${locale}:${key} token repair did not converge.`)
    localized[key] = restored
    repaired += 1
  }

  if (repaired) writeLocale(locale, data)
  console.log(`[repair:i18n-generated-ui] ${locale}: repaired ${repaired} token mismatch${repaired === 1 ? '' : 'es'}.`)
}
