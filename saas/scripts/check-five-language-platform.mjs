import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LANGS = ['en', 'es', 'pt', 'pl', 'ru']

const failures = []

function fail(message) {
  failures.push(message)
}

function readText(rel) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) {
    fail(`missing required i18n file: ${rel}`)
    return ''
  }
  return fs.readFileSync(full, 'utf8')
}

function readJson(rel) {
  const raw = readText(rel)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    fail(`${rel}: invalid JSON (${error instanceof Error ? error.message : String(error)})`)
    return null
  }
}

function flattenLeaves(value, prefix = '', out = new Set()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) out.add(prefix)
    return out
  }
  for (const [key, child] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) flattenLeaves(child, next, out)
    else out.add(next)
  }
  return out
}

function compareKeyParity(label, byLanguage) {
  const english = byLanguage.en
  if (!english) return
  const base = flattenLeaves(english)
  for (const lang of LANGS) {
    const current = byLanguage[lang]
    if (!current) {
      fail(`${label}: missing ${lang}`)
      continue
    }
    const keys = flattenLeaves(current)
    const missing = [...base].filter(key => !keys.has(key))
    const extra = [...keys].filter(key => !base.has(key))
    if (missing.length) fail(`${label}/${lang}: ${missing.length} missing keys (first: ${missing.slice(0, 8).join(', ')})`)
    if (extra.length) fail(`${label}/${lang}: ${extra.length} extra keys (first: ${extra.slice(0, 8).join(', ')})`)
  }
}

function loadPerLanguageGroup(label, pathForLanguage) {
  const byLanguage = {}
  for (const lang of LANGS) {
    const rel = pathForLanguage(lang)
    const parsed = readJson(rel)
    if (parsed) byLanguage[lang] = parsed
  }
  compareKeyParity(label, byLanguage)
}

function validateCombinedCatalog(rel) {
  const parsed = readJson(rel)
  if (!parsed) return
  const present = Object.keys(parsed).filter(key => LANGS.includes(key))
  for (const lang of LANGS) if (!(lang in parsed)) fail(`${rel}: missing top-level locale ${lang}`)
  if (present.length !== LANGS.length) fail(`${rel}: expected exactly five supported locale blocks`)
  compareKeyParity(rel, Object.fromEntries(LANGS.map(lang => [lang, parsed[lang] || {}])))
}

function topLevelLocaleBlocks(rel) {
  const source = readText(rel)
  const found = new Set()
  for (const match of source.matchAll(/^  (en|es|pt|pl|ru):\s*\{/gm)) found.add(match[1])
  for (const lang of LANGS) if (!found.has(lang)) fail(`${rel}: missing top-level ${lang} locale block`)
}

loadPerLanguageGroup('main locales', lang => `locales/${lang}.json`)
loadPerLanguageGroup('page locales', lang => `locales/pages.${lang}.json`)
loadPerLanguageGroup('console locales', lang => `lib/i18n/console.${lang}.json`)
loadPerLanguageGroup('audit locales', lang => `lib/i18n/audit.${lang}.json`)

for (const rel of [
  'lib/i18n/onboardingLocales.json',
  'lib/i18n/marketingSalesLocales.json',
  'lib/i18n/auditCenterLocales.json',
  'lib/i18n/supervisorSocLocales.json',
  'lib/i18n/homepageLocales.json',
]) validateCombinedCatalog(rel)

topLevelLocaleBlocks('lib/i18n/homepageUiLocales.ts')
topLevelLocaleBlocks('lib/i18n/platformCopy.ts')

const supported = readText('lib/i18n/supportedLanguages.ts')
if (!/SUPPORTED_LANGUAGES\s*=\s*\['en', 'es', 'pt', 'pl', 'ru'\]/.test(supported)) {
  fail('lib/i18n/supportedLanguages.ts must define exactly en/es/pt/pl/ru in canonical order')
}

const responseLanguage = readText('lib/i18n/responseLanguage.ts')
if (!responseLanguage.includes("from './supportedLanguages.ts'")) {
  fail('responseLanguage.ts must consume the canonical supported-language contract')
}

const provider = readText('components/i18n/I18nProvider.tsx')
if (!provider.includes("from '@/lib/i18n/supportedLanguages'")) {
  fail('I18nProvider must consume the canonical supported-language contract')
}
if (/const\s+SUPPORTED_LANGS\s*=/.test(provider)) {
  fail('I18nProvider must not define a competing local supported-language list')
}

const suggestion = readText('components/LanguageSuggestion.tsx')
if (!suggestion.includes("from '@/lib/i18n/supportedLanguages'")) {
  fail('LanguageSuggestion must consume the canonical supported-language contract')
}
if (/const\s+SUPPORTED_LANGUAGES\s*=/.test(suggestion)) {
  fail('LanguageSuggestion must not define a competing local supported-language list')
}

const loader = readText('lib/i18n/loadLanguage.ts')
if (!loader.includes("normalizeSupportedLanguage")) {
  fail('loadLanguage must normalize through the canonical five-language contract')
}
for (const lang of LANGS) {
  if (!loader.includes(`${lang}: () => import('@/locales/${lang}.json')`)) {
    fail(`loadLanguage: missing main dictionary registration for ${lang}`)
  }
}

const browser = readText('app/api/cos-browser/route.ts')
if (!browser.includes('resolveResponseLanguage(prompt, body?.context?.language)')) {
  fail('cos-browser must resolve response language from current prompt before UI locale fallback')
}

const primary = readText('app/api/cos-primary/route.ts')
if (!primary.includes('resolveResponseLanguage(input,body?.context?.language)')) {
  fail('cos-primary must use the shared prompt-first response-language resolver')
}

const generatedUtils = readText('scripts/generated-ui-locale-utils.mjs')
if (!/UI_LOCALES\s*=\s*\['en', 'es', 'pt', 'pl', 'ru'\]/.test(generatedUtils)) {
  fail('generated UI locale tooling must target exactly en/es/pt/pl/ru')
}

const hardcodedMap = readText('lib/i18n/hardcoded-ui-copy.ts')
for (const lang of ['es', 'pt', 'pl', 'ru']) {
  if (!hardcodedMap.includes(`  ${lang}: {`)) fail(`hardcoded UI safety net missing ${lang}`)
}

const baseline = readJson('scripts/i18n-hardcoded-baseline.json')
if (baseline) {
  const count = Number(baseline.fileCount || 0)
  const files = baseline.files && typeof baseline.files === 'object' ? Object.keys(baseline.files) : []
  if (count !== 0 || files.length !== 0) {
    fail(`hardcoded UI debt baseline must remain zero; found fileCount=${count}, files=${files.length}`)
  }
}

if (failures.length) {
  for (const item of failures) console.error(`[validate:i18n-platform] ${item}`)
  process.exit(1)
}

console.log('[validate:i18n-platform] PASS — EN/ES/PT/PL/RU are complete and aligned across platform locale stores and runtime language routing.')
