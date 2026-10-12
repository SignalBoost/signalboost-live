import test from 'node:test'
import assert from 'node:assert/strict'
import { UNIVERSITY_COPY } from '../lib/seo/universityCopy.ts'
import { PUBLIC_LOCALES } from '../lib/seo/publicLocales.ts'

test('all eleven University pages clarify platform credit purchases are a separate future feature', () => {
  assert.equal(PUBLIC_LOCALES.length, 11)
  for (const locale of PUBLIC_LOCALES) {
    const copy = UNIVERSITY_COPY[locale]
    assert.ok(copy.creditPlan.length > 90, locale)
    assert.doesNotMatch(copy.creditPlan, /not yet operational|not approved|non opérationnel|non operativ|no están aprobados|não estão aprovados|не утверждены|noch nicht freigegeben/i, locale)
    assert.match(copy.creditPlan, /iTMounts/, locale)
    assert.ok(copy.external.length > 10, locale)
  }
})
