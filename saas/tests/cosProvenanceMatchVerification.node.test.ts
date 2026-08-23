// saas/tests/cosProvenanceMatchVerification.node.test.ts
//
// Incident (2026-08-23): the stored record for a specific answer showed confidence 0.78 — a
// completely healthy, above-threshold turn. The introspection reply shown immediately after it
// said 0.00, with full "this is the real, recorded provenance... not a model-generated
// reconstruction" certainty. Confirmed by direct SQL comparison against the exact stored row for
// that content: the two did not match.
//
// Root cause: the introspection handler's fallback chain has four levels. The first three are
// verified — exact conversation match, or exact preceding-answer-text match. The FOURTH is not:
// when neither a conversation ID nor the preceding answer's text was available from the client,
// it fell back to cos_latest_turn_provenance (one row per user, overwritten by every turn) with NO
// content check at all — returning whatever was most recently written for that user, which during
// rapid back-to-back testing can genuinely be a different turn than the one just answered, while
// still claiming unconditional certainty.
//
// Source-text assertions, not an import: app/api/support/route.ts uses '@/lib' path aliases that
// only resolve under tsc, not bare `node --test` (same limitation as other route files touched
// tonight) — this is a pre-existing property of the file, not something the fix introduced.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ROUTE = readFileSync(new URL('../app/api/support/route.ts', import.meta.url), 'utf8')

test('the unverified last-resort fallback is tracked, not treated as equally certain', () => {
  assert.match(ROUTE, /let verified = true/)
  assert.match(ROUTE, /verified = false/)
})

test('the three verified fallback levels are attempted before the unverified one', () => {
  const introspectionBlock = ROUTE.slice(ROUTE.indexOf('isProvenanceIntrospection(prompt)'), ROUTE.indexOf('if (!recorded) {'))
  assert.match(introspectionBlock, /latestRecordedTurnProvenance\(conversationId, userId\)/)
  assert.match(introspectionBlock, /recordedTurnProvenanceByContent\(userId, precedingAssistant\)/)
  assert.match(introspectionBlock, /latestUserTurnProvenance\(userId, precedingAssistant\)/)
  // The unverified call has no second argument — nothing to check the match against.
  assert.match(introspectionBlock, /latestUserTurnProvenance\(userId\)\s*\n\s*verified = false/)
})

test('an unverified match gets an honest caveat prepended, not silent unconditional certainty', () => {
  assert.match(ROUTE, /verified \? formatted : \[unverifiedProvenanceCaveat\(languageCode\), '', formatted\]\.join/)
})

test('the caveat exists in all five UI languages and names the actual reason plainly', () => {
  assert.match(ROUTE, /function unverifiedProvenanceCaveat/)
  const fn = ROUTE.slice(ROUTE.indexOf('function unverifiedProvenanceCaveat'), ROUTE.indexOf('function unverifiedProvenanceCaveat') + 2000)
  for (const marker of ["languageCode === 'es'", "languageCode === 'pt'", "languageCode === 'pl'", "languageCode === 'ru'"]) {
    assert.match(fn, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
  assert.match(fn, /could not confirm this record matches the immediately preceding answer exactly/)
})

test('the response body records whether the match was verified, for downstream observability', () => {
  assert.match(ROUTE, /provenance_match_verified: verified/)
})
