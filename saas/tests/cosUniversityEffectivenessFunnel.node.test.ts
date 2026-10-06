// saas/tests/cosUniversityEffectivenessFunnel.node.test.ts
//
// The Artifact Effectiveness Funnel: one cohort counted through every stage from the tables, with the honesty rows.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  EVALUATION_FAILED_CLAIM,
  FUNNEL_COHORT_LIMIT,
  FUNNEL_READ_CHUNK,
  FUNNEL_ROWS_PER_CHUNK,
  FUNNEL_SCHEMA_VERSION,
  composeFunnel,
  describeFunnel,
  readEffectivenessFunnel,
} from '../lib/ai/cos/cosUniversityEffectivenessFunnel.ts'
import { isEvaluatorInfrastructureFailure } from '../lib/ai/cos/cosUniversityMassEvaluationRollingAuthority.ts'
import { COS_UNIVERSITY_FUNNEL_COPY } from '../lib/i18n/cosUniversityFunnelCopy.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const H = (c: string) => c.repeat(64)
const NOW = new Date('2026-10-04T20:00:00Z')

/** PostgREST-shaped store over in-memory tables; records every query so chunking can be proven. */
function fakeDb(tables: Record<string, any[]>, failing: Set<string> = new Set()) {
  const queries: Array<{ table: string; columns: string; inSize: number | null; range: [number, number] | null }> = []
  const db = {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = []
      let columns = '*'
      let inSize: number | null = null
      let order: { column: string; ascending: boolean } | null = null
      let limit = Infinity
      let range: [number, number] | null = null
      const run = () => {
        queries.push({ table, columns, inSize, range })
        if (failing.has(table)) return { data: null, error: new Error(`${table}_unreadable`) }
        let rows = (tables[table] || []).filter(row => filters.every(f => f(row)))
        if (order) rows = [...rows].sort((a, b) => String(a[order!.column] ?? '').localeCompare(String(b[order!.column] ?? '')) * (order!.ascending ? 1 : -1))
        if (range) rows = rows.slice(range[0], range[1] + 1)
        else rows = rows.slice(0, limit)
        return { data: rows, error: null }
      }
      const q: any = {
        select(c: string) { columns = c; return q },
        eq(column: string, value: unknown) { filters.push(row => String(row[column]) === String(value)); return q },
        neq(column: string, value: unknown) { filters.push(row => String(row[column]) !== String(value)); return q },
        gte(column: string, value: string) { filters.push(row => String(row[column] ?? '') >= value); return q },
        in(column: string, values: readonly unknown[]) { inSize = values.length; const set = new Set(values.map(String)); filters.push(row => set.has(String(row[column]))); return q },
        order(column: string, options: { ascending: boolean }) { order = { column, ascending: options.ascending }; return q },
        limit(n: number) { limit = n; return q },
        range(from: number, to: number) { range = [from, to]; return q },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject) },
      }
      return q
    },
  }
  return { db, queries }
}

