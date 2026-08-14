import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { domainCompatibleContext, foundationalDomainMatches, relevanceTerms } from '../lib/ai/cos/contextRelevance'

const latencyQuestion = 'A multi-tenant SaaS suddenly shows normal database CPU and memory, but API p95 latency triples only for enterprise tenants. Smaller tenants remain unaffected. No deployment occurred and overall traffic is unchanged.'

test('retrieval vocabulary keeps discriminative latency and tenant signals', () => {
  const terms = relevanceTerms(latencyQuestion)
  assert.ok(terms.includes('multi-tenant'))
  assert.ok(terms.includes('database'))
  assert.ok(terms.includes('latency'))
  assert.ok(terms.includes('enterprise'))
  assert.ok(terms.includes('tenants'))
  assert.ok(terms.includes('deployment'))
  assert.ok(terms.includes('traffic'))
  assert.ok(!terms.includes('normal'))
  assert.ok(!terms.includes('only'))
  assert.ok(!terms.includes('unchanged'))
  assert.ok(!terms.includes('suddenly'))
  assert.ok(!terms.includes('shows'))
  assert.ok(!terms.includes('occurred'))
  assert.ok(!terms.includes('overall'))
})

test('latency diagnosis maps to SRE/PostgreSQL domains and rejects unrelated technical context', () => {
  const domains = foundationalDomainMatches(latencyQuestion, 2).map(match => match.id)
  assert.ok(domains.includes('sre'))
  assert.ok(domains.includes('postgres'))

  assert.equal(domainCompatibleContext(
    latencyQuestion,
    'Multi-tenant SaaS performance isolation: tenant-specific API tail latency, worker queues, connection pools and database query plans.',
  ), true)
  assert.equal(domainCompatibleContext(
    latencyQuestion,
    'PostgreSQL database performance: query plans, statistics, row-level security, data skew and large-tenant selectivity.',
  ), true)
  assert.equal(domainCompatibleContext(
    latencyQuestion,
    'SignalBoost AI SaaS marketing platform: customer reviews, branded content, social campaigns, audience targeting and retention.',
  ), false)
  assert.equal(domainCompatibleContext(
    latencyQuestion,
    'Wearable healthcare sensors use machine learning for patient wellbeing, biometric monitoring and embedded AI inference.',
  ), false)
  assert.equal(domainCompatibleContext(
    latencyQuestion,
    'Aquaculture management combines IoT sensing, LSTM prediction, digital twins and cyber-physical control for fish farms.',
  ), false)
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

test('structured learned facts are serialized instead of degrading to object placeholders', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosFirstAnswerEnterprise.ts', import.meta.url), 'utf8')
  assert.match(source, /value&&typeof value==='object'\?JSON\.stringify\(value\)/)
  assert.match(source, /r\.facts\.slice\(0,6\)\.map\(\(f:unknown\)=>safeText\(f,400\)\)/)
  assert.match(source, /r\.facts\.slice\(0,4\)\.map\(\(f:unknown\)=>safeText\(f,300\)\)/)
})
