// saas/tests/cosAnswerEvidenceIdHygiene.node.test.ts
//
// Internal retrieval identifiers must not reach the reader. The verbatim production leak
// (2026-08-22, "the provided evidence corpus [CL1–CL6] does not contain…") is the first fixture.
// The negatives matter as much: a genuinely cited answer with real source URLs must pass through
// UNTOUCHED, because there the markers are working citation keys, and no answer may ever be
// gutted — a mangled reply is worse than a leaky one.

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { leaksInternalEvidenceIds, stripInternalEvidenceIds } from '../lib/ai/cos/answerEvidenceIdHygiene.ts'

const LEAKED = "The provided evidence corpus [CL1–CL6] does not contain information regarding 'Provider X', video rendering services, or any mechanism for automatically switching providers based on learned performance metrics. The available data covers general transport protocols (QUIC), multi-tenant SaaS isolation strategies, database technologies (Redis), and physics simulation methods, but lacks any telemetry related to video rendering pipelines. Therefore, it is not possible to determine the feasibility of the requested auto-failover mechanism from the supplied context."

test('the verbatim production leak is detected and the scaffolding sentence removed', () => {
  assert.equal(leaksInternalEvidenceIds(LEAKED), true)
  const cleaned = stripInternalEvidenceIds(LEAKED)
  assert.doesNotMatch(cleaned, /\[CL/)
  assert.doesNotMatch(cleaned, /evidence corpus/i)
  assert.ok(cleaned.length > 60)
})

test('every internal marker family is stripped, including OEM and MEMBER and ranges', () => {
  const answer = 'Point one [CL1]. Point two [LIVE2]. Org data [OEM1] and [MEMBER2]. Range [CL1–CL6] and spaced [ CL 12 ].'
  const cleaned = stripInternalEvidenceIds(answer)
  assert.doesNotMatch(cleaned, /\[\s*(?:OEM|MEMBER|CL|LIVE|KG|EM|UM|SK)\s*\d/i)
  assert.match(cleaned, /Point one\./)
  assert.match(cleaned, /Point two\./)
})

test('a marker in apposition after a noun is removed, not doubled into a second subject', () => {
  // "The strategy profile [OEM1] instructs…" must become "The strategy profile instructs…" —
  // replacement here produced "the profile the retrieved evidence instructs" in production
  // (2026-08-23). Replacement is reserved for markers that ARE the subject.
  assert.equal(
    stripInternalEvidenceIds('The strategy profile [OEM1] explicitly instructs to keep defaults.'),
    'The strategy profile explicitly instructs to keep defaults.',
  )
  assert.equal(
    stripInternalEvidenceIds('According to [CL3] the deadline moved.'),
    'According to the retrieved evidence the deadline moved.',
  )
})

test('the verbatim OEM leak keeps its grammar — subject markers become a neutral phrase', () => {
  // 2026-08-22: OEM was missing from the first marker list and reached a user verbatim.
  const leaked = 'The provided Organization Enterprise Memory ([OEM1], [OEM2]) contains high-level business intelligence. While [OEM1] shows a campaignPlan with a Technical & Precise tone, these are static attributes.'
  const cleaned = stripInternalEvidenceIds(leaked)
  assert.doesNotMatch(cleaned, /\[OEM/)
  assert.doesNotMatch(cleaned, /\(\s*[,;]?\s*\)/)
  assert.match(cleaned, /Memory contains high-level/)
  assert.match(cleaned, /While the retrieved evidence shows/)
})

test('answers carrying real source URLs pass through untouched — those markers are citations', () => {
  const cited = 'Per [LIVE1] the deadline is 120 days. Source: https://www.gov.pl/web/gov/example'
  assert.equal(leaksInternalEvidenceIds(cited), false)
  assert.equal(stripInternalEvidenceIds(cited), cited)
})

test('ordinary answers are returned byte-identical', () => {
  for (const answer of [
    'The badge must be worn on your chest at all times.',
    'Here is a five-video funnel sequence.\n\nVideo 1: the wake-up call.',
    '',
  ]) {
    assert.equal(stripInternalEvidenceIds(answer), answer, answer.slice(0, 20))
    assert.equal(leaksInternalEvidenceIds(answer), false)
  }
})

test('an answer that is nothing BUT scaffolding is preserved rather than gutted', () => {
  const scaffoldingOnly = 'The provided evidence corpus [CL1] does not contain that.'
  const cleaned = stripInternalEvidenceIds(scaffoldingOnly)
  assert.equal(cleaned, scaffoldingOnly)
})

test('punctuation and spacing survive stripping', () => {
  const answer = 'First point [CL1], second point [CL2]; third point [CL3].'
  assert.equal(stripInternalEvidenceIds(answer), 'First point, second point; third point.')
})

test('hygiene is applied to the user-facing reply, and citation accounting still reads the raw answer', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(source, /reply:stripInternalEvidenceIds\(parsed\.answer\)/)
  // Citation counters must NOT be fed the stripped text — markers are exactly what they count.
  assert.match(source, /const cited = citedEvidence\(parsed\.answer\)/)
  assert.match(source, /organizationMemoryCitationCount\(parsed\.answer\)/)
})

test('cached replies are cleaned on replay, not only at generation time', () => {
  // A cached leak reads exactly like a live one. An [OEM1] answer written before this guard
  // existed replayed verbatim to a user on 2026-08-23; both replay paths now strip.
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(source, /reply:stripInternalEvidenceIds\(payload\.reply\)/)
  assert.match(source, /reply:stripInternalEvidenceIds\(cached\.reply\)/)
})