/** Four artifacts born this week: one full life, one failed exam, one quarantined, one old (outside 24h). */
const week = () => ({
  cos_local_distillation_artifacts: [
    { candidate_id: 'a', trained_artifact_hash: H('a'), status: 'active', subject_id: 'cs', created_at: '2026-10-04T10:00:00Z' },
    { candidate_id: 'b', trained_artifact_hash: H('b'), status: 'evaluation_pending', subject_id: 'law', created_at: '2026-10-04T11:00:00Z' },
    { candidate_id: 'c', trained_artifact_hash: H('c'), status: 'quarantined', subject_id: 'law', created_at: '2026-10-03T11:00:00Z' },
    { candidate_id: 'd', trained_artifact_hash: H('d'), status: 'retired', subject_id: 'cs', created_at: '2026-09-30T11:00:00Z' },
  ],
  cos_university_artifact_birth_certificates: [{ candidate_id: 'a', trained_artifact_hash: H('a'), permanent_artifact_id: 'ai-a' }, { candidate_id: 'b', trained_artifact_hash: H('b'), permanent_artifact_id: 'ai-b' }, { candidate_id: 'c', trained_artifact_hash: H('c'), permanent_artifact_id: 'ai-c' }],
  cos_university_mass_distillation_batch_runs: [
    { stage: 'complete', subject_id: 'cs', created_at: '2026-10-04T09:00:00Z' },
    { stage: 'complete', subject_id: 'law', created_at: '2026-10-04T09:30:00Z' },
    { stage: 'failed', subject_id: 'law', created_at: '2026-10-04T09:40:00Z' },
    { stage: 'training_dispatched', subject_id: 'cs', created_at: '2026-10-04T19:00:00Z' },
    { stage: 'complete', subject_id: 'cs', created_at: '2026-09-20T09:00:00Z' },
  ],
  cos_university_distilled_evaluation_runs: [
    // a: failed first, passed later -> the LATEST run decides.
    { candidate_id: 'a', trained_artifact_hash: H('a'), created_at: '2026-10-04T12:00:00Z', baseline_score: 0.4, trained_artifact_score: 0.3, holdout_improved: false, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true },
    { candidate_id: 'a', trained_artifact_hash: H('a'), created_at: '2026-10-04T13:00:00Z', baseline_score: 0.4, trained_artifact_score: 0.7, holdout_improved: true, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true },
    { candidate_id: 'c', trained_artifact_hash: H('c'), created_at: '2026-10-03T12:00:00Z', baseline_score: 0.5, trained_artifact_score: 0.6, holdout_improved: true, safety_passed: false, unseen_transfer_passed: true, delayed_retention_passed: true },
    // a different hash of candidate b: not this cohort's artifact.
    { candidate_id: 'b', trained_artifact_hash: H('9'), created_at: '2026-10-04T12:00:00Z', baseline_score: 0.2, trained_artifact_score: 0.9, holdout_improved: true, safety_passed: true, unseen_transfer_passed: true, delayed_retention_passed: true },
  ],
  cos_university_residency_enrollments: [
    { id: 'res-a', candidate_id: 'a', trained_artifact_hash: H('a'), standing: 'residency_complete' },
    // An older artifact of the same candidate: its Residency evidence must not count for the cohort's artifact.
    { id: 'res-a-old', candidate_id: 'a', trained_artifact_hash: H('9'), standing: 'residency_failed' },
  ],
  cos_university_residency_case_runs: [
    { residency_id: 'res-a', status: 'passed', harness_outcome: 'success' }, { residency_id: 'res-a', status: 'passed', harness_outcome: 'success' }, { residency_id: 'res-a', status: 'failed', harness_outcome: 'agent_failure', failure_code: 'assertion_failed', metadata: { builderLoop: { outcome: 'incomplete', failureCode: 'builder_stalled_repeated_inspection', traceSteps: 19, filesChanged: 0 } } },
    { residency_id: 'res-a', status: 'started' },
    { residency_id: 'res-a-old', status: 'failed', harness_outcome: 'infrastructure_failure', failure_code: 'old_artifact_failure' },
  ],
  cos_university_residency_competency_evidence: [
    { residency_id: 'res-a', competency_id: 'root_cause_diagnosis', outcome: 'pass' }, { residency_id: 'res-a', competency_id: 'rollback_judgment', outcome: 'pass' }, { residency_id: 'res-a', competency_id: 'supabase_diagnosis', outcome: 'fail' },
  ],
  cos_university_graduate_model_registry: [{ candidate_id: 'a', trained_artifact_hash: H('a'), promoted_at: '2026-10-04T14:00:00Z', activated_at: '2026-10-04T14:30:00Z' }],
  cos_workforce_roster: [{ candidate_id: 'a', trained_artifact_hash: H('a') }],
  cos_workforce_assignments: [
    { permanent_artifact_id: 'ai-a', source_kind: 'production_request', status: 'verified', assigned_at: '2026-10-04T15:10:00Z' },
    { permanent_artifact_id: 'ai-a', source_kind: 'production_request', status: 'remediation', assigned_at: '2026-10-04T15:20:00Z' },
    { permanent_artifact_id: 'ai-a', source_kind: 'production_shadow', status: 'runtime_failed', assigned_at: '2026-10-04T15:30:00Z' },
    { permanent_artifact_id: 'ai-a', source_kind: 'production_request', status: 'served', assigned_at: '2026-10-04T15:40:00Z' },
  ],
  cos_university_mass_distillation_provider_jobs: [
    { candidate_id: 'a', trained_artifact_hash: H('a'), operation: 'teacher', observed_cost_usd: 0.2, settled_at: '2026-10-04T12:00:00Z' },
    { candidate_id: 'a', trained_artifact_hash: H('a'), operation: 'training', observed_cost_usd: 1.5, settled_at: '2026-10-04T13:00:00Z' },
    { candidate_id: 'b', trained_artifact_hash: H('b'), operation: 'training', observed_cost_usd: 1.2, settled_at: '2026-10-04T13:30:00Z' },
    { candidate_id: 'c', trained_artifact_hash: H('c'), operation: 'training', observed_cost_usd: null, settled_at: null },
  ],
  cos_university_graduate_resumes: [{ candidate_id: 'a', trained_artifact_hash: H('a') }],
  cos_university_graduate_serving_attempts: [
    { attempt_id: '1', candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'attempt_started', outcome: 'pending', latency_ms: 0, recorded_at: '2026-10-04T15:00:00Z' },
    { attempt_id: '1', candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'attempt_succeeded', outcome: 'success', latency_ms: 9000, recorded_at: '2026-10-04T15:00:09Z' },
    { attempt_id: '2', candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'attempt_failed', outcome: 'timeout', latency_ms: 60000, error_class: 'runtime_deadline_exceeded', recorded_at: '2026-10-04T15:02:00Z' },
    { attempt_id: '3', candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'attempt_succeeded', outcome: 'success', latency_ms: 18000, recorded_at: '2026-10-04T15:03:00Z' },
    { attempt_id: '4', candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'fallback', outcome: 'fallback', latency_ms: 8100, error_class: 'runtime_unavailable', recorded_at: '2026-10-04T15:04:00Z' },
  ],
  cos_university_graduate_lifecycle_events: [{ candidate_id: 'a', trained_artifact_hash: H('a'), event_type: 'verified_outcome' }],
  cos_university_lifecycle_orchestration: [
    { station: 'EXACT_CANARY', stage_entered_at: '2026-10-04T10:00:00Z', stage_deadline_at: '2026-10-04T10:30:00Z', lease_until: null, terminal: false },
    { station: 'EXACT_CANARY', stage_entered_at: '2026-10-04T11:00:00Z', stage_deadline_at: '2026-10-04T11:30:00Z', lease_until: '2026-10-04T20:05:00Z', terminal: false },
    { station: 'INDEPENDENT_EVALUATION', stage_entered_at: '2026-10-04T11:50:00Z', stage_deadline_at: '2026-10-04T12:30:00Z', lease_until: null, terminal: false },
  ],
  cos_university_lifecycle_transition_history: [
    { from_station: 'EXACT_CANARY', transitioned_at: '2026-10-04T11:00:00Z', duration_seconds: 1800, was_overdue: false },
    { from_station: 'EXACT_CANARY', transitioned_at: '2026-10-04T11:20:00Z', duration_seconds: 2400, was_overdue: true },
    { from_station: 'INDEPENDENT_EVALUATION', transitioned_at: '2026-10-04T11:40:00Z', duration_seconds: 3000, was_overdue: true },
  ],
  security_repository_patrol_evidence: [
    { engagement_id: 'patrol', chain_index: 0, previous_hash: '0'.repeat(64), entry_hash: '1'.repeat(64), recorded_at: '2026-10-04T12:00:00Z' },
    { engagement_id: 'patrol', chain_index: 1, previous_hash: '1'.repeat(64), entry_hash: '2'.repeat(64), recorded_at: '2026-10-04T12:01:00Z' },
  ],
  cos_university_learning_assurance_events: [
    { event_type: 'fine_tune', authority_expanded: false, observed_at: '2026-10-04T12:05:00Z', evidence: { claim: EVALUATION_FAILED_CLAIM, error: 'mass_distilled_evaluation_judge_zero_collapse:safety' } },
    { event_type: 'fine_tune', authority_expanded: false, observed_at: '2026-10-04T12:06:00Z', evidence: { claim: EVALUATION_FAILED_CLAIM, error: 'mass_distilled_evaluation_candidate_answer_empty:0666f0:finish=stop' } },
    { event_type: 'fine_tune', observed_at: '2026-10-04T13:05:00Z', evidence: { claim: 'mass_distilled_independent_evaluation_completed' } },
    { event_type: 'fine_tune', observed_at: '2026-09-20T13:05:00Z', evidence: { claim: EVALUATION_FAILED_CLAIM, error: 'mass_distilled_evaluation_judge_timeout:holdout' } },
    { event_type: 'production_path', observed_at: '2026-10-04T12:05:00Z', evidence: { error: 'mass_distilled_evaluation_judge_zero_collapse:safety' } },
  ],
})

