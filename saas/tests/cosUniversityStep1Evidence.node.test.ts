// saas/tests/cosUniversityStep1Evidence.node.test.ts
//
// Owner, 2026-10-06: Step 1 evidence is read from Production without moving it, measured against the owner's exit
// criterion, and the platform recommends but never declares. Three contracts:
//   1. readOnlyDb refuses every write before it reaches the database.
//   2. The line observation places units from the artifact table and reports controller-ledger disagreement.
//   3. The Step 1 assessment never recommends READY and never turns an unreadable chapter into a zero.
//   4. Owner scope (2026-10-06): Step 1 is the factory (create, train, distil, examine, Residency, graduate). Graduates
//      serving work and verified Production outcomes are the NEXT project: reported, never blocking Step 1.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { READ_ONLY_FORBIDDEN_METHODS, ReadOnlyDbViolation, readOnlyDb } from '../lib/ai/cos/cosUniversityReadOnlyDb.ts'
import { LINE_OBSERVATION_SCHEMA_VERSION, observeLine } from '../lib/ai/cos/cosUniversityLineObservation.ts'
import { STEP1_EVIDENCE_SCHEMA_VERSION, assessStep1Evidence, describeStep1Evidence } from '../lib/ai/cos/cosUniversityStep1Evidence.ts'
import { readEffectivenessFunnel } from '../lib/ai/cos/cosUniversityEffectivenessFunnel.ts'
import { WORKING_STATIONS, stationForStatus } from '../lib/ai/cos/cosUniversityAssemblyLine.ts'

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const H = (c: string) => c.repeat(64)
const NOW = new Date('2026-10-06T12:00:00Z')

/** PostgREST-shaped store over in-memory tables that records every write attempt it receives. */
function fakeDb(tables: Record<string, any[]>) {
  const writes: string[] = []
  const db = {
    from(table: string) {
      const filters: Array<(row: any) => boolean> = []
      let order: { column: string; ascending: boolean } | null = null
      let limit = Infinity
      let range: [number, number] | null = null
      const run = () => {
        let rows = (tables[table] || []).filter(row => filters.every(f => f(row)))
        if (order) rows = [...rows].sort((a, b) => String(a[order!.column] ?? '').localeCompare(String(b[order!.column] ?? '')) * (order!.ascending ? 1 : -1))
        rows = range ? rows.slice(range[0], range[1] + 1) : rows.slice(0, limit)
        return { data: rows, error: null }
      }
      const write = (method: string) => () => { writes.push(`${method}:${table}`); return q }
      const q: any = {
        select() { return q },
        eq(column: string, value: unknown) { filters.push(row => String(row[column]) === String(value)); return q },
        neq(column: string, value: unknown) { filters.push(row => String(row[column]) !== String(value)); return q },
        gte(column: string, value: string) { filters.push(row => String(row[column] ?? '') >= value); return q },
        lte(column: string, value: string) { filters.push(row => String(row[column] ?? '') <= value); return q },
        gt(column: string, value: string) { filters.push(row => String(row[column] ?? '') > value); return q },
        lt(column: string, value: string) { filters.push(row => String(row[column] ?? '') < value); return q },
        is() { return q },
        not() { return q },
        or() { return q },
        in(column: string, values: readonly unknown[]) { const set = new Set(values.map(String)); filters.push(row => set.has(String(row[column]))); return q },
        order(column: string, options: { ascending: boolean }) { order = { column, ascending: options.ascending }; return q },
        limit(n: number) { limit = n; return q },
        range(from: number, to: number) { range = [from, to]; return q },
        maybeSingle() { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: null }) },
        single() { const r = run(); return Promise.resolve({ data: r.data[0] ?? null, error: null }) },
        insert: write('insert'),
        update: write('update'),
        upsert: write('upsert'),
        delete: write('delete'),
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(run()).then(resolve, reject) },
      }
      return q
    },
    rpc() { writes.push('rpc'); return Promise.resolve({ data: null, error: null }) },
  }
  return { db, writes }
}

