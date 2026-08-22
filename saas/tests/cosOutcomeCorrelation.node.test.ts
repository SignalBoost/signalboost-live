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

test('assistant feedback derives turn id from server-owned records and never the client body', () => {
  const source = file('../app/api/assistant/feedback/route.ts')
  assert.match(source, /select\('role,content,created_at,provenance'\)/)
  assert.match(source, /asRecord\(assistantMessage\?\.provenance\)\.turnId/)
  assert.match(source, /from\('cos_latest_turn_provenance'\)/)
  assert.match(source, /\.eq\('assistant_content', assistantContent\)/)
  assert.match(source, /hashPrompt\(userPrompt\) !== storedPromptHash/)
  assert.match(source, /from\('cos_turn_experience'\)/)
  assert.match(source, /attachTurnOutcome\(target\.turnId/)
  assert.doesNotMatch(source, /body\?\.turnId/)
})

test('concierge dock exposes outcome feedback only for correlated COS replies', () => {
  const source = file('../components/Concierge.tsx')
  assert.match(source, /execution_provenance\?\.turnId/)
  assert.match(source, /feedbackEligible/)
  assert.match(source, /\/api\/assistant\/feedback/)
  assert.match(source, /userPrompt:\s*message\.feedbackPrompt/)
  assert.match(source, /assistantFeedback\.helpful/)
  assert.match(source, /assistantFeedback\.notHelpful/)
  assert.match(source, /assistantFeedback\.correctThis/)
  assert.doesNotMatch(source, /turnId\s*:/)
})

test('verified production outcome keeps its evidence guard and supports only explicit turn correlation', () => {
  const source = file('../lib/ai/cos/cognitiveVerifiedOutcome.ts')
  assert.match(source, /\^\(\?:model\|council\|llm\|consensus\|frontier_teacher\):/)
  assert.match(source, /kind !== 'cos_turn_id'/)
  assert.match(source, /attachTurnOutcome\(turnId/)
})

test('migration makes outcomes race-safe and keeps utilization benchmark separate from capability cases', () => {
  const source = file('../supabase/migrations/20260821_cos_turn_outcomes_and_utilization_benchmark.sql')
  const chronology = file('../supabase/migrations/20260822_cos_turn_outcome_chronology.sql')
  const store = file('../lib/ai/cos/turnExperienceStore.ts')
  assert.match(source, /create table if not exists public\.cos_turn_outcomes/i)
  assert.match(chronology, /create or replace function public\.cos_merge_turn_outcome_chronological/i)
  assert.match(chronology, /where excluded\.outcome_at >= cos_turn_outcomes\.outcome_at/i)
  assert.match(store, /rpc\('cos_merge_turn_outcome_chronological'/)
  assert.match(store, /if \(merged\.data !== true\) return true/)
  assert.match(source, /add column if not exists turn_id uuid/i)
  assert.match(source, /cos_evidence_utilization_benchmark_runs/i)
  assert.match(source, /cos_evidence_utilization_benchmark_results/i)
})

test('quality repair persistence preserves a useful Supabase error instead of object coercion', () => {
  const source = file('../lib/ai/cos/reasonerQuality.ts')
  assert.match(source, /qualityRepairPersistenceError/)
  assert.match(source, /value\.code, value\.message, value\.details, value\.hint/)
  assert.match(source, /JSON\.stringify\(error\)/)
})

test('cache write budget cancels its timer when writes finish and no longer claims successful writes were abandoned', () => {
  const source = file('../lib/ai/cos/cosFirstAnswerEnterprise.ts')
  assert.match(source, /waitForCacheWritesWithinBudget/)
  assert.match(source, /if \(timer\) clearTimeout\(timer\)/)
  assert.match(source, /cache writes exceeded response budget; response continued while writes remain best-effort/)
  assert.doesNotMatch(source, /cache write exceeded its budget and was abandoned/)
})

test('benchmark probe override is bounded without changing the default diagnostic timeout', () => {
  const probe = file('../lib/ai/cos/reasonerProbe.ts')
  assert.match(probe, /const COMPLETION_TIMEOUT_MS = 45_000/)
  assert.match(probe, /const MIN_COMPLETION_TIMEOUT_MS = 5_000/)
  assert.match(probe, /const MAX_COMPLETION_TIMEOUT_MS = 120_000/)
  assert.match(probe, /export function reasonerProbeCompletionTimeoutMs/)
  assert.match(probe, /Math\.max\(MIN_COMPLETION_TIMEOUT_MS, Math\.min\(MAX_COMPLETION_TIMEOUT_MS/)
  assert.match(probe, /completionResponse\(config, !strictModelList, completionTimeoutMs\)/)
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