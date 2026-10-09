import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const active = read('lib/i18n/supportedLanguages.ts')
const roadmap = read('lib/i18n/localeExpansion.ts')
const provider = read('components/i18n/I18nProvider.tsx')

const required = ['de', 'fr', 'it', 'ja', 'ko', 'ar']
for (const locale of required) assert.match(roadmap, new RegExp('\\b' + locale + ':'))
assert.match(roadmap, /RTL_LANGUAGES = new Set<string>\(\['ar'\]\)/)
assert.match(provider, /document\.documentElement\.dir = writingDirection\(safe\)/)

const activeCodes = [...active.matchAll(/^  (\w\w): '/gm)].map(match => match[1])
assert.deepEqual(activeCodes, ['en', 'es', 'pt', 'pl', 'ru'],
  'Do not enable pending languages before translations and production parity are certified')
console.log('[check-language-expansion-readiness] PASS — six roadmap locales registered, Arabic direction wired, five-language production guard intact.')