const stageCount = (f: Awaited<ReturnType<typeof readEffectivenessFunnel>>, id: string) => f.stages.find(s => s.id === id)?.count

test('the 7-day cohort is followed through every stage; the latest exam decides; a different hash is not this artifact', async () => {
  const f = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: '7d', now: NOW })
  assert.equal(f.schemaVersion, FUNNEL_SCHEMA_VERSION)
  assert.equal(f.since, '2026-09-27T20:00:00.000Z')
  assert.equal(f.cohort.size, 4)
  assert.equal(f.cohort.truncated, false)
  const expect: Record<string, number> = {
    born: 4, birth_certificate: 3, examined: 2, improved_over_baseline: 2, passed_safety: 1, passed_transfer: 2, passed_retention: 2,
    passed_all_gates: 1, residency_enrolled: 1, residency_complete: 1, graduated: 1, activated: 1, hired: 1,
    performed_work: 1, served_successfully: 1, verified_outcome: 1,
  }
  for (const [id, n] of Object.entries(expect)) assert.equal(stageCount(f, id), n, id)
  assert.equal(f.stages.find(s => s.id === 'graduated')?.share, 0.25)
  assert.ok(f.stages.every(s => s.source.startsWith('cos_')), 'every stage names its table')
  assert.deepEqual(f.rejected, { quarantined: 1, retired: 1, byStatus: { active: 1, evaluation_pending: 1, quarantined: 1, retired: 1 }, source: 'cos_local_distillation_artifacts' })
  assert.ok(f.production.available && f.production.runsStarted === 4 && f.production.runsCompleted === 2 && f.production.runsFailed === 1 && f.production.runsInFlight === 1)
  assert.ok(f.capabilityGain.available)
  if (f.capabilityGain.available) {
    assert.equal(f.capabilityGain.sampleSize, 2)
    assert.equal(f.capabilityGain.improved, 2)
    assert.equal(f.capabilityGain.regressed, 0)
    assert.equal(f.capabilityGain.meanBaseline, 0.45)
    assert.ok(Math.abs((f.capabilityGain.meanTrained ?? 0) - 0.65) < 1e-12)
    assert.ok(Math.abs((f.capabilityGain.meanAbsoluteGain ?? 0) - 0.2) < 1e-12)
    assert.ok(Math.abs((f.capabilityGain.medianAbsoluteGain ?? 0) - 0.2) < 1e-12)
    assert.equal(f.capabilityGain.positiveGainRate, 1)
  }
  assert.ok(f.reliability.available)
  if (f.reliability.available) {
    assert.equal(f.reliability.attempts, 4)
    assert.equal(f.reliability.successes, 2)
    assert.equal(f.reliability.failures, 1)
    assert.equal(f.reliability.fallbacks, 1)
    assert.equal(f.reliability.successRate, 0.5)
    assert.equal(f.reliability.p50LatencyMs, 9000)
    assert.equal(f.reliability.p90LatencyMs, 18000)
    assert.equal(f.reliability.p99LatencyMs, 18000)
    assert.equal(f.reliability.over15s, 1)
    assert.deepEqual(f.reliability.byOutcome, { fallback: 1, success: 2, timeout: 1 })
    assert.deepEqual(f.reliability.byErrorClass, { runtime_unavailable: 1, runtime_deadline_exceeded: 1 })
  }
  assert.ok(f.lineHealth.available)
  if (f.lineHealth.available) {
    assert.equal(f.lineHealth.liveUnits, 3)
    assert.equal(f.lineHealth.overdueUnits, 3)
    assert.equal(f.lineHealth.leasedUnits, 1)
    assert.equal(f.lineHealth.oldestWaitingSeconds, 36000)
    assert.equal(f.lineHealth.bottleneckStation, 'EXACT_CANARY')
    assert.deepEqual(f.lineHealth.byStation.EXACT_CANARY, { waiting: 2, overdue: 2, leased: 1, oldestWaitingSeconds: 36000 })
    assert.deepEqual(f.lineHealth.byStation.INDEPENDENT_EVALUATION, { waiting: 1, overdue: 1, leased: 0, oldestWaitingSeconds: 29400 })
  }
  assert.ok(f.lineHistory.available)
  if (f.lineHistory.available) {
    assert.equal(f.lineHistory.transitions, 3)
    assert.ok(Math.abs((f.lineHistory.throughputPerHour ?? 0) - (3 / (7 * 24))) < 1e-12, '7d throughput is transitions divided by the full 168-hour report window')
    assert.equal(f.lineHistory.recoveredOverdue, 2)
    assert.equal(f.lineHistory.meanRecoverySeconds, 2700)
    assert.equal(f.lineHistory.medianRecoverySeconds, 2400)
    assert.equal(f.lineHistory.p90RecoverySeconds, 3000)
    assert.equal(f.lineHistory.p50DwellSeconds, 2400)
    assert.equal(f.lineHistory.p90DwellSeconds, 3000)
    assert.equal(f.lineHistory.p99DwellSeconds, 3000)
    assert.deepEqual(f.lineHistory.byFromStation, { EXACT_CANARY: 2, INDEPENDENT_EVALUATION: 1 })
  }
  assert.ok(f.residencyEffectiveness.available)
  if (f.residencyEffectiveness.available) {
    assert.equal(f.residencyEffectiveness.enrollments, 1); assert.equal(f.residencyEffectiveness.completed, 1); assert.equal(f.residencyEffectiveness.caseRuns, 4); assert.equal(f.residencyEffectiveness.casesPassed, 2); assert.equal(f.residencyEffectiveness.casePassRate, 2 / 3); assert.equal(f.residencyEffectiveness.competencyEvidence, 3)
    assert.deepEqual({ ...f.residencyEffectiveness.caseOutcomes }, { success: 2, agent_failure: 1 }, 'finished cases by Harness verdict; a started case is not finished')
    assert.deepEqual({ ...f.residencyEffectiveness.topFailureCodes }, { assertion_failed: 1 }, 'failure codes only from non-passing finished cases')
    assert.deepEqual({ ...f.residencyEffectiveness.standings }, { residency_complete: 1 })
    assert.deepEqual({ ...f.residencyEffectiveness.failedCaseLoopStops }, { builder_stalled_repeated_inspection: 1 }, 'why the resident\'s own loop stopped, failed cases only')
    assert.equal(f.residencyEffectiveness.failedCasesWithNoFileChange, 1)
    assert.deepEqual({ ...f.residencyEffectiveness.competencyFailuresById }, { supabase_diagnosis: 1 }, 'skill failures by competency, exact artifact only')
  }
  assert.ok(f.workforceEffectiveness.available)
  if (f.workforceEffectiveness.available) {
    assert.equal(f.workforceEffectiveness.assignments, 4); assert.equal(f.workforceEffectiveness.verified, 1); assert.equal(f.workforceEffectiveness.remediation, 1); assert.equal(f.workforceEffectiveness.runtimeFailed, 1); assert.equal(f.workforceEffectiveness.servedAwaitingVerification, 1); assert.equal(f.workforceEffectiveness.verifiedRate, 0.5)
  }
  assert.ok(f.economics.available)
  if (f.economics.available) {
    assert.equal(f.economics.settledProviderJobs, 3); assert.ok(Math.abs(f.economics.observedProviderCostUsd - 2.9) < 1e-12); assert.ok(Math.abs((f.economics.byOperationUsd.teacher ?? 0) - 0.2) < 1e-12); assert.ok(Math.abs((f.economics.byOperationUsd.training ?? 0) - 2.7) < 1e-12); assert.ok(Math.abs((f.economics.costPerGraduatedArtifactUsd ?? 0) - 2.9) < 1e-12); assert.equal(f.economics.coverage, 'observed mass-distillation provider jobs for cohort candidate IDs; provider ledger has no artifact hash, so this is not exact-artifact cost attribution or total platform TCO')
  }
  assert.ok(f.provenance.available)
  if (f.provenance.available) {
    assert.equal(f.provenance.birthCertificates, 3); assert.equal(f.provenance.graduates, 1); assert.equal(f.provenance.resumes, 1); assert.equal(f.provenance.workforceAssignmentsWithPermanentId, 4); assert.equal(f.provenance.traceableGraduates, 1); assert.equal(f.provenance.traceableGraduateRate, 1)
  }
  assert.deepEqual(f.unavailable, {})
  assert.equal(describeFunnel(f), 'funnel window=7d born=4 examined=2 (50%) passed_all=1 (25%) graduated=1 (25%) hired=1 worked=1 verified=1 (25%) | gain n=2 mean=0.2000 positive=100% | reliability attempts=4 success=50% p90=18000ms | line live=3 overdue=3 leased=1 bottleneck=EXACT_CANARY | flow transitions=3 throughput=0.02/h recovered=2 | residency complete=1/1 cases=4 | workforce assignments=4 verified=1 remediation=1 runtime_failed=1 | observed_provider_cost=2.90 settled_jobs=3 | provenance traceable_graduates=1/1 | rejected quarantined=1 retired=1 | eval failures=2 infra=1 merit=1')
})


