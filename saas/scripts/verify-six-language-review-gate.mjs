// Release gate for six-language translation packages. No paid API calls.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { placeholderTokens } from './generated-ui-locale-utils.mjs'

export const LANGUAGES = ['de', 'fr', 'it', 'ja', 'ko', 'ar']
const INVALID = /^(?:TODO|TBD|PLACEHOLDER|\?\?\?|TRANSLATE(?: ME)?|N\/A)$/i
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const tokenSet = value => placeholderTokens(value).sort()

export function validateTranslationPackages(reference, packs, reviews) {
  const problems = []
  const counts = {}
  for (const lang of LANGUAGES) {
    const pack = packs[lang]
    const review = reviews[lang]
    let approved = 0
    if (!pack || !review) {
      problems.push(lang + ': package or review manifest missing')
      continue
    }
    for (const [store, expected] of Object.entries(reference)) {
      const actual = pack[store]
      const checks = review[store]
      if (!actual || !checks) {
        problems.push(lang + '/' + store + ': translation or review store missing')
        continue
      }
      const expectedKeys = Object.keys(expected)
      for (const key of expectedKeys) {
        const source = expected[key].source
        const entry = actual[key]
        const decision = checks[key]
        const prefix = lang + '/' + store + '/' + key
        if (!entry || !same(entry.source, source)) {
          problems.push(prefix + ': source missing or stale')
          continue
        }
        const value = entry.translation
        if (value === null || value === undefined || typeof value !== typeof source ||
            (typeof value === 'string' && (!value.trim() || INVALID.test(value.trim())))) {
          problems.push(prefix + ': missing/invalid translation')
          continue
        }
        if (typeof source === 'string' && !same(tokenSet(source), tokenSet(value))) {
          problems.push(prefix + ': interpolation/URL placeholder mismatch')
        }
        if (typeof source === 'string' && source.trim().length > 2 &&
            value === source && !decision?.unchanged_approved) {
          problems.push(prefix + ': identical to English without explicit unchanged approval')
        }
        if (decision?.status !== 'approved' || typeof decision?.reviewer !== 'string' ||
            !decision.reviewer.trim() || decision?.source !== source ||
            decision?.translation !== value) {
          problems.push(prefix + ': requires review approval tied to exact source and translation')
        } else approved++
      }
      for (const extra of Object.keys(actual)) if (!(extra in expected)) problems.push(lang + '/' + store + '/' + extra + ': unknown key')
      for (const extra of Object.keys(checks)) if (!(extra in expected)) problems.push(lang + '/' + store + '/' + extra + ': unknown review key')
    }
    for (const extra of Object.keys(pack)) if (!(extra in reference)) problems.push(lang + '/' + extra + ': unknown store')
    for (const extra of Object.keys(review)) if (!(extra in reference)) problems.push(lang + '/' + extra + ': unknown review store')
    counts[lang] = approved
  }
  return { ok: problems.length === 0, counts, problems }
}

function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function run() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const directory = process.argv[2]
  if (!directory) throw Error('Usage: node scripts/verify-six-language-review-gate.mjs <package-dir>')
  const destination = path.resolve(directory)
  if (!fs.existsSync(path.join(destination, 'manifest.json'))) throw Error('Missing translation manifest')
  const manifest = read(path.join(destination, 'manifest.json'))
  if (!same(manifest.languages, LANGUAGES)) throw Error('Unexpected language manifest')
  // Regenerate the English baseline on the checked-out revision. Never trust stale package manifests.
  const temp = fs.mkdtempSync(path.join(root, '.i18n-gate-'))
  try {
    const exported = spawnSync(process.execPath, ['scripts/export-eleven-language-translation-packages.mjs', '--out', path.relative(root, temp)], { cwd: root, encoding: 'utf8' })
    if (exported.status !== 0) throw Error(exported.stderr || 'Could not export current source')
    const reference = read(path.join(temp, 'de.json'))
    const packs = {}, reviews = {}
    for (const lang of LANGUAGES) {
      const file = path.join(destination, lang + '.json')
      const reviewFile = path.join(destination, lang + '.review.json')
      packs[lang] = fs.existsSync(file) ? read(file) : null
      reviews[lang] = fs.existsSync(reviewFile) ? read(reviewFile) : null
    }
    const result = validateTranslationPackages(reference, packs, reviews)
    console.log(JSON.stringify({ ok: result.ok, approved: result.counts, failures: result.problems.length, examples: result.problems.slice(0, 40) }, null, 2))
    if (!result.ok) process.exitCode = 1
  } finally { fs.rmSync(temp, { recursive: true, force: true }) }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run()
