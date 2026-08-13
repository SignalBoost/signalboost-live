//
// Built from the real failure: a confident answer was cached, and every later ask of the same
// question returned it — through a model swap, a prompt rewrite and a gate change — so no
// quality work could ever show up in a benchmark run.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  cosAnswerPolicyVersion,
  cosCacheTaskId,
  cosCacheMaxAgeMs,
  cachedAnswerIsCurrent,
} from '../lib/ai/cos/cosAnswerPolicy'
import { authoritativeProvenance, formatAuthoritativeProvenance } from '../lib/ai/cos/cosOrchestration'

const base = { reasonerSystemPrompt: 'Answer with mechanism, observable, falsifier.', model: 'qwen2.5-coder:32b', threshold: 0.72 }

test('the same policy fingerprints identically across calls', () => {
  assert.equal(cosAnswerPolicyVersion(base), cosAnswerPolicyVersion({ ...base }))
  assert.equal(cosAnswerPolicyVersion(base).length, 12)
})

test('swapping the model changes the cache partition', () => {
  const before = cosAnswerPolicyVersion(base)
  const after = cosAnswerPolicyVersion({ ...base, model: 'qwen2.5:32b-instruct' })
  assert.notEqual(before, after)
  assert.notEqual(cosCacheTaskId('cos-first-answer', before), cosCacheTaskId('cos-first-answer', after))
})

test('rewriting the reasoner prompt or moving the gate changes the partition too', () => {
  const before = cosAnswerPolicyVersion(base)
  assert.notEqual(cosAnswerPolicyVersion({ ...base, reasonerSystemPrompt: `${base.reasonerSystemPrompt} Rank by fit.` }), before)
  assert.notEqual(cosAnswerPolicyVersion({ ...base, threshold: 0.8 }), before)
  assert.notEqual(cosAnswerPolicyVersion({ ...base, gateRevision: 'later-revision' }), before)
})

test('model casing and padding do not fragment the cache', () => {
  assert.equal(cosAnswerPolicyVersion({ ...base, model: '  QWEN2.5-Coder:32B ' }), cosAnswerPolicyVersion(base))
})

test('an entry from another policy is refused, with the reason naming both versions', () => {
  const now = Date.parse('2026-08-13T00:00:00.000Z')
  const verdict = cachedAnswerIsCurrent({ policyVersion: 'aaaaaaaaaaaa', storedAt: '2026-08-12T23:00:00.000Z' }, 'bbbbbbbbbbbb', cosCacheMaxAgeMs({}), now)
  assert.equal(verdict.ok, false)
  if (verdict.ok) return
  assert.match(verdict.reason, /aaaaaaaaaaaa/)
  assert.match(verdict.reason, /bbbbbbbbbbbb/)
})

test('a pre-versioning entry is refused and named as such', () => {
  const verdict = cachedAnswerIsCurrent({ policyVersion: null, storedAt: null }, 'aaaaaaaaaaaa', 0)
  assert.equal(verdict.ok, false)
  if (verdict.ok) return
  assert.match(verdict.reason, /predates answer-policy versioning/)
})

test('a matching entry within the age ceiling is served, past it is refused', () => {
  const now = Date.parse('2026-08-13T00:00:00.000Z')
  const dayMs = 24 * 60 * 60 * 1000
  const fresh = cachedAnswerIsCurrent({ policyVersion: 'aaaaaaaaaaaa', storedAt: '2026-08-12T00:00:00.000Z' }, 'aaaaaaaaaaaa', 7 * dayMs, now)
  assert.equal(fresh.ok, true)
  const stale = cachedAnswerIsCurrent({ policyVersion: 'aaaaaaaaaaaa', storedAt: '2026-07-01T00:00:00.000Z' }, 'aaaaaaaaaaaa', 7 * dayMs, now)
  assert.equal(stale.ok, false)
  // Ageing off entirely is a supported configuration, not an accident.
  assert.equal(cachedAnswerIsCurrent({ policyVersion: 'aaaaaaaaaaaa', storedAt: '2026-01-01T00:00:00.000Z' }, 'aaaaaaaaaaaa', 0, now).ok, true)
})

test('COS_ANSWER_CACHE_MAX_AGE_MS is honoured and falls back on nonsense', () => {
  assert.equal(cosCacheMaxAgeMs({ COS_ANSWER_CACHE_MAX_AGE_MS: '3600000' }), 3_600_000)
  assert.equal(cosCacheMaxAgeMs({ COS_ANSWER_CACHE_MAX_AGE_MS: '0' }), 0)
  assert.equal(cosCacheMaxAgeMs({ COS_ANSWER_CACHE_MAX_AGE_MS: 'later' }), 7 * 24 * 60 * 60 * 1000)
  assert.equal(cosCacheMaxAgeMs({}), 7 * 24 * 60 * 60 * 1000)
})

test('a cache hit reports the originating turn, not this turn s retrieval', () => {
  const provenance = authoritativeProvenance({
    confidence: 0.85,
    provenance: {
      responseSource: 'semantic_similarity',
      localModelInvoked: false,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      knowledgeFactsUsed: 0,
      knowledgeFactsCited: 0,
      learnedItemsUsed: 4,
      learnedItemsCited: 1,
      userMemoriesUsed: 0,
      userMemoriesCited: 0,
      cacheOrigin: {
        storedAt: '2026-08-11T09:14:00.000Z',
        policyVersion: 'aaaaaaaaaaaa',
        retrievedThisTurn: { facts: 0, learned: 12, memories: 3 },
      },
    },
  }, { invoked: false })

  const text = formatAuthoritativeProvenance(provenance, 'en')
  assert.match(text, /Answer Origin\s+: SERVED FROM CACHE/)
  assert.match(text, /2026-08-11T09:14:00\.000Z/)
  assert.match(text, /answer policy aaaaaaaaaaaa/)
  assert.match(text, /No reasoning ran on this request/)
  // This turn's retrieval is reported as what it was: cache keying, not evidence for an answer.
  assert.match(text, /12 corpus items and 3 memories were retrieved this turn solely to key the cache/)
  // The component lines describe the ORIGIN turn — 1 of 4, not 0 of 12.
  assert.match(text, /Learned Corpus\s+: USED — 1 cited of 4 retrieved learned items/)
  assert.match(text, /Local Reasoning Engine: NOT INVOKED/)
  assert.match(text, /no confidence gate ran on this request/)
})

test('a freshly reasoned answer carries no cache-origin line', () => {
  const provenance = authoritativeProvenance({
    confidence: 0.85,
    provenance: {
      responseSource: 'local_cos_reasoning',
      localModelInvoked: true,
      reasonerLabel: 'independent-local:qwen2.5-coder:32b',
      knowledgeFactsUsed: 3, knowledgeFactsCited: 0,
      learnedItemsUsed: 12, learnedItemsCited: 2,
      userMemoriesUsed: 0, userMemoriesCited: 0,
    },
  }, { invoked: false })
  const text = formatAuthoritativeProvenance(provenance, 'en')
  assert.ok(!text.includes('Answer Origin'))
  assert.ok(!text.includes('no confidence gate ran on this request'))
  assert.match(text, /Local Reasoning Engine: INVOKED/)
})
