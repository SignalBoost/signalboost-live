// saas/scripts/verify-cos-locale-parity.mjs
// CI guard for the day-one i18n rule: every cos.* key must exist, with a non-empty value,
// in ALL five locale files. A page/component must never ship English-only. Wire into the
// repo-targeting QA workflow next to verify-route-handlers.mjs.
//
//   node scripts/verify-cos-locale-parity.mjs
//
// Exits non-zero (fails the build) on any missing key, extra key, or empty value.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES = join(__dirname, '..', 'locales')
const LANGS = ['en', 'es', 'pt', 'pl', 'ru']

function load(lang) {
  try {
    return JSON.parse(readFileSync(join(LOCALES, `cos.${lang}.json`), 'utf8'))
  } catch (e) {
    console.error(`✗ cannot read/parse cos.${lang}.json: ${e.message}`)
    process.exit(1)
  }
}

function paths(obj, prefix = '') {
  const out = []
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...paths(v, p))
    else out.push(p)
  }
  return out
}

function valueAt(obj, path) {
  return path.split('.').reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), obj)
}

const dicts = Object.fromEntries(LANGS.map((l) => [l, load(l)]))
const base = paths(dicts.en).sort()
let failures = 0

for (const lang of LANGS) {
  const set = new Set(paths(dicts[lang]))
  for (const key of base) {
    if (!set.has(key)) {
      console.error(`✗ ${lang}: missing key  cos.${key}`)
      failures++
      continue
    }
    const v = valueAt(dicts[lang], key)
    if (typeof v !== 'string' || v.trim() === '') {
      console.error(`✗ ${lang}: empty value cos.${key}`)
      failures++
    }
  }
  for (const key of set) {
    if (!base.includes(key)) {
      console.error(`✗ ${lang}: extra key    cos.${key} (not in en — structure must be identical)`)
      failures++
    }
  }
}

if (failures > 0) {
  console.error(`\nCOS locale parity FAILED: ${failures} problem(s) across ${LANGS.length} languages.`)
  process.exit(1)
}
console.log(`✓ COS locale parity OK — ${base.length} keys × ${LANGS.length} languages, no gaps.`)
