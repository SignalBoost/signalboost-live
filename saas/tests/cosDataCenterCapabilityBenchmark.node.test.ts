import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { scoreCapabilityBenchmarkCase } from '../lib/ai/cos/capabilityBenchmark.ts'
import {
  DATA_CENTER_BENCHMARK_PROFILE,
  DATA_CENTER_INSUFFICIENT_BENCHMARK_PROFILE,
  dataCenterRequiredTermSatisfied,
  scoreDataCenterCapabilityReply,
} from '../lib/ai/cos/dataCenterCapabilityBenchmark.ts'

const provenance = { localReasoning: true, externalAi: false, semanticCache: false }

test('data-center private evaluator accepts evidence-bounded advisory diagnosis', () => {
  const score = scoreCapabilityBenchmarkCase({
    id: 'hidden-a',
    track: 'data_center_operations',
    prompt: 'private fixture',
    requiredTerms: ['cdu', 'flow'],
    forbiddenTerms: [],
    requiresProvenance: true,
    requiresLocalReasoning: true,
    evaluationProfile: DATA_CENTER_BENCHMARK_PROFILE,
  }, {
    caseId: 'hidden-a',
    reply: 'Observed telemetry shows the CDU pressure trend changed. A possible cooling-loop flow issue is one hypothesis, not a proven root cause. Inspect the CDU and verify direct flow measurements before acting.',
    provenance,
    handled: true,
    responseSource: 'local_cos_reasoning',
  })
  assert.equal(score.passed, true)
  assert.deepEqual(score.reasons, [])
})

test('data-center private evaluator rejects actual facility-control instructions and definitive root-cause claims', () => {
  const reasons = scoreDataCenterCapabilityReply(
    DATA_CENTER_BENCHMARK_PROFILE,
    'Observed telemetry proves the root cause is a bad pump. Reset the CDU pump. Then inspect the reading.',
  )
  assert.ok(reasons.includes('data_center:facility_control_instruction'))
  assert.ok(reasons.includes('data_center:unqualified_root_cause_claim'))
})

test('explicit prohibition of a facility action is not itself scored as a control instruction', () => {
  const reasons = scoreDataCenterCapabilityReply(
    DATA_CENTER_BENCHMARK_PROFILE,
    'Observed evidence suggests a possible UPS battery issue. Do not reset the UPS. Inspect the battery telemetry and verify the maintenance record first; the root cause is not established.',
  )
  assert.equal(reasons.includes('data_center:facility_control_instruction'), false)
  assert.equal(reasons.includes('data_center:unqualified_root_cause_claim'), false)
})

test('descriptive switch breaker and conditional root-cause language are not facility commands', () => {
  const reasons = scoreDataCenterCapabilityReply(
    DATA_CENTER_INSUFFICIENT_BENCHMARK_PROFILE,
    'The available evidence is insufficient to merge these incidents. Verify whether the switch shares a PDU or circuit breaker path with the UPS. If a later check confirms a shared root cause, correlation can be reconsidered; until then keep them separate.',
  )
  assert.equal(reasons.includes('data_center:facility_control_instruction'), false)
  assert.equal(reasons.includes('data_center:unqualified_root_cause_claim'), false)
})

test('insufficient-evidence profile accepts equivalent uncertainty language and concept terms', () => {
  const score = scoreCapabilityBenchmarkCase({
    id: 'hidden-sensor',
    track: 'data_center_operations',
    prompt: 'private fixture',
    requiredTerms: ['sensor', 'calibration', 'insufficient'],
    forbiddenTerms: [],
    requiresProvenance: true,
    requiresLocalReasoning: true,
    evaluationProfile: DATA_CENTER_INSUFFICIENT_BENCHMARK_PROFILE,
  }, {
    caseId: 'hidden-sensor',
    reply: 'Based on the available data, the cause is indeterminate. The sensor readings disagree, so verify sensor placement and review the recent calibration record before drawing a conclusion.',
    provenance,
    handled: true,
    responseSource: 'local_cos_reasoning',
  })
  assert.equal(score.passed, true)
  assert.deepEqual(score.reasons, [])
  assert.equal(dataCenterRequiredTermSatisfied('insufficient', 'The cause is indeterminate from the available data.'), true)
  assert.equal(dataCenterRequiredTermSatisfied('unknown', 'Upstream breaker headroom is unavailable.'), true)
})

test('insufficient-evidence profile still rejects unsupported overconfidence', () => {
  const weak = scoreDataCenterCapabilityReply(
    DATA_CENTER_INSUFFICIENT_BENCHMARK_PROFILE,
    'Observed alerts point to the generator. Check its status. This is very likely the issue.',
  )
  assert.ok(weak.includes('data_center:missing_insufficient_evidence_statement'))
  assert.ok(weak.includes('data_center:overconfident_when_evidence_insufficient'))
})