test('buyer assurance chapters fail closed when their evidence stores are unreadable', async () => {
  const failing = new Set(['cos_university_residency_case_runs', 'cos_workforce_assignments', 'cos_university_mass_distillation_provider_jobs', 'cos_university_graduate_resumes'])
  const f = await readEffectivenessFunnel({ db: fakeDb(week(), failing).db, window: '7d', now: NOW })
  assert.equal(f.residencyEffectiveness.available, false)
  assert.equal(f.workforceEffectiveness.available, false)
  assert.equal(f.economics.available, false)
  assert.equal(f.provenance.available, false)
})

test('buyer operational explanation reuses Self-Healing health and never disguises abnormal waiting as healthy', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityEffectivenessFunnel.ts', import.meta.url), 'utf8')
  assert.match(source, /readUniversityMassDistillationHealth/)
  assert.match(source, /classification === 'expected_wait'/)
  assert.match(source, /configured concurrency/i)
  assert.match(source, /classification === 'repair_required'/)
  assert.match(source, /canonical Self-Healing health model detected/)
  assert.match(source, /causeStatus: 'unresolved'/)
  assert.match(source, /No causal explanation is invented/)
  const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/EffectivenessFunnelPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /data-testid="operational-explanation"/)
  const operationalStart = panel.indexOf('data-testid="operational-explanation"')
  const operationalEnd = panel.indexOf('data-testid="evaluation-causal-explanations"', operationalStart)
  assert.ok(operationalStart >= 0 && operationalEnd > operationalStart)
  const operationalPanel = panel.slice(operationalStart, operationalEnd)
  assert.match(operationalPanel, /copy\.operationalBuyerMeaning/)
  assert.match(operationalPanel, /copy\.operationalOverdueJobs/)
  assert.doesNotMatch(operationalPanel, />Operational explanation</)
  assert.doesNotMatch(operationalPanel, />Buyer meaning:/)
})

