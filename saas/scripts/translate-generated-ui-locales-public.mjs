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
const WRITE = process.argv.includes('--write')
const localeArgument = process.argv.find(argument => argument.startsWith('--locale='))
const REQUEST_TIMEOUT_MS = Number(process.env.TRANSLATION_REQUEST_TIMEOUT_MS || 30000)
const BATCH_MAX_ITEMS = Number(process.env.TRANSLATION_BATCH_MAX_ITEMS || 40)
const BATCH_MAX_CHARS = Number(process.env.TRANSLATION_BATCH_MAX_CHARS || 5000)

const TOKEN_PATTERN = /\{\{[^{}]+\}\}|\$\{[^{}]+\}|\{[^{}]+\}|%(?:\d+\$)?[sdif]|https?:\/\/[^\s)\]}]+|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|`[^`]+`/g
const MARKER_PATTERN = /__SB_ENTRY_(\d{5})__/g
const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

function readLocale(locale) {
  return JSON.parse(fs.readFileSync(path.join(LOCALE_DIR, `${locale}.json`), 'utf8'))
}

function writeLocale(locale, data) {
  fs.writeFileSync(path.join(LOCALE_DIR, `${locale}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function collectAlignedPairs(english, localized, out) {
  if (typeof english === 'string' && typeof localized === 'string') {
    const source = english.trim()
    const target = localized.trim()
    if (source && target && source !== target && !out.has(source)) out.set(source, target)
    return
  }

  if (Array.isArray(english) && Array.isArray(localized)) {
    const length = Math.min(english.length, localized.length)
    for (let index = 0; index < length; index += 1) collectAlignedPairs(english[index], localized[index], out)
    return
  }

  if (!english || !localized || typeof english !== 'object' || typeof localized !== 'object') return
  for (const key of Object.keys(english)) {
    if (key in localized) collectAlignedPairs(english[key], localized[key], out)
  }
}

function maskValue(value) {
  const replacements = []
  const masked = value.replace(TOKEN_PATTERN, token => {
    const marker = `__SB_TOKEN_${String(replacements.length).padStart(3, '0')}__`
    replacements.push([marker, token])
    return marker
  })
  return { masked, replacements }
}

function restoreValue(value, replacements) {
  let restored = value
  for (const [marker, token] of replacements) restored = restored.split(marker).join(token)
  return restored
}

function preserveWhitespace(source, translated) {
  const leading = source.match(/^\s*/)?.[0] || ''
  const trailing = source.match(/\s*$/)?.[0] || ''
  return `${leading}${translated.trim()}${trailing}`
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get('retry-after') || 0)
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 60000)
  return Math.min(1500 * (2 ** attempt), 30000)
}

function translatedTextFromResponse(data) {
  const segments = data?.[0]
  if (!Array.isArray(segments)) throw new Error('Translation response did not contain text segments.')
  const text = segments
    .map(segment => (Array.isArray(segment) && typeof segment[0] === 'string' ? segment[0] : ''))
    .join('')
  if (!text.trim()) throw new Error('Translation response was empty.')
  return text
}