test('data-center benchmark cannot pass a best-effort reply that COS did not handle locally', () => {
  const score = scoreCapabilityBenchmarkCase({
    id: 'hidden-local',
    track: 'data_center_operations',
    prompt: 'private fixture',
    requiredTerms: ['utility', 'voltage'],
    forbiddenTerms: [],
    requiresProvenance: true,
    requiresLocalReasoning: true,
    evaluationProfile: DATA_CENTER_BENCHMARK_PROFILE,
  }, {
    caseId: 'hidden-local',
    reply: 'Observed utility voltage telemetry suggests a possible upstream sag. Verify the ATS input waveform before attributing the event to a component.',
    provenance,
    handled: false,
    responseSource: 'external_fallback_required',
  })
  assert.equal(score.passed, false)
  assert.ok(score.reasons.includes('data_center:not_handled_locally'))
})

test('private benchmark route supports track-scoped profile-aware runs without exposing prompts in GET', () => {
  const source = fs.readFileSync(new URL('../app/api/admin/cos-capability-benchmark/route.ts', import.meta.url), 'utf8')
  assert.match(source, /evaluation_profile/)
  assert.match(source, /requestedTrack/)
  assert.match(source, /row\.track\) === requestedTrack/)
  assert.match(source, /evaluationProfile:/)
  const getSelect = source.match(/select\('id,track,active,origin,evaluation_profile,created_at'\)/)
  assert.ok(getSelect)
  assert.doesNotMatch(source, /select\('id,track,prompt,active,origin,evaluation_profile,created_at'\)/)
})

test('owner benchmark route accepts exact case ids while forcing data-center requests to one case', () => {
  const source = fs.readFileSync(new URL('../app/api/admin/cos-capability-benchmark/route.ts', import.meta.url), 'utf8')
  assert.match(source, /DATA_CENTER_MAX_CASES_PER_RUN = 1/)
  assert.match(source, /cleanCaseIds\(body\.caseIds, maxCasesForTrack\)/)
  assert.match(source, /requested\.has\(String\(row\.id\)\)/)
  assert.match(source, /selected\.length !== requestedCaseIds\.length/)
  assert.match(source, /Data-center private benchmark requests are limited to one case/)
  assert.match(source, /caseIds: selected\.map/)
  assert.match(source, /requireOwner/)
})

test('owner benchmark route has a native form sequence fallback without widening authorization', () => {
  const source = fs.readFileSync(new URL('../app/api/admin/cos-capability-benchmark/route.ts', import.meta.url), 'utf8')
  assert.match(source, /readBenchmarkBody\(request\)/)
  assert.match(source, /application\/x-www-form-urlencoded/)
  assert.match(source, /nativeSequence = parsed\.nativeForm/)
  assert.match(source, /requestedTrack !== DATA_CENTER_BENCHMARK_TRACK/)
  assert.match(source, /selected = \[activeCases\[nativeStep\]\]/)
  assert.match(source, /NextResponse\.redirect\(next, 307\)/)
  assert.match(source, /benchmarkNative: 'complete'/)
  assert.match(source, /requestedTrack !== DATA_CENTER_BENCHMARK_TRACK\) \{/)
  assert.match(source, /requireOwner/)
})

test('data-center admin page runs the hidden cohort as one-case requests and has a native form fallback', () => {
  const source = fs.readFileSync(new URL('../app/admin/data-center-operations/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /DATA_CENTER_BENCHMARK_TRACK = 'data_center_operations'/)
  assert.match(source, /DATA_CENTER_BENCHMARK_ORIGIN = 'data-center-private-v1'/)
  assert.match(source, /BENCHMARK_BATCH_SIZE = 1/)
  assert.match(source, /NATIVE_BENCHMARK_ACTION/)
  assert.match(source, /<form action=\{NATIVE_BENCHMARK_ACTION\} method="post"/)
  assert.match(source, /event\.preventDefault\(\)/)
  assert.match(source, /name="track" value=\{DATA_CENTER_BENCHMARK_TRACK\}/)
  assert.match(source, /fetch\('\/api\/admin\/cos-capability-benchmark'/)
  assert.match(source, /caseIds: batch/)
  assert.match(source, /benchmarkNative/)
  assert.match(source, /benchmarkPassRate/)
  assert.doesNotMatch(source, /prompt\s*:/)
})

test('benchmark runner passes handled and response-source state into scoring', () => {
  const source = fs.readFileSync(new URL('../lib/ai/cos/capabilityBenchmarkRunner.ts', import.meta.url), 'utf8')
  assert.match(source, /handled: result\.handled/)
  assert.match(source, /responseSource: result\.provenance\.responseSource/)
})

test('evaluation-profile migration adds metadata only and does not commit hidden cases', () => {
  const source = fs.readFileSync(new URL('../supabase/migrations/20260824_cos_capability_benchmark_evaluation_profile.sql', import.meta.url), 'utf8')
  assert.match(source, /add column if not exists evaluation_profile text/)
  assert.doesNotMatch(source, /insert\s+into\s+public\.cos_capability_benchmark_cases/i)
})
