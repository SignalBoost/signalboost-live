// saas/tests/itmountsLabExperimentStationScope.node.test.ts
// One chosen Lab experiment runs through the paused University factory; nothing else moves.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolveUniversityStationScope, scopeFromGrants, experimentScopeEvidence } from '../lib/ai/cos/itmountsLabExperimentStationScope.ts'
import { admitNextBuilderResidency } from '../platform-harness/residency/admission-store.ts'

const NOW = new Date('2026-10-08T03:00:00Z')
const ORG = '11111111-1111-4111-8111-111111111111'
const EXP = '22222222-2222-4222-8222-222222222222'
const RUN = '33333333-3333-4333-8333-333333333333'
const CAMPAIGN = '55555555-5555-4555-8555-555555555555'
const CANDIDATE = `mass:${CAMPAIGN}:0123456789abcdef`

function grant(overrides: Record<string, unknown> = {}) {
  return {
    grant_id: '66666666-6666-4666-8666-666666666666',
    organization_id: ORG,
    experiment_id: EXP,
    university_run_id: RUN,
    harness_run_id: 'lab-customer-77777777-7777-4777-8777-777777777777',
    expires_at: '2026-10-09T03:00:00Z',
    candidate_id: CANDIDATE,
    campaign_id: CAMPAIGN,
    capability: 'university.distillation.execute',
    authority_expanded: false,
    ...overrides,
  }
}

/** Minimal Supabase stand-in: system_settings for the pause switch, one RPC for the grants. */
function scopeDb(input: { paused?: unknown; settingsError?: boolean; grants?: unknown[]; grantsError?: boolean }) {
  const rpcCalls: string[] = []
  const db = {
    rpcCalls,
    from(table: string) {
      assert.equal(table, 'system_settings')
      const query: any = {
        select: () => query, eq: () => query, in: () => query,
        maybeSingle: async () => input.settingsError
          ? { data: null, error: { message: 'unreadable' } }
          : { data: input.paused === undefined ? null : { key: 'cos_university_line_paused', value: input.paused, updated_at: null, updated_by: null }, error: null },
        then: (resolve: any) => resolve(input.settingsError
          ? { data: null, error: { message: 'unreadable' } }
          : { data: input.paused === undefined ? [] : [{ key: 'cos_university_line_paused', value: input.paused, updated_at: null, updated_by: null }], error: null }),
      }
      return query
    },
    async rpc(name: string) {
      rpcCalls.push(name)
      if (input.grantsError) return { data: null, error: { message: 'grant store down' } }
      return { data: input.grants ?? [], error: null }
    },
  }
  return db
}

test('line running: the station runs its normal scheduled work and reads no grant', async () => {
  const db = scopeDb({ paused: false, grants: [grant()] })
  const scope = await resolveUniversityStationScope({ db, now: NOW })
  assert.deepEqual(scope, { run: 'line' })
  assert.deepEqual(db.rpcCalls, [])
  assert.equal(experimentScopeEvidence(scope), null)
})

test('unreadable pause store keeps the documented behaviour: stations run', async () => {
  const scope = await resolveUniversityStationScope({ db: scopeDb({ settingsError: true }), now: NOW })
  assert.equal(scope.run, 'line')
})

test('paused with no live experiment: the station stays idle', async () => {
  const scope = await resolveUniversityStationScope({ db: scopeDb({ paused: true, grants: [] }), now: NOW })
  assert.equal(scope.run, 'paused')
  assert.equal((scope as any).reason, 'no_live_experiment')
})

test('paused and the grant store is unreadable: fail closed, never widen', async () => {
  const scope = await resolveUniversityStationScope({ db: scopeDb({ paused: true, grantsError: true }), now: NOW })
  assert.equal(scope.run, 'paused')
  assert.equal((scope as any).reason, 'experiment_grants_unreadable')
})

test('paused with a live grant: only that experiment candidate and campaign are in scope', async () => {
  const db = scopeDb({ paused: true, grants: [grant()] })
  const scope = await resolveUniversityStationScope({ db, now: NOW })
  assert.equal(scope.run, 'experiment')
  if (scope.run !== 'experiment') return
  assert.deepEqual([...scope.candidateIds], [CANDIDATE])
  assert.deepEqual([...scope.campaignIds], [CAMPAIGN])
  assert.deepEqual(db.rpcCalls, ['itmounts_lab_active_experiment_execution_grants'])
  assert.deepEqual(experimentScopeEvidence(scope), { experiments: [EXP], candidateIds: [CANDIDATE], deniedGrants: 0 })
})

test('expired, expanded, wrong-capability and malformed grants never enter the scope', () => {
  const bad = [
    grant({ expires_at: '2026-10-08T02:59:59Z' }),
    grant({ authority_expanded: true }),
    grant({ capability: 'university.promotion.execute' }),
    grant({ harness_run_id: 'cron-77777777-7777-4777-8777-777777777777' }),
    grant({ candidate_id: `${CANDIDATE},mass:other` }),
    grant({ candidate_id: 'local:not-mass' }),
    grant({ campaign_id: 'not-a-uuid' }),
    grant({ organization_id: 'not-a-uuid' }),
  ]
  const scope = scopeFromGrants(bad, NOW)
  assert.equal(scope.run, 'paused')
  assert.equal(scope.denied.length, bad.length)
  assert.ok(scope.denied.some(item => item.reason === 'experiment_authority_expired'))
  assert.ok(scope.denied.some(item => item.reason === 'experiment_grant_malformed'))
  assert.ok(scope.denied.some(item => item.reason === 'experiment_authority_denied'))
})

