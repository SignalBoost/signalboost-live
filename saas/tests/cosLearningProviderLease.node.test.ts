import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { ContinuousLearningSourceAdapter } from '../lib/cos-core/layers/learning/cycle.ts'
import type { KnowledgeGap } from '../lib/cos-core/layers/learning/index.ts'
import {
  learningSourceProviderLeasePolicy,
  learningSourceProviderOutcome,
  withSharedLearningSourceProviderLease,
  type LearningSourceProviderLeasePort,
} from '../lib/cos-core/layers/learning/providerLease.ts'

const GAP: KnowledgeGap = {
  id: 'gap-provider-lease',
  subject: 'Computer Science & Coding',
  question: 'What current research improves retrieval systems?',
  portableIds: ['cos'],
  expectedReuse: 10,
  expectedAvoidedCostUsd: 1,
  urgency: 80,
  evidence: ['test'],
}

test('provider aliases share one distributed lease identity', () => {
  assert.equal(learningSourceProviderLeasePolicy('openalex')?.providerId, 'openalex')
  assert.equal(learningSourceProviderLeasePolicy('openalex_semantic')?.providerId, 'openalex')
  assert.equal(learningSourceProviderLeasePolicy('hf_nist_cc0')?.providerId, 'huggingface_datasets')
  assert.equal(learningSourceProviderLeasePolicy('hf_github_cc0')?.providerId, 'huggingface_datasets')
  assert.equal(learningSourceProviderLeasePolicy('hf_arxiv_cc0')?.providerId, 'huggingface_datasets')
  assert.equal(learningSourceProviderLeasePolicy('semantic_scholar')?.providerId, 'semantic_scholar')
})

test('a lane that cannot claim the shared provider does not call upstream', async () => {
  let upstreamCalls = 0
  let claims = 0
  const port: LearningSourceProviderLeasePort = {
    async claim() { claims += 1; return false },
    async release() { throw new Error('release must not run without a claim') },
  }
  const base: ContinuousLearningSourceAdapter = {
    kind: 'scientific_journal',
    id: 'semantic_scholar',
    async acquire() { upstreamCalls += 1; return [] },
  }
  const guarded = withSharedLearningSourceProviderLease(base, 'test-lane', port)
  const rows = await guarded.acquire(GAP)
  assert.deepEqual(rows, [])
  assert.equal(claims, 1)
  assert.equal(upstreamCalls, 0)
})

test('Semantic Scholar 429 creates a durable provider cooldown', async () => {
  const releases: any[] = []
  const port: LearningSourceProviderLeasePort = {
    async claim() { return true },
    async release(input) { releases.push(input) },
  }
  const base: ContinuousLearningSourceAdapter = {
    kind: 'scientific_journal',
    id: 'semantic_scholar',
    async acquire() { throw new Error('COS semantic research source failed: 429') },
  }
  const guarded = withSharedLearningSourceProviderLease(base, 'software-specialist:test', port)
  await assert.rejects(() => guarded.acquire(GAP), /429/)
  assert.equal(releases.length, 1)
  assert.equal(releases[0].providerId, 'semantic_scholar')
  assert.equal(releases[0].outcome, 'rate_limited')
  assert.equal(releases[0].cooldownSeconds, 900)
})

test('provider timeouts are distinct from generic errors', () => {
  assert.deepEqual(learningSourceProviderOutcome(new Error('This operation was aborted')).outcome, 'timeout')
  assert.deepEqual(learningSourceProviderOutcome(new Error('HTTP 429 too many requests')).outcome, 'rate_limited')
  assert.deepEqual(learningSourceProviderOutcome(new Error('HTTP 503')).outcome, 'error')
})

test('successful provider calls release with short pacing cooldown', async () => {
  const releases: any[] = []
  const port: LearningSourceProviderLeasePort = {
    async claim() { return true },
    async release(input) { releases.push(input) },
  }
  const base: ContinuousLearningSourceAdapter = {
    kind: 'scientific_journal',
    id: 'openalex_semantic',
    async acquire() { return [] },
  }
  await withSharedLearningSourceProviderLease(base, 'cos:test', port).acquire(GAP)
  assert.equal(releases[0].providerId, 'openalex')
  assert.equal(releases[0].outcome, 'ok')
  assert.equal(releases[0].cooldownSeconds, 1)
})

test('database migration atomically fences provider claims and exposes RPCs only to service role', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260924131500_cos_learning_source_provider_lease.sql', import.meta.url),
    'utf8',
  )
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /cos-learning-provider:/)
  assert.match(migration, /not_before/)
  assert.match(migration, /where provider_id = p_provider_id\s+and lease_id = p_lease_id/)
  assert.match(migration, /revoke all on table public\.cos_learning_source_provider_leases[\s\S]*service_role/)
  assert.match(migration, /grant execute on function public\.claim_cos_learning_source_provider_lease/)
  assert.match(migration, /grant execute on function public\.release_cos_learning_source_provider_lease/)
})

test('daily and University learning both participate in the shared lease', () => {
  const daily = readFileSync(new URL('../lib/cos/dailyAutonomousLearning.ts', import.meta.url), 'utf8')
  const university = readFileSync(new URL('../lib/ai/cos/cosUniversityContinuousLearning.ts', import.meta.url), 'utf8')
  assert.match(daily, /withSharedLearningSourceProviderLeases/)
  assert.match(daily, /daily:\$\{input\.miningSummary\.run_id\}/)
  assert.match(university, /withSharedLearningSourceProviderLeases/)
  assert.match(university, /university:\$\{slotKey\}:\$\{agentId\}/)
})