async function requestTranslation(locale, text, attempt = 0) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response

  try {
    const body = new URLSearchParams({
      client: 'gtx',
      sl: 'en',
      tl: locale,
      dt: 't',
      q: text,
    })

    response = await fetch(GOOGLE_TRANSLATE_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'SignalBoost-Locale-Completion/1.0',
      },
      body,
    })
  } catch (error) {
    clearTimeout(timeout)
    if (attempt < 6) {
      await sleep(Math.min(1500 * (2 ** attempt), 30000))
      return requestTranslation(locale, text, attempt + 1)
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Public translation request failed for ${locale}: ${reason}`)
  }

  clearTimeout(timeout)
  if (!response.ok) {
    const body = await response.text()
    if ((response.status === 429 || response.status >= 500) && attempt < 6) {
      await sleep(retryDelay(response, attempt))
      return requestTranslation(locale, text, attempt + 1)
    }
    throw new Error(`Public translation request failed for ${locale} (${response.status}): ${body.slice(0, 500)}`)
  }

  return translatedTextFromResponse(await response.json())
}

function createBatches(items) {
  const batches = []
  let current = []
  let chars = 0

  for (const item of items) {
    const itemChars = item.masked.length + 24
    if (current.length && (current.length >= BATCH_MAX_ITEMS || chars + itemChars > BATCH_MAX_CHARS)) {
      batches.push(current)
      current = []
      chars = 0
    }
    current.push(item)
    chars += itemChars
  }

  if (current.length) batches.push(current)
  return batches
}

function parseMarkedTranslations(text, batch) {
  const matches = [...text.matchAll(MARKER_PATTERN)]
  if (matches.length !== batch.length) {
    throw new Error(`Expected ${batch.length} translation markers but received ${matches.length}.`)
  }

  const values = new Map()
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const start = match.index + match[0].length
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length
    const id = `v_${match[1]}`
    values.set(id, text.slice(start, end).trim())
  }
  return values
}

function validateAndRestore(locale, item, translated) {
  if (typeof translated !== 'string' || !translated.trim()) {
    throw new Error(`Missing translated value for ${locale}:${item.id}`)
  }
  const restored = restoreValue(translated, item.replacements)
  const sourceTokens = JSON.stringify(placeholderTokens(item.source))
  const targetTokens = JSON.stringify(placeholderTokens(restored))
  if (sourceTokens !== targetTokens) throw new Error(`Placeholder mismatch for ${locale}:${item.id}`)
  return preserveWhitespace(item.source, restored)
}

async function translateBatch(locale, batch) {
  try {
    if (batch.length === 1) {
      const translated = await requestTranslation(locale, batch[0].masked)
      return new Map([[batch[0].source, validateAndRestore(locale, batch[0], translated)]])
    }

    const payload = batch
      .map(item => `__SB_ENTRY_${item.id.slice(2)}__\n${item.masked}`)
      .join('\n')
    const translatedText = await requestTranslation(locale, payload)
    const translatedValues = parseMarkedTranslations(translatedText, batch)
    const translated = new Map()

    for (const item of batch) {
      translated.set(item.source, validateAndRestore(locale, item, translatedValues.get(item.id)))
    }
    return translated
  } catch (error) {
    if (batch.length === 1) throw error
    const middle = Math.ceil(batch.length / 2)
    const left = await translateBatch(locale, batch.slice(0, middle))
    const right = await translateBatch(locale, batch.slice(middle))
    return new Map([...left, ...right])
  }
}

async function buildLocale(locale, englishData, localizedData) {
  const english = englishData.generatedUi
  if (!english || typeof english !== 'object' || Array.isArray(english)) {
    throw new Error('English generatedUi dictionary is missing.')
  }

  const existing = localizedData.generatedUi && typeof localizedData.generatedUi === 'object' && !Array.isArray(localizedData.generatedUi)
    ? localizedData.generatedUi
    : {}
  const knownTranslations = new Map()
  collectAlignedPairs(englishData, localizedData, knownTranslations)

  const resolvedBySource = new Map()
  const missing = []
  const seen = new Set()

  for (const [key, source] of Object.entries(english)) {
    if (typeof source !== 'string') throw new Error(`English generatedUi.${key} must be a string.`)
    const current = existing[key]

    if (typeof current === 'string' && current.trim() && current.trim() !== source.trim()) {
      resolvedBySource.set(source, current)
      continue
    }

    if (!shouldTranslateUiCopy(source)) {
      resolvedBySource.set(source, source)
      continue
    }

    const known = knownTranslations.get(source.trim())
    if (known) {
      resolvedBySource.set(source, preserveWhitespace(source, known))
      continue
    }

    if (seen.has(source)) continue
    seen.add(source)
    const { masked, replacements } = maskValue(source.trim())
    missing.push({
      id: `v_${String(missing.length).padStart(5, '0')}`,
      source,
      masked,
      replacements,
    })
  }

  const batches = createBatches(missing)
  console.log(`[i18n-public] ${locale}: ${Object.keys(english).length} keys, ${missing.length} unique translations, ${batches.length} batches.`)

  for (let index = 0; index < batches.length; index += 1) {
    console.log(`[i18n-public] ${locale}: batch ${index + 1}/${batches.length} (${batches[index].length} values)`)
    const translated = await translateBatch(locale, batches[index])
    for (const [source, value] of translated) resolvedBySource.set(source, value)
  }

  const generatedUi = {}
  for (const [key, source] of Object.entries(english)) generatedUi[key] = resolvedBySource.get(source) ?? source
  return { ...localizedData, generatedUi }
}

function selectedLocales() {
  if (!localeArgument) return TARGET_UI_LOCALES
  const locales = localeArgument.slice('--locale='.length).split(',').map(locale => locale.trim()).filter(Boolean)
  if (!locales.length) throw new Error('--locale must name at least one target locale.')
  const invalid = locales.filter(locale => !TARGET_UI_LOCALES.includes(locale))
  if (invalid.length) throw new Error(`Unsupported target locale(s): ${invalid.join(', ')}`)
  return [...new Set(locales)]
}

async function main() {
  if (!WRITE) throw new Error('Run with --write to update locale files.')
  const locales = selectedLocales()
  const englishData = readLocale('en')
  const localizedData = Object.fromEntries(locales.map(locale => [locale, readLocale(locale)]))

  for (const locale of locales) {
    const data = await buildLocale(locale, englishData, localizedData[locale])
    writeLocale(locale, data)
  }

  console.log(`[i18n-public] Updated generatedUi catalogs: ${locales.join(', ')}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
