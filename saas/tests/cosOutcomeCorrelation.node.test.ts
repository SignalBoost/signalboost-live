import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  beginEvidenceSourceUseTurn,
  captureEvidenceSourceUseTurnId,
  captureLearnedCitationIndices,
  captureSelectedLearnedSourceKinds,
  consumeEvidenceSourceUseTurn,
  peekEvidenceSourceUseTurnId,
} from '../lib/ai/cos/evidenceSourceUseTurnContext.ts'
import {
  COS_EVIDENCE_UTILIZATION_BENCHMARK,
  evidenceUtilizationDomains,
} from '../lib/ai/cos/evidenceUtilizationBenchmark.ts'
import { reasonerProbeCompletionTimeoutMs } from '../lib/ai/cos/reasonerProbe.ts'

const file = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('request-local turn correlation can be peeked before source-use consumption', () => {
  beginEvidenceSourceUseTurn()
  captureSelectedLearnedSourceKinds([
    { source_kind: 'official_documentation' },
    { source_kind: 'scientific_journal' },
  ])
  captureEvidenceSourceUseTurnId('11111111-1111-4111-8111-111111111111')
  captureLearnedCitationIndices([1])

  assert.equal(peekEvidenceSourceUseTurnId(), '11111111-1111-4111-8111-111111111111')
  assert.deepEqual(consumeEvidenceSourceUseTurn(), {
    turnId: '11111111-1111-4111-8111-111111111111',
    sourceKinds: ['official_documentation', 'scientific_journal'],
    citedIndices: [1],
  })
  assert.equal(peekEvidenceSourceUseTurnId(), null)
})

test('beginning a new turn clears stale correlation', () => {
  captureEvidenceSourceUseTurnId('22222222-2222-4222-8222-222222222222')
  assert.equal(peekEvidenceSourceUseTurnId(), '22222222-2222-4222-8222-222222222222')
  beginEvidenceSourceUseTurn()
  assert.equal(peekEvidenceSourceUseTurnId(), null)
})

test('controlled evidence-utilization suite has 36 unique local-only cases across nine domains', () => {
  assert.equal(COS_EVIDENCE_UTILIZATION_BENCHMARK.length, 36)
  assert.equal(evidenceUtilizationDomains().length, 9)
  const ids = new Set(COS_EVIDENCE_UTILIZATION_BENCHMARK.map(item => item.id))
  assert.equal(ids.size, 36)
  for (const item of COS_EVIDENCE_UTILIZATION_BENCHMARK) {
    assert.equal(item.requiresLocalReasoning, true)
    assert.equal(item.requiresProvenance, true)
    assert.ok(item.requiredTerms.length >= 2)
    assert.match(item.track, /^evidence_utilization:/)
  }
})

test('benchmark probe timeout override remains bounded and does not weaken the default diagnostic timeout', () => {
  assert.equal(reasonerProbeCompletionTimeoutMs(), 45_000)
  assert.equal(reasonerProbeCompletionTimeoutMs(1_000), 5_000)
  assert.equal(reasonerProbeCompletionTimeoutMs(90_000), 90_000)
  assert.equal(reasonerProbeCompletionTimeoutMs(999_999), 120_000)
})

test('ordinary COS answers enrich server-stored provenance with the request-local turn id', () => {
  const source = file('../lib/ai/cos/cosFirstAnswer.ts')
  assert.match(source, /peekEvidenceSourceUseTurnId\(\)/)
  assert.match(source, /provenance:\s*\{[\s\S]*turnId/)
  assert.match(source, /beginEvidenceSourceUseTurn\(\)/)
})

test('authoritative provenance preserves the reasoner turn id for server-owned message persistence', () => {
  const source = file('../lib/ai/cos/cosOrchestration.ts')
  assert.match(source, /typeof current\?\.turnId === 'string'/)
  assert.match(source, /provenance\.turnId = turnId/)
})

test('assistant feedback derives turn id from server-owned message provenance, never the client body', () => {
  const source = file('../app/api/assistant/feedback/route.ts')
  assert.match(source, /select\('role,content,created_at,provenance'\)/)
  assert.match(source, /asRecord\(assistantMessage\?\.provenance\)\.turnId/)
  assert.match(source, /attachTurnOutcome\(turnId/)
  assert.doesNotMatch(source, /body\?\.turnId/)
})

test('verified production outcome keeps its evidence guard and supports only explicit turn correlation', () => {
  const source = file('../lib/ai/cos/cognitiveVerifiedOutcome.ts')
  assert.match(source, /\^\(\?:model\|council\|llm\|consensus\|frontier_teacher\):/)
  assert.match(source, /kind !== 'cos_turn_id'/)
  assert.match(source, /attachTurnOutcome\(turnId/)
})

test('migration makes outcomes race-safe and keeps utilization benchmark separate from capability cases', () => {
  const source = file('../supabase/migrations/20260821_cos_turn_outcomes_and_utilization_benchmark.sql')
  assert.match(source, /create table if not exists public\.cos_turn_outcomes/i)
  assert.match(source, /create or replace function public\.cos_merge_turn_outcome/i)
  assert.match(source, /add column if not exists turn_id uuid/i)
  assert.match(source, /cos_evidence_utilization_benchmark_runs/i)
  assert.match(source, /cos_evidence_utilization_benchmark_results/i)
})

test('controlled benchmark is operator-accessible, route-budget safe and resumes from actual attempts', () => {
  const route = file('../app/api/admin/cos-evidence-utilization-benchmark/route.ts')
  assert.match(route, /BENCHMARK_PROBE_TIMEOUT_MS = 90_000/)
  assert.match(route, /probeReasoner\(\{ completionTimeoutMs: BENCHMARK_PROBE_TIMEOUT_MS \}\)/)
  assert.match(route, /START_NEXT_CASE_CUTOFF_MS/)
  assert.match(route, /completedAttempts/)
  assert.match(route, /start \+ attempted/)
  assert.match(route, /stoppedEarlyForBudget/)

  const page = file('../app/dashboard/cos-capability-benchmark/page.tsx')
  assert.match(page, /\/api\/admin\/cos-evidence-utilization-benchmark/)
  assert.match(page, /runUtilization/)
  assert.match(page, /Run evidence utilization/)
  assert.match(page, /latestScoredRate/)
  assert.match(page, /find\(item => Number\(item\.attempted\) > 0\)/)
})