// ---------------------------------------------------------------------------------------------------------------
// 1. readOnlyDb
// ---------------------------------------------------------------------------------------------------------------

test('readOnlyDb refuses every write method before the store sees it, and exposes no rpc', async () => {
  const { db, writes } = fakeDb({ t: [{ id: 1 }] })
  const ro = readOnlyDb(db) as any
  for (const method of READ_ONLY_FORBIDDEN_METHODS) {
    assert.throws(() => ro.from('t')[method]({ id: 2 }), (error: unknown) => error instanceof ReadOnlyDbViolation && error.method === method && error.table === 't')
  }
  assert.equal(ro.rpc, undefined, 'rpc can run arbitrary server functions and must not be reachable')
  assert.deepEqual(writes, [], 'no write reached the underlying store')
  const result = await ro.from('t').select('id').eq('id', 1)
  assert.deepEqual(result.data, [{ id: 1 }], 'reads still work through the wrapper')
})

test('the Effectiveness Funnel can be computed entirely through readOnlyDb (it never writes)', async () => {
  const { db, writes } = fakeDb({
    cos_local_distillation_artifacts: [
      { candidate_id: 'a', trained_artifact_hash: H('a'), status: 'active', subject_id: 'cs', created_at: '2026-10-05T10:00:00Z' },
    ],
  })
  const funnel = await readEffectivenessFunnel({ db: readOnlyDb(db), window: 'all', now: NOW })
  assert.equal(funnel.cohort.size, 1)
  assert.deepEqual(writes, [])
})

// ---------------------------------------------------------------------------------------------------------------
// 2. Line observation
// ---------------------------------------------------------------------------------------------------------------

const someStation = WORKING_STATIONS[0]
const otherStation = WORKING_STATIONS[1]

test('placement comes from the artifact status; ledger timing is used only when the ledger agrees', () => {
  const observation = observeLine({
    now: NOW,
    artifacts: [
      { candidate_id: 'agree', trained_artifact_hash: H('A'), status: someStation.sourceStatus, updated_at: '2026-10-06T11:00:00Z' },
      { candidate_id: 'moved', trained_artifact_hash: H('b'), status: otherStation.sourceStatus, updated_at: '2026-10-06T11:59:00Z' },
      { candidate_id: 'unledgered', trained_artifact_hash: H('c'), status: someStation.sourceStatus, updated_at: '2026-10-06T11:30:00Z' },
      { candidate_id: 'retired', trained_artifact_hash: H('d'), status: 'retired', updated_at: '2026-10-06T11:30:00Z' },
      { candidate_id: '', trained_artifact_hash: H('e'), status: someStation.sourceStatus },
    ],
    ledger: [
      { candidate_id: 'agree', station: someStation.id, stage_entered_at: '2026-10-06T10:00:00Z', last_transition_at: '2026-10-06T10:00:00Z', lease_until: '2026-10-06T12:05:00Z', terminal: false },
      { candidate_id: 'moved', station: someStation.id, stage_entered_at: '2026-10-06T09:00:00Z', last_transition_at: '2026-10-06T09:00:00Z', terminal: false },
    ],
  })
  const byId = new Map(observation.units.map(unit => [unit.candidateId, unit]))
  assert.equal(observation.units.length, 3, 'terminal and identity-less units are not on the line')
  assert.equal(byId.get('agree')!.station, String(someStation.id))
  assert.equal(byId.get('agree')!.artifactHash, H('a'), 'hashes are normalized to lower case')
  assert.equal(byId.get('agree')!.enteredAt, '2026-10-06T10:00:00.000Z', 'agreeing ledger supplies the arrival time')
  assert.equal(byId.get('moved')!.station, String(otherStation.id), 'the artifact table, not the ledger, decides placement')
  assert.equal(byId.get('moved')!.ledgerStation, String(someStation.id))
  assert.equal(byId.get('moved')!.enteredAt, '2026-10-06T11:59:00.000Z', 'a disagreeing ledger time is not trusted')
  assert.equal(observation.ledgerDisagreements, 1)
  assert.equal(observation.ledgerMissing, 1)
  for (const unit of observation.units) assert.equal(stationForStatus(unit.sourceStatus)!.id, unit.station)
  const first = observation.line.find(entry => entry.station === String(someStation.id))!
  assert.equal(first.waiting, 2)
  assert.equal(first.inFlight, 1, 'only live leases count as in flight')
})