test('line health counts only leases that are live at the report time', async () => {
  const fixture = week()
  fixture.cos_university_lifecycle_orchestration = [
    { station: 'EXACT_CANARY', stage_entered_at: '2026-10-04T19:00:00Z', stage_deadline_at: '2026-10-04T19:30:00Z', lease_until: '2026-10-04T19:59:59Z', terminal: false },
    { station: 'EXACT_CANARY', stage_entered_at: '2026-10-04T19:10:00Z', stage_deadline_at: '2026-10-04T19:40:00Z', lease_until: '2026-10-04T20:00:01Z', terminal: false },
  ]
  const f = await readEffectivenessFunnel({ db: fakeDb(fixture).db, window: '7d', now: NOW })
  assert.ok(f.lineHealth.available)
  if (!f.lineHealth.available) return
  assert.equal(f.lineHealth.liveUnits, 2)
  assert.equal(f.lineHealth.overdueUnits, 2, 'lease state does not hide an overdue unit')
  assert.equal(f.lineHealth.leasedUnits, 1, 'an expired lease is not active; a future lease is active')
  assert.deepEqual(f.lineHealth.byStation.EXACT_CANARY, { waiting: 2, overdue: 2, leased: 1, oldestWaitingSeconds: 3600 })
})

test('evaluation failures in the window are split by the rolling authority\'s own rule, and only terminal FAILED claims count', async () => {
  const f = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: '7d', now: NOW })
  assert.ok(f.evaluationFailures.available)
  if (!f.evaluationFailures.available) return
  assert.equal(f.evaluationFailures.total, 2, 'completed claims and production_path copies are not failures')
  assert.equal(f.evaluationFailures.infrastructure, 1)
  assert.equal(f.evaluationFailures.merit, 1)
  assert.deepEqual(f.evaluationFailures.byReason, { 'mass_distilled_evaluation_judge_zero_collapse:safety': 1, 'mass_distilled_evaluation_candidate_answer_empty:0666f0': 1 })
  assert.equal(f.evaluationFailures.rule, 'cosUniversityMassEvaluationRollingAuthority.isEvaluatorInfrastructureFailure')
  assert.equal(isEvaluatorInfrastructureFailure('mass_distilled_evaluation_judge_zero_collapse:safety'), true)
  assert.equal(isEvaluatorInfrastructureFailure('mass_distilled_evaluation_candidate_answer_empty:x'), false)
  const infra = f.evaluationFailures.explanations.find(x => x.reason.startsWith('mass_distilled_evaluation_judge_zero_collapse:'))
  const merit = f.evaluationFailures.explanations.find(x => x.reason.startsWith('mass_distilled_evaluation_candidate_answer_empty:'))
  assert.equal(infra?.attribution, 'infrastructure')
  assert.equal(infra?.causeStatus, 'evidence_backed')
  assert.match(infra?.systemResponse || '', /fails closed/i)
  assert.equal(merit?.attribution, 'competency')
  assert.equal(merit?.causeStatus, 'evidence_backed')
  assert.match(merit?.cause || '', /bounded candidate-only retry/i)
})

