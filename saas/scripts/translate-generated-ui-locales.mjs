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
const REPO_ROOT = path.resolve(ROOT, '..')
const LOCALE_DIR = path.join(ROOT, 'locales')
const TEMP_WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'complete-generated-ui-locales.yml')
const WRITE = process.argv.includes('--write')
const localeArgument = process.argv.find(argument => argument.startsWith('--locale='))
const REQUEST_TIMEOUT_MS = Number(process.env.TRANSLATION_REQUEST_TIMEOUT_MS || 60000)

const LANGUAGE_NAMES = {
  es: 'natural, neutral Latin American Spanish',
  pt: 'natural Brazilian Portuguese',
  pl: 'natural Polish',
  ru: 'natural Russian',
}

const TOKEN_PATTERN = /\{\{[^{}]+\}\}|\$\{[^{}]+\}|\{[^{}]+\}|%(?:\d+\$)?[sdif]|https?:\/\/[^\s)\]}]+|\b[^\s@]+@[^\s@]+\.[^\s@]+\b|`[^`]+`/g

let cachedModelConfig
let activeRequests = 0
const requestWaiters = []

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
    const marker = `__SB_TOKEN_${replacements.length}__`
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

function modelConfig() {
  if (cachedModelConfig) return cachedModelConfig

  if (process.env.OPENAI_API_KEY) {
    cachedModelConfig = {
      provider: 'OpenAI',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      token: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini',
      maxTokens: 10000,
      maxChars: 8000,
      maxItems: 80,
      requestConcurrency: 8,
    }
    return cachedModelConfig
  }

  if (process.env.GITHUB_TOKEN) {
    cachedModelConfig = {
      provider: 'GitHub Models',
      endpoint: 'https://models.github.ai/inference/chat/completions',
      token: process.env.GITHUB_TOKEN,
      model: process.env.GITHUB_MODELS_MODEL || 'openai/gpt-4o-mini',
      maxTokens: 8000,
      maxChars: 6000,
      maxItems: 60,
      requestConcurrency: 4,
    }
    return cachedModelConfig
  }

  throw new Error('OPENAI_API_KEY or GITHUB_TOKEN is required to generate missing locale copy.')
}

async function withRequestSlot(task) {
  const { requestConcurrency } = modelConfig()
  if (activeRequests >= requestConcurrency) {
    await new Promise(resolve => requestWaiters.push(resolve))
  }

  activeRequests += 1
  try {
    return await task()
  } finally {
    activeRequests -= 1
    requestWaiters.shift()?.()
  }
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get('retry-after') || 0)
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 120000)
  return Math.min(2000 * (2 ** attempt), 60000)
}

async function requestTranslation(locale, payload, attempt = 0) {
  const config = modelConfig()
  let response

  try {
    response = await withRequestSlot(async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        return await fetch(config.endpoint, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            max_tokens: config.maxTokens,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `You are a professional SaaS product localization editor. Translate every JSON string value into ${LANGUAGE_NAMES[locale]}. Keep every JSON key exactly unchanged. Preserve placeholders such as __SB_TOKEN_0__, URLs, code, acronyms, provider names, product names, and technical identifiers exactly. Translate visible interface wording naturally and concisely. Return one valid JSON object only, containing every input key and no commentary.`,
              },
              { role: 'user', content: JSON.stringify(payload) },
            ],
          }),
        })
      } finally {
        clearTimeout(timeout)
      }
    })
  } catch (error) {
    if (attempt < 7) {
      await sleep(Math.min(2000 * (2 ** attempt), 60000))
      return requestTranslation(locale, payload, attempt + 1)
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Translation request failed for ${locale}: ${reason}`)
  }

  if (!response.ok) {
    const body = await response.text()
    if ((response.status === 429 || response.status >= 500) && attempt < 7) {
      await sleep(retryDelay(response, attempt))
      return requestTranslation(locale, payload, attempt + 1)
    }
    throw new Error(`Translation request failed for ${locale} (${response.status}): ${body.slice(0, 1200)}`)
  }

  const data = await response.json()
  const raw = data?.choices?.[0]?.message?.content?.trim() || ''
  const clean = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const parsed = JSON.parse(clean)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Translation response for ${locale} was not a JSON object.`)
  }
  return parsed
}

function createBatches(items) {
  const config = modelConfig()
  const batches = []
  let current = []
  let chars = 2

  for (const item of items) {
    const itemChars = item.id.length + item.masked.length + 8
    if (current.length && (current.length >= config.maxItems || chars + itemChars > config.maxChars)) {
      batches.push(current)
      current = []
      chars = 2
    }
    current.push(item)
    chars += itemChars
  }

  if (current.length) batches.push(current)
  return batches
}

function shouldSplitBatch(error) {
  const message = error instanceof Error ? error.message : String(error)
  return !message.startsWith('Translation request failed for')
}

async function translateBatch(locale, batch) {
  try {
    const payload = Object.fromEntries(batch.map(item => [item.id, item.masked]))
    const result = await requestTranslation(locale, payload)
    const translated = new Map()

    for (const item of batch) {
      const value = result[item.id]
      if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing translated value for ${locale}:${item.id}`)
      const restored = restoreValue(value, item.replacements)
      const sourceTokens = JSON.stringify(placeholderTokens(item.source))
      const targetTokens = JSON.stringify(placeholderTokens(restored))
      if (sourceTokens !== targetTokens) throw new Error(`Placeholder mismatch for ${locale}:${item.id}`)
      translated.set(item.source, preserveWhitespace(item.source, restored))
    }

    return translated
  } catch (error) {
    if (batch.length === 1 || !shouldSplitBatch(error)) throw error
    const middle = Math.ceil(batch.length / 2)
    const [left, right] = await Promise.all([
      translateBatch(locale, batch.slice(0, middle)),
      translateBatch(locale, batch.slice(middle)),
    ])
    return new Map([...left, ...right])
  }
}

async function buildLocale(locale, englishData, localizedData) {
  const english = englishData.generatedUi
  if (!english || typeof english !== 'object' || Array.isArray(english)) throw new Error('English generatedUi dictionary is missing.')

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
  console.log(`[i18n] ${locale}: ${Object.keys(english).length} keys, ${missing.length} unique translations, ${batches.length} batches.`)

  const batchResults = await Promise.all(batches.map(async (batch, index) => {
    console.log(`[i18n] ${locale}: batch ${index + 1}/${batches.length} (${batch.length} values)`)
    return translateBatch(locale, batch)
  }))

  for (const translated of batchResults) {
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

  const config = modelConfig()
  const locales = selectedLocales()
  console.log(`[i18n] Provider: ${config.provider}; model: ${config.model}; request concurrency: ${config.requestConcurrency}.`)

  const englishData = readLocale('en')
  const localizedData = Object.fromEntries(locales.map(locale => [locale, readLocale(locale)]))

  await Promise.all(locales.map(async locale => {
    const data = await buildLocale(locale, englishData, localizedData[locale])
    writeLocale(locale, data)
  }))

  if (process.env.REMOVE_TRIGGER_WORKFLOW === '1' && fs.existsSync(TEMP_WORKFLOW_PATH)) {
    fs.rmSync(TEMP_WORKFLOW_PATH)
  }

  console.log(`[i18n] Completed ${Object.keys(englishData.generatedUi).length} generated UI keys for ${locales.join('/')}.`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : error)
  process.exit(1)
})