test('a bad grant does not block a good one, and duplicates collapse', () => {
  const other = `mass:${CAMPAIGN}:fedcba9876543210`
  const scope = scopeFromGrants([grant(), grant({ authority_expanded: true, candidate_id: other }), grant({ grant_id: 'g2' })], NOW)
  assert.equal(scope.run, 'experiment')
  if (scope.run !== 'experiment') return
  assert.deepEqual([...scope.candidateIds], [CANDIDATE])
  assert.equal(scope.denied.length, 1)
})

/** Chainable query recorder for the Residency admission store. */
function recordingDb(tables: Record<string, any[]>) {
  const filters: Array<{ table: string; method: string; args: unknown[] }> = []
  return {
    filters,
    from(table: string) {
      const query: any = {}
      for (const method of ['select', 'eq', 'in', 'like', 'order', 'range', 'limit']) {
        query[method] = (...args: unknown[]) => { filters.push({ table, method, args }); return query }
      }
      query.maybeSingle = async () => ({ data: null, error: null })
      query.then = (resolve: any) => resolve({ data: tables[table] ?? [], error: null })
      return query
    },
  }
}

test('Residency admission in experiment mode counts and admits only the experiment candidates', async () => {
  // Four OTHER residents occupy every seat on the line; the experiment resident must still be admissible.
  const db = recordingDb({ cos_university_residency_enrollments: [], cos_local_distillation_artifacts: [] })
  const result = await admitNextBuilderResidency({ db: db as any, activeLimit: 4, candidateIds: [CANDIDATE] })
  assert.equal(result.admitted, false)
  assert.equal((result as any).reason, 'no_unenrolled_builder_artifact')
  const scoped = db.filters.filter(item => item.method === 'in' && item.args[0] === 'candidate_id')
  assert.deepEqual(scoped.map(item => item.table), ['cos_university_residency_enrollments', 'cos_local_distillation_artifacts'])
  assert.deepEqual(scoped[0].args[1], [CANDIDATE])
})