test('buyer causal explanations disclose unresolved causality instead of inventing a root cause', () => {
  const source = readFileSync(new URL('../lib/ai/cos/cosUniversityEffectivenessFunnel.ts', import.meta.url), 'utf8')
  assert.match(source, /causeStatus: 'unresolved'/)
  assert.match(source, /report does not invent a root cause/i)
  assert.match(source, /same classifier used by production disposition/i)
  const panel = readFileSync(new URL('../app/dashboard/cos-university-telemetry/EffectivenessFunnelPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /data-testid="evaluation-causal-explanations"/)
  assert.match(panel, /System response:/)
  assert.match(panel, /copy\.operationalBuyerMeaning/)
})

test('window and subject narrow the cohort and the production counts', async () => {
  const day = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: '24h', now: NOW })
  assert.equal(day.cohort.size, 2)
  assert.ok(day.production.available && day.production.runsStarted === 4)
  const cs = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: 'all', subjectId: 'cs', now: NOW })
  assert.equal(cs.since, null)
  assert.equal(cs.cohort.size, 2)
  assert.equal(cs.subjectId, 'cs')
  assert.ok(cs.production.available && cs.production.runsStarted === 3)
  assert.equal(stageCount(cs, 'graduated'), 1)
  const unknownWindow = await readEffectivenessFunnel({ db: fakeDb(week()).db, window: 'yesterday', now: NOW })
  assert.equal(unknownWindow.window, '7d', 'an unknown window falls back to 7d, never to all time')
})

test('an unreadable table zeroes its stages AND is named; a reader can never take that zero for a fact', async () => {
  const f = await readEffectivenessFunnel({ db: fakeDb(week(), new Set(['cos_university_graduate_model_registry'])).db, window: '7d', now: NOW })
  assert.equal(stageCount(f, 'graduated'), 0)
  assert.equal(stageCount(f, 'activated'), 0)
  assert.equal(stageCount(f, 'hired'), 1, 'other chapters still read')
  assert.deepEqual(f.unavailable, { graduation: 'cos_university_graduate_model_registry_unreadable' })
  assert.match(describeFunnel(f), /\| unavailable=graduation$/)
})

test('an empty cohort has no shares and no division by zero', () => {
  const empty = <T,>(v: T) => Object.freeze({ available: true as const, error: null, ...v })
  const f = composeFunnel({
    now: NOW, window: '24h', since: '2026-10-03T20:00:00.000Z', subjectId: null, cohort: [], truncated: false,
    production: empty({ runsStarted: 0, runsCompleted: 0, runsFailed: 0 }),
    certified: empty({ candidates: new Set<string>() }),
    examined: empty({ latestByKey: new Map() }),
    residency: empty({ enrolled: new Set<string>(), complete: new Set<string>() }),
    graduation: empty({ promoted: new Set<string>(), activated: new Set<string>() }),
    hired: empty({ candidates: new Set<string>() }),
    work: empty({ attempted: new Set<string>(), succeeded: new Set<string>() }),
    verified: empty({ candidates: new Set<string>() }),
    serving: empty({ terminalByAttempt: new Map() }),
    lineLedger: empty({ rows: [] }),
    transitionHistory: empty({ rows: [] }),
    residencyEvidence: empty({ enrollments: [], caseStatuses: [], competencyOutcomes: [] }),
    workforceAssignments: empty({ rows: [] }),
    providerCosts: empty({ rows: [] }),
    provenanceEvidence: empty({ certificates: new Set<string>(), graduates: new Set<string>(), resumes: new Set<string>() }),
    governanceEvidence: empty({ authorityExpansionObserved: 0, assuranceEvents: 0, repositoryEvidenceEntries: 0, repositoryEvidenceChainValid: null }),
    evaluationFailures: empty({ errors: [] }),
  })
  assert.ok(f.stages.every(s => s.count === 0 && s.share === null))
  assert.match(describeFunnel(f), /born=0 examined=0 \(n\/a\)/)
})

