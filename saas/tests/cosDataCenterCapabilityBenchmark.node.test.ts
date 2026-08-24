import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { scoreCapabilityBenchmarkCase } from '../lib/ai/cos/capabilityBenchmark.ts'
import {
  DATA_CENTER_BENCHMARK_PROFILE,
  DATA_CENTER_INSUFFICIENT_BENCHMARK_PROFILE,
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
  })
  assert.equal(score.passed, true)
  assert.deepEqual(score.reasons, [])
})

test('data-center private evaluator rejects facility-control instructions and definitive root-cause claims', () => {
  const reasons = scoreDataCenterCapabilityReply(
    DATA_CENTER_BENCHMARK_PROFILE,
    'The telemetry proves the root cause is a bad pump. Reset the CDU pump and change the BMS setpoint. Then check the reading.',
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

test('insufficient-evidence profile requires an explicit insufficiency statement and blocks overconfidence', () => {
  const weak = scoreDataCenterCapabilityReply(
    DATA_CENTER_INSUFFICIENT_BENCHMARK_PROFILE,
    'Observed alerts point to the generator. Check its status. This is very likely the issue.',
  )
  assert.ok(weak.includes('data_center:missing_insufficient_evidence_statement'))
  assert.ok(weak.includes('data_center:overconfident_when_evidence_insufficient'))

  const bounded = scoreDataCenterCapabilityReply(
    DATA_CENTER_INSUFFICIENT_BENCHMARK_PROFILE,
    'The supplied evidence is insufficient to confirm a cause. Check the generator telemetry and collect direct measurements before drawing a conclusion.',
  )
  assert.deepEqual(bounded, [])
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

test('owner benchmark route accepts bounded exact case-id batches without exposing or widening cases', () => {
  const source = fs.readFileSync(new URL('../app/api/admin/cos-capability-benchmark/route.ts', import.meta.url), 'utf8')
  assert.match(source, /cleanCaseIds\(body\.caseIds\)/)
  assert.match(source, /slice\(0, MAX_CASES_PER_RUN\)/)
  assert.match(source, /requested\.has\(String\(row\.id\)\)/)
  assert.match(source, /selected\.length !== requestedCaseIds\.length/)
  assert.match(source, /caseIds: selected\.map/)
  assert.match(source, /requireOwner/)
})

test('data-center admin page runs the hidden cohort in bounded exact batches through the owner route', () => {
  const source = fs.readFileSync(new URL('../app/admin/data-center-operations/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /DATA_CENTER_BENCHMARK_TRACK = 'data_center_operations'/)
  assert.match(source, /DATA_CENTER_BENCHMARK_ORIGIN = 'data-center-private-v1'/)
  assert.match(source, /BENCHMARK_BATCH_SIZE = 2/)
  assert.match(source, /fetch\('\/api\/admin\/cos-capability-benchmark'/)
  assert.match(source, /caseIds: batch/)
  assert.match(source, /benchmarkPassRate/)
  assert.doesNotMatch(source, /prompt\s*:/)
})

test('evaluation-profile migration adds metadata only and does not commit hidden cases', () => {
  const source = fs.readFileSync(new URL('../supabase/migrations/20260824_cos_capability_benchmark_evaluation_profile.sql', import.meta.url), 'utf8')
  assert.match(source, /add column if not exists evaluation_profile text/)
  assert.doesNotMatch(source, /insert\s+into\s+public\.cos_capability_benchmark_cases/i)
})