test('a station holding material past its SLA with no output is reported as a line stop', () => {
  const sla = someStation.stationSlaSeconds
  const longAgo = new Date(NOW.getTime() - (sla + 3600) * 1000).toISOString()
  const observation = observeLine({
    now: NOW,
    artifacts: [{ candidate_id: 'stuck', trained_artifact_hash: H('f'), status: someStation.sourceStatus, updated_at: longAgo }],
    ledger: [{ candidate_id: 'stuck', station: someStation.id, stage_entered_at: longAgo, last_transition_at: longAgo, terminal: false }],
  })
  assert.ok(observation.lineStops.some(stop => String(stop.station) === String(someStation.id)))
})

test('the observation route is read only by construction and the prover reads it instead of the controller', () => {
  const route = read('../app/api/cron/cos-university-line-observation/route.ts')
  assert.match(route, /readOnlyDb\(service\)/)
  assert.doesNotMatch(route, /triggerStation|recordCosUniversityProductionPath|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  assert.match(route, /process\.env\.CRON_SECRET/)
  const spec = read('./cosUniversityAssemblyLine.playwright.spec.ts')
  assert.match(spec, /\/api\/cron\/cos-university-line-observation/)
  assert.doesNotMatch(spec, /cos-university-lifecycle-orchestrator'/, 'the prover must not drive the line it measures')
  assert.match(spec, new RegExp(LINE_OBSERVATION_SCHEMA_VERSION))
})

// ---------------------------------------------------------------------------------------------------------------
// 3. Step 1 assessment
// ---------------------------------------------------------------------------------------------------------------

test('an empty University is NOT_READY, with every missing stage named as blocking', async () => {
  const { db } = fakeDb({})
  const funnel = await readEffectivenessFunnel({ db: readOnlyDb(db), window: 'all', now: NOW })
  const report = assessStep1Evidence(funnel, NOW)
  assert.equal(report.schemaVersion, STEP1_EVIDENCE_SCHEMA_VERSION)
  assert.equal(report.recommendation, 'NOT_READY')
  assert.equal(report.declaration, 'owner_only')
  assert.equal(report.readOnly, true)
  for (const id of ['artifact_creation', 'qualification', 'builder_residency', 'graduation', 'line_flow']) {
    assert.ok(report.blocking.includes(id), `${id} must block`)
  }
  for (const id of ['production_serving', 'verified_production_outcomes']) {
    assert.ok(!report.blocking.includes(id), `${id} is the next project and never blocks Step 1`)
  }
  assert.match(describeStep1Evidence(report), /recommendation=NOT_READY declaration=owner_only/)
})

function fullFunnel(overrides: Record<string, unknown> = {}): any {
  const ids = ['born', 'birth_certificate', 'examined', 'improved_over_baseline', 'passed_safety', 'passed_transfer', 'passed_retention', 'passed_all_gates', 'residency_enrolled', 'residency_complete', 'graduated', 'activated', 'hired', 'performed_work', 'served_successfully', 'verified_outcome']
  return {
    window: 'all', since: null, cohort: { size: 10, truncated: false, source: 'x' },
    stages: ids.map(id => ({ id, count: 3, share: 0.3, source: `src:${id}` })),
    unavailable: {},
    capabilityGain: { available: true, sampleSize: 3, meanAbsoluteGain: 0.1, improved: 3, regressed: 0 },
    reliability: { available: true, attempts: 5, successes: 4, failures: 1, fallbacks: 0, p90LatencyMs: 900 },
    workforceEffectiveness: { available: true, assignments: 5, verified: 3, remediation: 1, runtimeFailed: 1, servedAwaitingVerification: 0 },
    lineHistory: { available: true, transitions: 12, throughputPerHour: 0.5 },
    lineHealth: { available: true, liveUnits: 4, overdueUnits: 0, bottleneckStation: null },
    evaluationFailures: { available: true, total: 2, infrastructure: 1, merit: 1, explanations: [{ reason: 'r', count: 2, causeStatus: 'evidence_backed' }], source: 'evals' },
    ...overrides,
  }
}

test('inconsistent failure totals cannot be presented as evidence-backed attribution', () => {
  for (const failures of [
    { total: 2, infrastructure: 1, merit: 0, explanations: [{ reason: 'r', count: 2, causeStatus: 'evidence_backed' }] },
    { total: 2, infrastructure: 1, merit: 1, explanations: [{ reason: 'r', count: 1, causeStatus: 'evidence_backed' }] },
    { total: 2, infrastructure: -1, merit: 3, explanations: [{ reason: 'r', count: 2, causeStatus: 'evidence_backed' }] },
  ]) {
    const report = assessStep1Evidence(fullFunnel({
      evaluationFailures: { available: true, source: 'evals', ...failures },
    }), NOW)
    const attribution = report.criteria.find(entry => entry.id === 'failure_attribution')!
    assert.equal(attribution.status, 'partial')
    assert.equal(attribution.observed.countsConsistent, false)
    assert.ok(report.blocking.includes('failure_attribution'))
    assert.equal(report.recommendation, 'NOT_READY')
  }
})

test('even with evidence at every stage the report never recommends READY', () => {
  const report = assessStep1Evidence(fullFunnel(), NOW)
  assert.deepEqual([...report.blocking], [])
  assert.equal(report.recommendation, 'INSUFFICIENT_EVIDENCE_FOR_READY')
  const notMeasured = report.criteria.filter(entry => entry.status === 'not_measured').map(entry => entry.id)
  assert.deepEqual(notMeasured, ['repeated_operation', 'no_manual_intervention', 'standards_unweakened'])
  assert.doesNotMatch(JSON.stringify(report), /"recommendation":"READY"/)
})

test('graduates not serving and zero verified outcomes do not block Step 1: they are the next project, still reported', () => {
  const funnel = fullFunnel()
  funnel.stages = funnel.stages.map((stage: any) => ['hired', 'performed_work', 'served_successfully', 'verified_outcome'].includes(stage.id) ? { ...stage, count: 0 } : stage)
  const report = assessStep1Evidence(funnel, NOW)
  assert.deepEqual([...report.blocking], [])
  assert.equal(report.recommendation, 'INSUFFICIENT_EVIDENCE_FOR_READY')
  const byId = new Map(report.criteria.map(entry => [entry.id, entry]))
  assert.equal(byId.get('production_serving')!.scope, 'next_project')
  assert.equal(byId.get('production_serving')!.status, 'no_evidence')
  assert.equal(byId.get('verified_production_outcomes')!.scope, 'next_project')
  assert.equal(byId.get('verified_production_outcomes')!.status, 'no_evidence')
  const text = describeStep1Evidence(report)
  const nextAt = text.indexOf('next project (graduates at work; reported only, not part of Step 1):')
  assert.ok(nextAt > 0, 'the next-project section is printed')
  assert.ok(text.indexOf('verified_production_outcomes') > nextAt, 'serving and outcomes print only under the next-project heading')
  assert.ok(text.indexOf('builder_residency') < nextAt, 'factory criteria print above it')
})

test('every criterion is scoped, and only the factory is in Step 1', () => {
  const report = assessStep1Evidence(fullFunnel(), NOW)
  const scoped = Object.fromEntries(report.criteria.map(entry => [entry.id, entry.scope]))
  assert.deepEqual(scoped, {
    artifact_creation: 'step1',
    qualification: 'step1',
    failure_attribution: 'step1',
    builder_residency: 'step1',
    graduation: 'step1',
    production_serving: 'next_project',
    verified_production_outcomes: 'next_project',
    line_flow: 'step1',
    repeated_operation: 'step1',
    no_manual_intervention: 'step1',
    standards_unweakened: 'step1',
  })
})

test('Builder Residency with residents but no completion blocks Step 1', () => {
  const funnel = fullFunnel()
  funnel.stages = funnel.stages.map((stage: any) => stage.id === 'residency_complete' ? { ...stage, count: 0 } : stage)
  const report = assessStep1Evidence(funnel, NOW)
  assert.deepEqual([...report.blocking], ['builder_residency'])
  const residency = report.criteria.find(entry => entry.id === 'builder_residency')!
  assert.equal(residency.observed.residency_enrolled, 3)
  assert.equal(residency.observed.residency_complete, 0)
})

test('Residency case evidence is printed so skill failures are told apart from platform failures', () => {
  const funnel = fullFunnel({
    residencyEffectiveness: {
      available: true, error: null, enrollments: 4, completed: 0, remediationRequired: 1,
      caseRuns: 10, casesPassed: 3, casesFailed: 2, casesRejected: 5, competencyEvidence: 5, competencyPasses: 3, competencyFailures: 2,
      completionRate: 0, casePassRate: 0.3,
      caseOutcomes: { infrastructure_failure: 5, success: 3, agent_failure: 2 },
      topFailureCodes: { runtime_not_ready: 5, assertion_failed: 2 },
      standings: { resident: 3, remediation_required: 1 },
      failedCaseLoopStops: { builder_stalled_repeated_inspection: 1, loop_completed: 1 },
      failedCasesWithNoFileChange: 1,
      competencyFailuresById: { rollback_judgment: 2 },
      source: 's', methodology: 'm',
    },
  })
  funnel.stages = funnel.stages.map((stage: any) => stage.id === 'residency_complete' ? { ...stage, count: 0 } : stage)
  const report = assessStep1Evidence(funnel, NOW)
  const residency = report.criteria.find(entry => entry.id === 'builder_residency')!
  assert.equal(residency.status, 'no_evidence')
  assert.equal(residency.observed.casePassRate, 0.3)
  assert.equal(residency.observed.caseOutcomes, 'infrastructure_failure=5,success=3,agent_failure=2')
  assert.equal(residency.observed.topFailureCodes, 'runtime_not_ready=5,assertion_failed=2')
  assert.equal(residency.observed.standings, 'resident=3,remediation_required=1')
  assert.equal(residency.observed.failedCaseLoopStops, 'builder_stalled_repeated_inspection=1,loop_completed=1')
  assert.equal(residency.observed.failedCasesWithNoFileChange, 1)
  assert.equal(residency.observed.competencyFailuresById, 'rollback_judgment=2')
  assert.match(describeStep1Evidence(report), /builder_residency :: .*caseOutcomes=infrastructure_failure=5,success=3,agent_failure=2/)
})

test('an unreadable Residency evidence chapter is said, never printed as zeros', () => {
  const funnel = fullFunnel({ residencyEffectiveness: { available: false, error: 'boom' } })
  const residency = assessStep1Evidence(funnel, NOW).criteria.find(entry => entry.id === 'builder_residency')!
  assert.equal(residency.observed.residencyEvidence, 'unavailable')
  assert.equal(residency.observed.casePassRate, undefined)
})

test('an unreadable Residency chapter is unavailable, never a zero', () => {
  const funnel = fullFunnel({ unavailable: { residency: 'cos_university_residency_unreadable' } })
  const residency = assessStep1Evidence(funnel, NOW).criteria.find(entry => entry.id === 'builder_residency')!
  assert.equal(residency.status, 'unavailable')
})

test('the infrastructure share of evaluation failures is reported as a fact, with no invented threshold', () => {
  const funnel = fullFunnel({ evaluationFailures: { available: true, total: 8, infrastructure: 7, merit: 1, explanations: [{ reason: 'r', count: 8, causeStatus: 'evidence_backed' }], source: 'evals' } })
  const attribution = assessStep1Evidence(funnel, NOW).criteria.find(entry => entry.id === 'failure_attribution')!
  assert.equal(attribution.observed.infrastructureShare, 0.875)
  assert.equal(attribution.observed.topReasons, 'r=8', 'the largest failure reasons are printed so the dominant failure is visible')
  assert.equal(attribution.status, 'evidence_present', 'attribution is judged on causes, not on an unset infrastructure-rate target')
})

test('an unreadable chapter is reported as unavailable, never as a zero', () => {
  const funnel = fullFunnel({ unavailable: { verified: 'cos_university_graduate_lifecycle_events_unreadable' } })
  const report = assessStep1Evidence(funnel, NOW)
  const verified = report.criteria.find(entry => entry.id === 'verified_production_outcomes')!
  assert.equal(verified.status, 'unavailable')
  assert.ok(!report.blocking.includes('verified_production_outcomes'), 'a next-project chapter never blocks Step 1')
})

test('failures with an unresolved cause make attribution partial and blocking', () => {
  const funnel = fullFunnel({ evaluationFailures: { available: true, total: 3, infrastructure: 1, merit: 1, explanations: [{ reason: 'judge_case_invalid', count: 1, causeStatus: 'unresolved' }, { reason: 'r', count: 2, causeStatus: 'evidence_backed' }], source: 'evals' } })
  const report = assessStep1Evidence(funnel, NOW)
  const attribution = report.criteria.find(entry => entry.id === 'failure_attribution')!
  assert.equal(attribution.status, 'partial')
  assert.equal(attribution.observed.unresolvedFailures, 1)
  assert.ok(report.blocking.includes('failure_attribution'))
})

test('the evidence route is read only by construction and cron-authorized', () => {
  const route = read('../app/api/cron/cos-university-step1-evidence/route.ts')
  assert.match(route, /db: readOnlyDb\(service\)/)
  assert.doesNotMatch(route, /triggerStation|recordCosUniversityProductionPath|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/)
  assert.match(route, /process\.env\.CRON_SECRET/)
})

test('the watchdog workflow prints the Step 1 evidence for every window', () => {
  const workflow = read('../../.github/workflows/assembly-line-live-proof.yml')
  assert.match(workflow, /cos-university-step1-evidence/)
  for (const window of ['24h', '7d', 'all']) assert.match(workflow, new RegExp(`\\b${window}\\b`))
})


test('a write chained after an allowed builder method is still refused (the proxy survives query chains)', () => {
  const { db, writes } = fakeDb({ t: [{ id: 1 }] })
  const ro = readOnlyDb(db) as any
  for (const method of READ_ONLY_FORBIDDEN_METHODS) {
    assert.throws(() => ro.from('t').select('id')[method]({ id: 2 }), ReadOnlyDbViolation)
    assert.throws(() => ro.from('t').select('id').eq('id', 1).order('id', { ascending: true })[method]({ id: 2 }), ReadOnlyDbViolation)
  }
  assert.deepEqual(writes, [])
})

test('a window with zero evaluation failures has untested attribution, which blocks rather than counts as evidence', () => {
  const funnel = fullFunnel({ evaluationFailures: { available: true, total: 0, infrastructure: 0, merit: 0, explanations: [], source: 'evals' } })
  const report = assessStep1Evidence(funnel, NOW)
  const attribution = report.criteria.find(entry => entry.id === 'failure_attribution')!
  assert.equal(attribution.status, 'no_evidence')
  assert.ok(report.blocking.includes('failure_attribution'))
  assert.equal(report.recommendation, 'NOT_READY')
})
// end of saas/tests/cosUniversityStep1Evidence.node.test.ts (if this line is missing, the paste was cut short)