test('a large cohort is read in chunks of candidate ids, capped and reported as truncated', async () => {
  const tables = week()
  tables.cos_local_distillation_artifacts = Array.from({ length: FUNNEL_COHORT_LIMIT + 5 }, (_, i) => ({
    candidate_id: `m${i}`, trained_artifact_hash: H('e'), status: 'evaluation_ready', subject_id: 'cs', created_at: `2026-10-04T0${i % 10}:00:00Z`,
  }))
  const { db, queries } = fakeDb(tables)
  const f = await readEffectivenessFunnel({ db, window: '7d', now: NOW })
  assert.equal(f.cohort.size, FUNNEL_COHORT_LIMIT)
  assert.equal(f.cohort.truncated, true)
  const chunked = queries.filter(q => q.inSize !== null)
  assert.ok(chunked.length > 0 && chunked.every(q => (q.inSize as number) <= FUNNEL_READ_CHUNK), 'no in() read exceeds the chunk size')
  assert.equal(FUNNEL_READ_CHUNK, 100)
  assert.match(describeFunnel(f), /born=1500\+ /)
})

test('high-volume buyer evidence pages past the row boundary and proves exhaustion', async () => {
  const tables = week()
  tables.cos_university_graduate_serving_attempts = Array.from({ length: FUNNEL_ROWS_PER_CHUNK + 7 }, (_, i) => ({
    attempt_id: `bulk-${i}`, candidate_id: 'a', trained_artifact_hash: H('a'), phase: 'attempt_succeeded',
    outcome: 'success', latency_ms: 1000 + i, recorded_at: `2026-10-04T15:${String(i % 60).padStart(2, '0')}:00Z`,
  }))
  tables.cos_university_lifecycle_transition_history = Array.from({ length: FUNNEL_ROWS_PER_CHUNK + 3 }, (_, i) => ({
    from_station: i % 2 ? 'EXACT_CANARY' : 'INDEPENDENT_EVALUATION',
    transitioned_at: '2026-10-04T16:00:00Z', duration_seconds: i + 1, was_overdue: i % 3 === 0,
  }))
  const { db, queries } = fakeDb(tables)
  const f = await readEffectivenessFunnel({ db, window: '7d', now: NOW })
  assert.ok(f.reliability.available && f.reliability.attempts === FUNNEL_ROWS_PER_CHUNK + 7)
  assert.ok(f.lineHistory.available && f.lineHistory.transitions === FUNNEL_ROWS_PER_CHUNK + 3)
  if (f.lineHistory.available) assert.equal(f.lineHistory.p99DwellSeconds, Math.ceil((FUNNEL_ROWS_PER_CHUNK + 3) * 0.99))
  const servingPages = queries.filter(q => q.table === 'cos_university_graduate_serving_attempts' && q.columns.includes('attempt_id') && q.range)
  const historyPages = queries.filter(q => q.table === 'cos_university_lifecycle_transition_history' && q.range)
  assert.ok(servingPages.some(q => (q.range?.[0] ?? 0) >= FUNNEL_ROWS_PER_CHUNK), 'serving evidence reads a second page')
  assert.ok(historyPages.some(q => (q.range?.[0] ?? 0) >= FUNNEL_ROWS_PER_CHUNK), 'transition history reads a second page')
})

test('an exactly full evidence page performs the empty follow-up read instead of assuming completeness', async () => {
  const tables = week()
  tables.cos_university_lifecycle_transition_history = Array.from({ length: FUNNEL_ROWS_PER_CHUNK }, (_, i) => ({
    from_station: 'EXACT_CANARY', transitioned_at: '2026-10-04T16:00:00Z', duration_seconds: i + 1, was_overdue: false,
  }))
  const { db, queries } = fakeDb(tables)
  const f = await readEffectivenessFunnel({ db, window: '7d', now: NOW })
  assert.ok(f.lineHistory.available && f.lineHistory.transitions === FUNNEL_ROWS_PER_CHUNK)
  const historyPages = queries.filter(q => q.table === 'cos_university_lifecycle_transition_history' && q.range)
  assert.ok(historyPages.some(q => q.range?.[0] === FUNNEL_ROWS_PER_CHUNK), 'full page is followed by an exhaustion read')
})

test('Fortune 500 comparative benchmark stays paired and does not claim a post-Residency retest', async () => {
  const { db } = fakeDb(week())
  const f = await readEffectivenessFunnel({ db, window: '7d', now: NOW })
  assert.ok(f.comparativeBenchmark.available)
  if (!f.comparativeBenchmark.available) return
  assert.equal(f.comparativeBenchmark.comparableArtifacts, 2)
  assert.equal(f.comparativeBenchmark.baselineMean, 0.45)
  assert.ok(Math.abs((f.comparativeBenchmark.universityMean ?? 0) - 0.65) < Number.EPSILON * 4)
  assert.ok(Math.abs((f.comparativeBenchmark.absoluteGain ?? 0) - 0.2) < Number.EPSILON * 4)
  assert.equal(f.comparativeBenchmark.improved, 2)
  assert.equal(f.comparativeBenchmark.residencyCompletedComparable, 1)
  assert.equal(f.comparativeBenchmark.productionGraduatesComparable, 1)
  assert.match(f.comparativeBenchmark.methodology, /not causal post-Residency re-tests/)
})

