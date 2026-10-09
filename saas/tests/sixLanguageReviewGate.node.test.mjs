import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LANGUAGES, validateTranslationPackages } from '../scripts/verify-six-language-review-gate.mjs'

test('translation release requires exact translated and reviewed entries in all six locales', () => {
  const reference = { pages: { title: {source:'Welcome {name}', translation:null} } }
  const packs = Object.fromEntries(LANGUAGES.map(lang => [lang, { pages: { title: {source:'Welcome {name}',translation:'Bonjour {name}'} } }]))
  const reviews = Object.fromEntries(LANGUAGES.map(lang => [lang, { pages: { title: {status:'approved',reviewer:'native-reviewer',source:'Welcome {name}',translation:'Bonjour {name}'} } }]))
  assert.equal(validateTranslationPackages(reference,packs,reviews).ok,true)
  reviews.de.pages.title.status='needs_review'
  assert.equal(validateTranslationPackages(reference,packs,reviews).ok,false)
  reviews.de.pages.title.status='approved'
  packs.de.pages.title.translation='Bonjour name'
  assert.match(validateTranslationPackages(reference,packs,reviews).problems.join(' '),/placeholder mismatch/)
  packs.de.pages.title.translation='Welcome {name}'
  reviews.de.pages.title.translation='Welcome {name}'
  assert.match(validateTranslationPackages(reference,packs,reviews).problems.join(' '),/identical to English/)
  reviews.de.pages.title.unchanged_approved=true
  assert.equal(validateTranslationPackages(reference,packs,reviews).ok,true)
  packs.fr.pages.title.source='old source'
  assert.match(validateTranslationPackages(reference,packs,reviews).problems.join(' '),/source missing or stale/)
})
