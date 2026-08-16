import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { platformSelfKnowledgeFacts } from '../lib/ai/cos/platformSelfKnowledge'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('platform self-knowledge is a small versioned set of deterministic code-derived facts', () => {
  const timestamp = new Date('2026-08-16T00:00:00.000Z')
  const facts = platformSelfKnowledgeFacts(timestamp)

  assert.equal(facts.length, 4)
  assert.equal(new Set(facts.map(fact => fact.id)).size, facts.length)
  assert.equal(new Set(facts.map(fact => `${fact.taskId}:${fact.subject}:${fact.predicate}`)).size, facts.length)

  for (const fact of facts) {
    assert.equal(fact.taskId, 'support')
    assert.equal(fact.confidence, 1)
    assert.equal(fact.updatedAt, timestamp)
    assert.match(fact.source, /^platform-self-knowledge:v1:/)
    assert.ok(fact.object.length >= 120)
  }

  const byPredicate = new Map(facts.map(fact => [fact.predicate, fact.object]))
  assert.match(byPredicate.get('interactive_wake_authority') || '', /fresh same-origin user interaction/i)
  assert.match(byPredicate.get('background_embedding_lifecycle') || '', /must not wake stopped RunPod compute/i)
  assert.match(byPredicate.get('fresh_facts_bypass_ordinary_runpod_preflight') || '', /before ordinary RunPod readiness/i)
  assert.match(byPredicate.get('bounded_request_owned_retry') || '', /same request started the compute/i)
})

test('self-knowledge persistence stays on local passive embedding and existing Knowledge Graph storage', () => {
  const text = source('../lib/ai/cos/platformSelfKnowledge.ts')
  assert.ok(text.includes('persistKnowledgeFactWithEmbedding'))
  assert.ok(text.includes(".select('object,confidence,source,embedding')"))
  assert.ok(text.includes('row.embedding != null'))
  assert.equal(text.includes('callCosReasoner'), false)
  assert.equal(text.includes('getExternalInfo'), false)
  assert.equal(text.includes('ensureLocalInferenceRuntimeReady'), false, 'seeder must not acquire wake authority itself')
})

test('knowledge-promotion route owns readiness before seeding self-knowledge', () => {
  const text = source('../app/api/cron/cos-knowledge-promotion/route.ts')
  const readiness = text.indexOf('await ensureLocalInferenceRuntimeReady()')
  const seed = text.indexOf('await seedPlatformSelfKnowledge()')
  assert.ok(readiness >= 0)
  assert.ok(seed > readiness)
  assert.ok(text.includes('platformSelfKnowledge.failed === 0'))
})
