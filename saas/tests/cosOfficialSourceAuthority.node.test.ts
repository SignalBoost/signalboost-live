// saas/tests/cosOfficialSourceAuthority.node.test.ts
//
// "Every authoritative fact has an owner; find the owner" — as a GENERAL rule, in any situation
// and any of the five platform languages, with no country or vendor lookup tables. These pin the
// three judgements: which questions have an owner, how the owner is recognized structurally in the
// results, and how evidence is ordered and labelled — including the honest caveat when the owner
// was not retrieved at all. The verbatim Polish production query (2026-08-22) is a fixture, but so
// are a vendor-product question and a medical one, because the point is the principle, not Poland.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  authorityTierOf,
  augmentQueryForOfficialSources,
  classifyAuthoritativeSourceNeed,
  officialCoverageNote,
  rankByAuthority,
} from '../lib/ai/cos/officialSourceAuthority.ts'

const POLISH_QUERY = 'zmieniłam nazwisko, co powinnam zrobić - jakie dokumenty zmienić, jakie instytucje powiadomić?'

test('authority-owned questions are recognized across domains and languages', () => {
  for (const query of [
    POLISH_QUERY,                                          // government procedure, Polish
    'name change documents Poland',                        // government procedure, English
    '¿qué documentos debo cambiar después de cambiar mi nombre?', // government procedure, Spanish
    'stripe webhook signature verification failing',       // vendor product behavior
    'supabase row level security policy configuration',    // vendor product behavior
    'ibuprofen maximum daily dose adults',                 // medical guidance
    'what does rfc 7231 say about caching',                // standard
  ]) {
    assert.equal(classifyAuthoritativeSourceNeed(query).required, true, query)
  }
})

test('questions without an owner are untouched', () => {
  for (const query of [
    'best pizza recipe for a home oven',
    'explain how attention works in transformers',
    'write a poem about the sea',
    'who is the current CEO of Microsoft?',
  ]) {
    assert.equal(classifyAuthoritativeSourceNeed(query).required, false, query)
  }
})

test('the owner is recognized structurally: the domain that names the entity is first-party', () => {
  const stripe = classifyAuthoritativeSourceNeed('stripe webhook signature verification failing')
  assert.equal(authorityTierOf('https://docs.stripe.com/webhooks/signatures', stripe), 'first_party')
  assert.equal(authorityTierOf('https://stripe.com/docs', stripe), 'first_party')
  assert.equal(authorityTierOf('https://some-tutorial-blog.example/stripe-webhooks', stripe), 'secondary')

  const supabase = classifyAuthoritativeSourceNeed('supabase row level security policy configuration')
  assert.equal(authorityTierOf('https://supabase.com/docs/guides/auth/row-level-security', supabase), 'first_party')
})

test('institutions are recognized by domain convention — gov.pl, gob.mx, gouv.fr, who.int — with no country list', () => {
  const need = classifyAuthoritativeSourceNeed(POLISH_QUERY)
  assert.equal(authorityTierOf('https://www.gov.pl/web/gov/uzyskaj-dowod-osobisty', need), 'institutional')
  assert.equal(authorityTierOf('https://obywatel.gov.pl/dokumenty', need), 'institutional')
  assert.equal(authorityTierOf('https://www.gob.mx/tramites', need), 'institutional')
  assert.equal(authorityTierOf('https://www.service-public.gouv.fr/particuliers', need), 'institutional')
  assert.equal(authorityTierOf('https://www.who.int/news-room/fact-sheets', classifyAuthoritativeSourceNeed('ibuprofen maximum daily dose adults')), 'institutional')
  assert.equal(authorityTierOf('https://some-legal-blog.pl/zmiana-nazwiska', need), 'secondary')
})

test('ranking is owner-first, institutions next, dated secondary before undated, stable, nothing removed', () => {
  const need = classifyAuthoritativeSourceNeed('name change documents Poland')
  const ranked = rankByAuthority([
    { url: 'https://blog-a.example/name-change', sourceDate: undefined },
    { url: 'https://blog-b.example/name-change', sourceDate: 'March 12, 2026' },
    { url: 'https://www.gov.pl/web/gov/uzyskaj-dowod-osobisty', sourceDate: undefined },
    { url: 'https://blog-c.example/name-change', sourceDate: 'July 1, 2026' },
  ], need)
  assert.equal(ranked.length, 4)
  assert.equal(ranked[0].url, 'https://www.gov.pl/web/gov/uzyskaj-dowod-osobisty')
  assert.equal(ranked[0].authorityTier, 'institutional')
  assert.deepEqual(ranked.slice(1).map(r => r.url), [
    'https://blog-b.example/name-change',
    'https://blog-c.example/name-change',
    'https://blog-a.example/name-change',
  ])
})

test('a first-party result outranks an institutional one — the owner is the strongest authority', () => {
  const need = classifyAuthoritativeSourceNeed('stripe webhook signature verification failing')
  const ranked = rankByAuthority([
    { url: 'https://www.ietf.org/rfc/hmac-notes' },
    { url: 'https://docs.stripe.com/webhooks/signatures' },
  ], need)
  assert.equal(ranked[0].authorityTier, 'first_party')
})

test('the query bias is generic and non-destructive — no hardcoded domains', () => {
  const need = classifyAuthoritativeSourceNeed('name change documents Poland')
  const augmented = augmentQueryForOfficialSources('name change documents Poland', need)
  assert.match(augmented, /^name change documents Poland/)
  assert.match(augmented, /\bofficial\b/)
  assert.doesNotMatch(augmented, /gov\.pl/)
  assert.equal(augmentQueryForOfficialSources('official name change documents', need), 'official name change documents')
  assert.equal(augmentQueryForOfficialSources('best pizza recipe', classifyAuthoritativeSourceNeed('best pizza recipe')), 'best pizza recipe')
})

test('zero owner/institutional sources yields the caveat; any authority silences it; unowned questions never get one', () => {
  const need = classifyAuthoritativeSourceNeed('name change documents Poland')
  const note = officialCoverageNote([{ authorityTier: 'secondary' }, { authorityTier: 'secondary' }], need)
  assert.ok(note && /No first-party or institutional source/.test(note))
  assert.equal(officialCoverageNote([{ authorityTier: 'institutional' }], need), null)
  assert.equal(officialCoverageNote([{ authorityTier: 'first_party' }], need), null)
  assert.equal(officialCoverageNote([{ authorityTier: 'secondary' }], classifyAuthoritativeSourceNeed('best pizza recipe')), null)
})
