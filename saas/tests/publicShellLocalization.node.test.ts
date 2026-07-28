import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { hydrateLocalizedSource } from './helpers/hydrateLocalizedSource.ts'


const header = hydrateLocalizedSource(readFileSync(new URL('../components/Header.tsx', import.meta.url), 'utf8'))
const footer = hydrateLocalizedSource(readFileSync(new URL('../components/Footer.tsx', import.meta.url), 'utf8'))
const baseline = JSON.parse(hydrateLocalizedSource(readFileSync(new URL('../scripts/i18n-hardcoded-baseline.json', import.meta.url), 'utf8'))) as { files: string[] }

for (const [name, source] of [['Header', header], ['Footer', footer]] as const) {
  test(`${name} has complete five-language component copy`, () => {
    for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
      assert.match(source, new RegExp(`\\b${language}:\\s*\\{`))
    }
  })

  test(`${name} does not use the fallback translation helper`, () => {
    assert.doesNotMatch(source, /\bt\(dict,/)
  })
}

test('localized public-shell files are absent from the hardcoded-copy baseline', () => {
  for (const file of ['components/Header.tsx', 'components/Footer.tsx', 'components/enterprise/SourceUrlField.tsx']) {
    assert.equal(baseline.files.includes(file), false, `${file} must not remain baselined`)
  }
})
