// Validate completed translator packages before they enter production locale catalogs.
// Usage: node scripts/validate-translated-packages.mjs <directory>
// The export manifest is the authority for expected stores and keys.
import fs from 'node:fs'
import path from 'node:path'
import { placeholderTokens } from './generated-ui-locale-utils.mjs'

const directory = process.argv[2]
if (!directory) {
  console.error('Usage: node scripts/validate-translated-packages.mjs <directory>')
  process.exit(2)
}
const failures = []
const load = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
const manifest = load('manifest.json')
for (const lang of manifest.languages) {
  const packageData = load(lang + '.json')
  for (const [store, expectedCount] of Object.entries(manifest.stores[lang])) {
    const entries = packageData[store]
    if (!entries || Object.keys(entries).length !== expectedCount) {
      failures.push(lang + '/' + store + ': key count mismatch')
      continue
    }
    for (const [key, entry] of Object.entries(entries)) {
      const source = entry?.source
      const translated = entry?.translation
      if (typeof source !== 'string') {
        // Structured/non-string values must be verified separately, not passed as prose.
        if (JSON.stringify(source) !== JSON.stringify(translated)) failures.push(lang+'/'+store+'/'+key+': structured value mismatch')
        continue
      }
      if (typeof translated !== 'string' || !translated.trim()) {
        failures.push(lang+'/'+store+'/'+key+': missing translation')
        continue
      }
      if (source.length > 32 && translated === source && /[A-Za-z]{3,}/.test(source)) {
        failures.push(lang+'/'+store+'/'+key+': unchanged English review required')
      }
      if (JSON.stringify(placeholderTokens(source)) !== JSON.stringify(placeholderTokens(translated))) {
        failures.push(lang+'/'+store+'/'+key+': placeholder mismatch')
      }
    }
  }
}
if (failures.length) {
  console.error('Translation quality gate FAILED: '+failures.length+' issue(s)')
  for (const error of failures.slice(0,100)) console.error(error)
  process.exit(1)
}
console.log('Translation structural quality gate PASS; native-speaker QA still required.')
