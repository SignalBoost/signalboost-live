import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const header = read('components/Header.tsx')
const footer = read('components/Footer.tsx')
const baseline = JSON.parse(read('scripts/i18n-hardcoded-baseline.json'))

for (const [name, source] of [['Header', header], ['Footer', footer]]) {
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    assert.match(source, new RegExp(`\\b${language}:\\s*\\{`), `${name} is missing ${language} copy`)
  }
  assert.doesNotMatch(source, /\bt\(dict,/, `${name} still uses an English fallback`)
}

for (const file of ['components/Header.tsx', 'components/Footer.tsx', 'components/enterprise/SourceUrlField.tsx']) {
  assert.equal(baseline.files.includes(file), false, `${file} still appears in the baseline`)
}

console.log('Public shell localization verification passed.')