test('Residency admission without a scope is unchanged (no candidate filter)', async () => {
  const db = recordingDb({ cos_university_residency_enrollments: [], cos_local_distillation_artifacts: [] })
  await admitNextBuilderResidency({ db: db as any, activeLimit: 4 })
  assert.equal(db.filters.filter(item => item.method === 'in' && item.args[0] === 'candidate_id').length, 0)
})

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('every Step 1 station asks the experiment scope instead of reading the pause switch directly', () => {
  const stations = [
    '../app/api/cron/cos-university-mass-distillation/route.ts',
    '../app/api/cron/cos-university-holdout-exam-items/route.ts',
    '../app/api/cron/cos-university-residency/route.ts',
    '../app/api/cron/runpod-mass-distilled-local-deploy/route.ts',
    '../app/api/cron/cos-university-mass-distilled-evaluation/route.ts',
    '../app/api/cron/cos-university-graduate-activation/route.ts',
  ]
  for (const path of stations) {
    const route = source(path)
    assert.match(route, /resolveUniversityStationScope\(/, path)
    assert.match(route, /scope\.run === 'paused'|scope\.run==='paused'/, path)
    assert.doesNotMatch(route, /readLinePauseSetting/, path)
  }
})

test('stations outside Step 1 stay fully paused', () => {
  for (const path of ['../app/api/cron/cos-university-lifecycle-orchestrator/route.ts', '../app/api/cron/cos-university-mass-backlog-compact/route.ts']) {
    const route = source(path)
    assert.match(route, /readLinePauseSetting/, path)
    assert.doesNotMatch(route, /resolveUniversityStationScope/, path)
  }
})

test('scoped stations pass the scope to the claim and to every selection', () => {
  const canary = source('../app/api/cron/runpod-mass-distilled-local-deploy/route.ts')
  assert.match(canary, /scoped_claim_next_mass_distilled_runtime_canary/)
  assert.match(canary, /issueRollingCanaryApproval\(new Date\(Date\.now\(\)-1000\),candidateIds\)/)
  assert.match(canary, /claimNext\(candidateIds\)/)
  const exam = source('../app/api/cron/cos-university-mass-distilled-evaluation/route.ts')
  assert.match(exam, /scoped_claim_next_mass_distilled_evaluation/)
  assert.match(exam, /ensureRollingMassEvaluationApproval\(candidateIds\)/)
  assert.match(exam, /claimNext\(candidateIds\)/)
  const residency = source('../app/api/cron/cos-university-residency/route.ts')
  assert.match(residency, /admitNextBuilderResidency\(\{ db, activeLimit: RESIDENCY_ACTIVE_LIMIT, candidateIds \}\)/)
  assert.match(residency, /sandboxEnvironmentId: RESIDENCY_SANDBOX,\n    candidateIds,/)
  const distillation = source('../app/api/cron/cos-university-mass-distillation/route.ts')
  assert.match(distillation, /runCosUniversityMassDistillationExperimentWorkflow\(\{ campaignIds: scope\.campaignIds \}\)/)
  const workflow = source('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts')
  assert.match(workflow, /campaignIds: input\.campaignIds,/)
  const holdout = source('../app/api/cron/cos-university-holdout-exam-items/route.ts')
  assert.match(holdout, /candidateIds: scope\.candidateIds/)
  const holdoutLib = source('../lib/ai/cos/cosUniversityHoldoutExamItems.ts')
  assert.match(holdoutLib, /if \(input\.candidateIds\) pendingQuery = pendingQuery\.in\('candidate_id', \[\.\.\.input\.candidateIds\]\)/)
  assert.match(holdoutLib, /const revived = input\.candidateIds \? 0 : await reviveExhaustedExamSets/)
  const consumer = source('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts')
  // An empty experiment campaign set claims nothing; a set narrows the campaign read before any paid stage claim.
  assert.match(consumer, /if \(input\.campaignIds && input\.campaignIds\.length === 0\) \{\n    return \{ ok: true as const, skipped: true as const, reason: 'no_experiment_campaign'/)
  assert.ok(consumer.indexOf("campaignQuery = campaignQuery.in('id', [...input.campaignIds])") < consumer.indexOf("db.rpc('claim_cos_university_mass_distillation_stage'"))
  const store = source('../platform-harness/residency/orchestrator-store.ts')
  assert.match(store, /const active=await inScope\(input\.db\n      \.from\('cos_university_residency_enrollments'\)\n      \.select\(ENROLLMENT_COLUMNS\)/)
  const registration = source('../app/api/cron/cos-university-graduate-activation/route.ts')
  assert.match(registration, /if \(scopeCandidateIds\) artifactQuery = artifactQuery\.in\('candidate_id', \[\.\.\.scopeCandidateIds\]\)/)
})

test('graduation in experiment mode registers only, and returns before activation, rotation and rollback proof', () => {
  const route = source('../app/api/cron/cos-university-graduate-activation/route.ts')
  const experimentBranch = route.indexOf("if (scope.run === 'experiment') {")
  const branchReturn = route.indexOf("reason: 'experiment_registration_only', massRegistration, experimentScope })", experimentBranch)
  assert.ok(experimentBranch > 0 && branchReturn > experimentBranch)
  const branch = route.slice(experimentBranch, branchReturn)
  assert.match(branch, /registerNextMassGraduate\(scope\.candidateIds\)/)
  for (const forbidden of ['runGraduateRotationController', 'proveNextGraduateRollback', 'reconcileGraduateArtifactLifecycle', 'activateGraduateRuntime']) {
    assert.doesNotMatch(branch, new RegExp(forbidden))
  }
})

test('migration: grants are written only by the start function, expire within 48 h, and use the rolling admission rules', () => {
  const sql = source('../supabase/migrations/20261008020000_lab_experiment_execution_scope.sql')
  assert.match(sql, /revoke all on lab\.experiment_execution_grants from public, anon, authenticated, service_role/)
  assert.match(sql, /expires_at <= created_at \+ interval '48 hours'/)
  assert.match(sql, /authority_expanded boolean not null default false check \(authority_expanded = false\)/)
  assert.match(sql, /b\.source_count between 64 and 128/)
  assert.match(sql, />= ceil\(b\.source_count \* 0\.5\)/)
  assert.match(sql, /public\.authorize_cos_university_mass_distillation_campaign\(\s*array\[v_batch_key\], 1\.825000/)
  // Claims are edited in place at one anchor each, and the exam ceilings are re-verified.
  assert.match(sql, /where a\.status in \(''evaluation_ready'',''evaluation_pending''\)/)
  assert.match(sql, /where a\.status=''evaluation_pending''/)
  assert.match(sql, /if v_occurrences <> 1 then/)
  assert.match(sql, /v_max_judge<>4/)
  assert.match(sql, /v_max_cost>0\.200000/)
  // Unscoped calls (the scheduled line) see every candidate, exactly as before.
  assert.match(sql, /coalesce\(pg_catalog\.current_setting\('itmounts\.claim_candidate_scope', true\), ''\) = '' then true/)
  for (const fn of ['itmounts_lab_start_experiment_university_run', 'itmounts_lab_active_experiment_execution_grants', 'itmounts_lab_experiment_start_options', 'scoped_claim_next_mass_distilled_runtime_canary', 'scoped_claim_next_mass_distilled_evaluation']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}\\(`), fn)
  }
})

test('the rolling authorizer still carries the admission rules the experiment start copies', () => {
  const rolling = source('../supabase/migrations/20261006190000_mass_distillation_independent_source_admission.sql')
  assert.match(rolling, /b\.source_count between 64 and 128/)
  assert.match(rolling, />= ceil\(b\.source_count \* 0\.5\)/)
})
