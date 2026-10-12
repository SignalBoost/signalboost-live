import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PUBLIC_LOCALES } from '../lib/seo/publicLocales.ts'
import { UNIVERSITY_START_COPY } from '../lib/seo/universityStartCopy.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('every supported language has a complete customer LAB signup and login translation', () => {
  assert.equal(PUBLIC_LOCALES.length, 11)
  assert.deepEqual(Object.keys(UNIVERSITY_START_COPY).sort(), [...PUBLIC_LOCALES].sort())
  const englishKeys = Object.keys(UNIVERSITY_START_COPY.en)
  for (const locale of PUBLIC_LOCALES) {
    assert.deepEqual(Object.keys(UNIVERSITY_START_COPY[locale]).sort(), [...englishKeys].sort())
    for (const key of englishKeys) {
      const text = UNIVERSITY_START_COPY[locale][key as keyof typeof UNIVERSITY_START_COPY.en]
      assert.ok(text.trim(), `${locale}.${key}`)
      if (locale !== 'en') assert.notEqual(text, UNIVERSITY_START_COPY.en[key as keyof typeof UNIVERSITY_START_COPY.en])
    }
  }
})
test('localized LAB pages pass the language into auth and training copy', () => {
  const route = read('../app/[locale]/university/start/page.tsx')
  const shared = read('../app/university/start/UniversityStartContent.tsx')
  assert.match(route, /isPublicLocale\(locale\)/)
  assert.match(route, /permanentRedirect\('\/university\/start'\)/)
  assert.match(shared, /UniversityCustomerAccess locale=\{locale\}/)
  assert.match(shared, /LabCustomerTrainingSection language=\{locale\}/)
  assert.match(shared, /PUBLIC_LOCALES\.map\(language/)
  assert.match(shared, /robots:|UniversityStartContent/)
})
test('University Start navigation and email verification retain the selected language', () => {
  const landing = read('../components/seo/UniversityPublicPage.tsx')
  const auth = read('../app/university/start/UniversityCustomerAccess.tsx')
  assert.doesNotMatch(landing, /href="\/university\/start"/)
  assert.match(landing, /\$\{locale\}\/university\/start/)
  assert.match(auth, /returnPath = locale === 'en'/)
  assert.match(auth, /encodeURIComponent\(returnPath\)/)
  assert.match(auth, /proposedEnrollmentRegion/)
})
