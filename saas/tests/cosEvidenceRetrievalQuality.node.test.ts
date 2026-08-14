import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { relevanceTerms } from '../lib/ai/cos/contextRelevance'

const latencyQuestion = 'A multi-tenant SaaS suddenly shows normal database CPU and memory, but API p95 latency triples only for enterprise tenants. Smaller tenants remain unaffected. No deployment occurred and overall traffic is unchanged.'

test('retrieval vocabulary keeps discriminative latency and tenant signals', () => {
  const terms = relevanceTerms(latencyQuestion)
  assert.ok(terms.includes('multi-tenant'))
  assert.ok(terms.includes('database'))
  assert.ok(terms.includes('latency'))
  assert.ok(terms.includes('enterprise'))
  assert.ok(terms.includes('tenants'))
  assert.ok(!terms.includes('normal'))
  assert.ok(!terms.includes('only'))
  assert.ok(!terms.includes('unchanged'))
})

test('COS primary filters rejected corpus rows and semantically gates Enterprise Memory', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(source, /relevanceTerms\(prompt\)\.slice\(0,12\)/)
  assert.match(source, /filter\(row=>!rejectedLearningRow\(row\)\)/)
  assert.match(source, /enterpriseMemorySimilarityThreshold/)
  assert.match(source, /rankContextCandidates\(prompt,candidates,\{threshold:enterpriseMemorySimilarityThreshold\(\)/)
  assert.doesNotMatch(source, /enterpriseMemoryLexicalThreshold/)
  assert.match(source, /directly supports a factual claim you make, use and cite it/)
  assert.match(source, /neq\('predicate','excluded_from_cos_retrieval'\)/)
})
