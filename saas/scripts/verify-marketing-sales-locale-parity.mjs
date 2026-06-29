// saas/scripts/verify-marketing-sales-locale-parity.mjs
// CI guard for the day-one i18n rule: every Marketing-Sales key must exist, with a
// non-empty value, in ALL five languages. A page/component must never ship
// English-only. Zero dependencies (node only). Run from the repo root or saas/:
//
//   node saas/scripts/verify-marketing-sales-locale-parity.mjs
//
// Exits non-zero (fails the build) on any missing key, extra key, or empty value.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '..', 'marketing-sales-core', 'i18n', 'data')
const LANGS = ['en', 'es', 'pt', 'pl', 'ru']

function load(lang) {
  try {
    return JSON.parse(readFileSync(join(DATA, `${lang}.json`), 'utf8'))
  } catch (e) {
    console.error(`✗ cannot read/parse ${lang}.json: ${e.message}`)
    process.exit(1)
  }
}

const dicts = Object.fromEntries(LANGS.map((l) => [l, load(l)]))
const base = Object.keys(dicts.en).sort()
let failures = 0

for (const lang of LANGS) {
  const keys = new Set(Object.keys(dicts[lang]))
  for (const key of base) {
    if (!keys.has(key)) { console.error(`✗ ${lang}: missing key  ${key}`); failures++; continue }
    const v = dicts[lang][key]
    if (typeof v !== 'string' || v.trim() === '') { console.error(`✗ ${lang}: empty value ${key}`); failures++ }
  }
  for (const key of keys) {
    if (!base.includes(key)) { console.error(`✗ ${lang}: extra key    ${key} (not in en — structure must be identical)`); failures++ }
  }
}

if (failures > 0) {
  console.error(`\nMarketing-Sales locale parity FAILED: ${failures} problem(s) across ${LANGS.length} languages.`)
  process.exit(1)
}
console.log(`✓ Marketing-Sales locale parity OK — ${base.length} keys × ${LANGS.length} languages, no gaps.`)
