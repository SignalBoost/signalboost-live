// Validate completed translator packages before they enter production locale catalogs.
// Usage: node scripts/validate-translated-packages.mjs <directory>
// The export manifest is the authority for expected stores and keys.
import fs from 'node:fs'
import path from 'node:path'
import { placeholderTokens } from './generated-ui-locale-utils.mjs'

const expectedLanguages = ['de','fr','it','ja','ko','ar']

const directory = process.argv[2]
if (!directory) {
  console.error('Usage: node scripts/validate-translated-packages.mjs <directory>')
  process.exit(2)
}
const failures = []
const load = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
const manifest = load('manifest.json')
if (JSON.stringify(manifest.languages) !== JSON.stringify(expectedLanguages)) {
  failures.push('manifest: missing or unexpected languages')
}
const sourceStores = {
  main: 'locales/en.json', pages: 'locales/pages.en.json',
  console: 'lib/i18n/console.en.json', audit: 'lib/i18n/audit.en.json',
  onboarding: 'lib/i18n/onboardingLocales.json', marketingSales: 'lib/i18n/marketingSalesLocales.json',
  auditCenter: 'lib/i18n/auditCenterLocales.json', supervisor: 'lib/i18n/supervisorSocLocales.json',
  homepage: 'lib/i18n/homepageLocales.json',
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
function flatten(value, prefix='', out={}) {
  for (const [key, child] of Object.entries(value)) {
    const full = prefix ? prefix+'.'+key : key
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child,full,out)
    else out[full] = child
  }
  return out
}

for (const lang of manifest.languages) {
  const packageData = load(lang + '.json')
  for (const [store, expectedCount] of Object.entries(manifest.stores[lang])) {
    const entries = packageData[store]
    if (!(store in sourceStores)) { failures.push(lang+'/'+store+': unexpected store'); continue }
    const baseline = JSON.parse(fs.readFileSync(path.join(root,sourceStores[store]),'utf8'))
    const english = flatten(['onboarding','marketingSales','auditCenter','supervisor','homepage'].includes(store) ? baseline.en : baseline)
    if (!entries || Object.keys(entries).length !== expectedCount || Object.keys(entries).length !== Object.keys(english).length || Object.keys(english).some(key => !(key in entries))) {
      failures.push(lang + '/' + store + ': key count mismatch')
      continue
    }
    for (const [key, entry] of Object.entries(entries)) {
      if (!(key in english) || JSON.stringify(entry?.source) !== JSON.stringify(english[key])) {
        failures.push(lang+'/'+store+'/'+key+': source key/value differs from canonical English')
        continue
      }
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
