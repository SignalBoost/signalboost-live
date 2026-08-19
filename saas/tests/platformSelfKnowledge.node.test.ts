// saas/tests/platformSelfKnowledge.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { platformSelfKnowledgeFacts } from '../lib/ai/cos/platformSelfKnowledge.ts'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('platform self-knowledge is a small versioned set of deterministic code-derived facts', () => {
  const timestamp = new Date('2026-08-16T00:00:00.000Z')
  const facts = platformSelfKnowledgeFacts(timestamp)

  assert.equal(facts.length, 11)
  assert.equal(new Set(facts.map(fact => fact.id)).size, facts.length)
  assert.equal(new Set(facts.map(fact => `${fact.taskId}:${fact.subject}:${fact.predicate}`)).size, facts.length)

  for (const fact of facts) {
    assert.equal(fact.taskId, 'support')
    assert.equal(fact.confidence, 1)
    assert.equal(fact.updatedAt, timestamp)
    assert.match(fact.source, /^platform-self-knowledge:v3:/)
    assert.ok(fact.object.length >= 120)
  }

  const byPredicate = new Map(facts.map(fact => [`${fact.subject}:${fact.predicate}`, fact.object]))
  assert.match(byPredicate.get('SignalBoost COS Enterprise Memory:authoritative_definition') || '', /durable organization-scoped operational knowledge/i)
  assert.match(byPredicate.get('SignalBoost COS Semantic Cache:authoritative_definition') || '', /previously generated answer/i)
  assert.match(byPredicate.get('SignalBoost COS RunPod wake governance:interactive_wake_authority') || '', /fresh same-origin user interaction/i)
  assert.match(byPredicate.get('SignalBoost COS RunPod wake governance:background_embedding_lifecycle') || '', /must not wake stopped RunPod compute/i)
  assert.match(byPredicate.get('SignalBoost COS fresh-data routing:fresh_facts_bypass_ordinary_runpod_preflight') || '', /before ordinary RunPod readiness/i)
  assert.match(byPredicate.get('SignalBoost COS RunPod cold-start recovery:bounded_request_owned_retry') || '', /same request started the compute/i)

  const authPolicy = byPredicate.get('SignalBoost COS authorization and escalation policy:fail_closed_approval_boundary') || ''
  assert.match(authPolicy, /fail closed/i)
  assert.match(authPolicy, /approval/i)
  assert.match(authPolicy, /external/i)

  const admission = byPredicate.get('SignalBoost COS knowledge admission:confidence_relevance_durability_gate') || ''
  assert.match(admission, /high-confidence/i)
  assert.match(admission, /durable/i)
  assert.match(admission, /relevance/i)

  const tiered = byPredicate.get('SignalBoost COS tiered learning admission:probationary_corroboration_promotion') || ''
  assert.match(tiered, /probationary/i)
  assert.match(tiered, /corroboration/i)
  assert.match(tiered, /durable/i)

  const provenance = byPredicate.get('SignalBoost COS execution provenance:model_source_cache_disclosure') || ''
  assert.match(provenance, /provenance/i)
  assert.match(provenance, /model/i)
  assert.match(provenance, /source/i)
  assert.match(provenance, /cache/i)

  const tenantIsolation = byPredicate.get('SignalBoost COS Enterprise Memory tenant isolation:organization_scoped_isolation') || ''
  assert.match(tenantIsolation, /Enterprise Memory/)
  assert.match(tenantIsolation, /Semantic Cache/)
  assert.match(tenantIsolation, /tenant/i)
  assert.match(tenantIsolation, /isolation/i)
})

test('versioned self-knowledge claims remain mechanically aligned with implementation', () => {
  const browser = source('../app/api/cos-browser/route.ts')
  assert.ok(browser.includes('evaluateRunpodWakePermission'))
  assert.ok(browser.includes("interactionHeader: req.headers.get('x-signalboost-user-interaction')"))
  assert.ok(browser.includes("requestOrigin: req.headers.get('origin')"))
  assert.ok(browser.includes("secFetchSite: req.headers.get('sec-fetch-site')"))
  assert.ok(browser.includes('withRunpodWakePermission(permission'))

  const embeddings = source('../lib/ai/cos/localEmbeddings.ts')
  const passiveStart = embeddings.indexOf('export const generatePassiveLocalEmbedding')
  const passiveEnd = embeddings.indexOf('/** Backward-compatible explicit name', passiveStart)
  const passive = embeddings.slice(passiveStart, passiveEnd)
  assert.ok(passive.includes('generateLocalEmbeddings([text])'))
  assert.equal(passive.includes('ensureLocalInferenceRuntimeReady'), false)

  const firstAnswer = source('../lib/ai/cos/cosFirstAnswer.ts')
  const entry = firstAnswer.slice(firstAnswer.indexOf('export async function tryCOSFirstAnswer'))
  assert.ok(entry.indexOf('requiresFreshExternalEvidence(input.prompt)') < entry.indexOf('await ensureLocalInferenceRuntimeReady()'))

  const localInference = source('../lib/ai/local-inference.ts')
  const readyStart = localInference.indexOf('export async function ensureLocalInferenceRuntimeReady')
  const readyEnd = localInference.indexOf('export async function callLocalModel', readyStart)
  const ready = localInference.slice(readyStart, readyEnd)
  assert.ok(localInference.includes('const MAX_RUNPOD_READINESS_BUDGET_MS = 120_000'))
  assert.ok(ready.includes('totalReadinessBudgetMs'))
  assert.ok(ready.includes('remainingReadinessBudgetMs(readinessStartedAt, totalReadinessBudgetMs)'))
  assert.ok(ready.includes('if (firstWake.computeStartedByRequest)'))
  assert.ok(ready.includes('retryWake = await ensureRunpodReasonerStarted()'))
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
