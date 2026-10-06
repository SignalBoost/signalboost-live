// saas/tests/cosUniversityStep1Evidence.node.test.ts
//
// Owner, 2026-10-06: Step 1 evidence is read from Production without moving it, measured against the owner's exit
// criterion, and the platform recommends but never declares. Three contracts:
//   1. readOnlyDb refuses every write before it reaches the database.
//   2. The line observation places units from the artifact table and reports controller-ledger disagreement.
//   3. The Step 1 assessment never recommends READY and never turns an unreadable chapter into a zero.
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
  for (const id of ['artifact_creation', 'qualification', 'graduation', 'production_serving', 'verified_production_outcomes', 'line_flow']) {
    assert.ok(report.blocking.includes(id), `${id} must block`)
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

test('even with evidence at every stage the report never recommends READY', () => {
  const report = assessStep1Evidence(fullFunnel(), NOW)
  assert.deepEqual([...report.blocking], [])
  assert.equal(report.recommendation, 'INSUFFICIENT_EVIDENCE_FOR_READY')
  const notMeasured = report.criteria.filter(entry => entry.status === 'not_measured').map(entry => entry.id)
  assert.deepEqual(notMeasured, ['repeated_operation', 'no_manual_intervention', 'standards_unweakened'])
  assert.doesNotMatch(JSON.stringify(report), /"recommendation":"READY"/)
})

test('zero verified outcomes blocks Step 1 even when everything upstream works', () => {
  const funnel = fullFunnel()
  funnel.stages = funnel.stages.map((stage: any) => stage.id === 'verified_outcome' ? { ...stage, count: 0 } : stage)
  const report = assessStep1Evidence(funnel, NOW)
  assert.equal(report.recommendation, 'NOT_READY')
  assert.deepEqual([...report.blocking], ['verified_production_outcomes'])
})

test('an unreadable chapter is reported as unavailable, never as a zero', () => {
  const funnel = fullFunnel({ unavailable: { verified: 'cos_university_graduate_lifecycle_events_unreadable' } })
  const verified = assessStep1Evidence(funnel, NOW).criteria.find(entry => entry.id === 'verified_production_outcomes')!
  assert.equal(verified.status, 'unavailable')
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
// end of saas/tests/cosUniversityStep1Evidence.node.test.ts (if this line is missing, the paste was cut short)