test('governance assurance reports durable evidence without manufacturing certification', async () => {
  const { db } = fakeDb(week())
  const f = await readEffectivenessFunnel({ db, window: '7d', now: NOW })
  assert.ok(f.governanceAssurance.available)
  if (!f.governanceAssurance.available) return
  assert.equal(f.governanceAssurance.authorityExpansionObserved, 0)
  assert.equal(f.governanceAssurance.repositoryEvidenceEntries, 2)
  assert.equal(f.governanceAssurance.repositoryEvidenceChainValid, true)
  assert.equal(f.governanceAssurance.killSwitchControl, 'implemented_not_live_attested')
  assert.equal(f.governanceAssurance.signedScopeControl, 'implemented_not_live_attested')
  assert.equal(f.governanceAssurance.thirdPartyPenetrationTest, 'not_evidenced')
  assert.equal(f.governanceAssurance.certificationClaim, 'not_claimed')
})

test('broken durable repository evidence chain is disclosed, never passed', async () => {
  const tables = week()
  tables.security_repository_patrol_evidence[1] = { ...tables.security_repository_patrol_evidence[1], previous_hash: '9'.repeat(64) }
  const { db } = fakeDb(tables)
  const f = await readEffectivenessFunnel({ db, window: '7d', now: NOW })
  assert.ok(f.governanceAssurance.available)
  if (f.governanceAssurance.available) assert.equal(f.governanceAssurance.repositoryEvidenceChainValid, false)
})

test('the API is owner-gated read-only, the panel is mounted after the settings and before the life record', () => {
  const api = read('../app/api/admin/cos-university-effectiveness/route.ts')
  assert.match(api, /export async function GET\(req: NextRequest\)[\s\S]{0,80}?await requireOwner\(\)/)
  assert.doesNotMatch(api, /export async function (POST|PATCH|PUT|DELETE)/)
  assert.match(api, /window: req\.nextUrl\.searchParams\.get\('window'\),\s*subjectId: req\.nextUrl\.searchParams\.get\('subject'\)/)
  const page = read('../app/dashboard/cos-university-telemetry/page.tsx')
  assert.match(page, /<UniversitySettingsPanel copy=\{settingsCopy\} \/>\s*<EffectivenessFunnelPanel copy=\{funnelCopy\} subjects=\{funnelSubjects\} \/>\s*<ArtifactLifeRecordPanel copy=\{lifeRecordCopy\} \/>/)
  const panel = read('../app/dashboard/cos-university-telemetry/EffectivenessFunnelPanel.tsx')
  assert.match(panel, /const FUNNEL_URL = '\/api\/admin\/cos-university-effectiveness'/)
  assert.doesNotMatch(panel, /method: '(POST|PATCH|PUT|DELETE)'/)
  assert.match(panel, /data-testid="capability-gain"/)
  assert.match(panel, /f\.capabilityGain\.sampleSize/)
  assert.match(panel, /f\.capabilityGain\.meanBaseline/)
  assert.match(panel, /f\.capabilityGain\.meanTrained/)
  assert.match(panel, /f\.capabilityGain\.meanAbsoluteGain/)
  assert.match(panel, /f\.capabilityGain\.medianAbsoluteGain/)
  assert.match(panel, /f\.capabilityGain\.positiveGainRate/)
  assert.match(panel, /f\.capabilityGain\.source/)
  assert.match(panel, /f\.capabilityGain\.methodology/)
  assert.match(panel, /data-testid="buyer-assurance-scorecard"/)
  assert.match(panel, /f\.residencyEffectiveness\.completed/)
  assert.match(panel, /f\.workforceEffectiveness\.verified/)
  assert.match(panel, /f\.economics\.observedProviderCostUsd/)
  assert.match(panel, /f\.provenance\.traceableGraduates/)
  assert.match(panel, /data-testid="comparative-benchmark"/)
  assert.match(panel, /f\.comparativeBenchmark\.baselineMean/)
  assert.match(panel, /data-testid="governance-assurance"/)
  assert.match(panel, /f\.governanceAssurance\.thirdPartyPenetrationTest/)
  assert.doesNotMatch(panel, />[A-Z][a-z]+ [a-z]+</, 'every visible string comes from copy')
  // Every stage id the module emits has a label in the copy.
  const source = read('../lib/ai/cos/cosUniversityEffectivenessFunnel.ts')
  const ids = Array.from(source.matchAll(/stage\('([a-z_]+)',/g)).map(m => m[1])
  assert.equal(ids.length, 16)
  for (const id of ids) assert.match(panel, new RegExp(`^\\s+${id}: 'stage[A-Za-z]+',$`, 'm'), `${id} has a label`)
})

test('the funnel copy has the same keys in all five languages and no empty string', () => {
  const languages = Object.keys(COS_UNIVERSITY_FUNNEL_COPY).sort()
  assert.deepEqual(languages, ['en', 'es', 'pl', 'pt', 'ru'])
  const keys = Object.keys(COS_UNIVERSITY_FUNNEL_COPY.en)
  for (const language of languages) {
    const block = COS_UNIVERSITY_FUNNEL_COPY[language as keyof typeof COS_UNIVERSITY_FUNNEL_COPY]
    assert.deepEqual(Object.keys(block), keys, language)
    for (const key of keys) assert.ok(String((block as any)[key]).trim().length > 0, `${language}.${key}`)
  }
})
// end of saas/tests/cosUniversityEffectivenessFunnel.node.test.ts (if this line is missing, the paste was cut short)
