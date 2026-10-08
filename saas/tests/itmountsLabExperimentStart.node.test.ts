// saas/tests/itmountsLabExperimentStart.node.test.ts
// Starting one Lab experiment run on the existing University factory, and the binding defect it exposed.
import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  bindLabExperimentToUniversityRun,
  createSupabaseLabExecutionDb,
  startLabExperimentUniversityRun,
  type LabExperimentStartDb,
  type VerifiedLabAuthority,
} from '../lib/ai/cos/itmountsLabUniversityExecution.ts'
import { withCustomerLabUniversityBindingHarness } from '../platform-harness/adapters/lab-customer.ts'

const ORG = '11111111-1111-4111-8111-111111111111'
const EXP = '22222222-2222-4222-8222-222222222222'
const RUN = '33333333-3333-4333-8333-333333333333'
const USER = '88888888-8888-4888-8888-888888888888'
const HARNESS = 'lab-customer-44444444-4444-4444-8444-444444444444'
const CAMPAIGN = '55555555-5555-4555-8555-555555555555'

const authority = (overrides: Partial<VerifiedLabAuthority> = {}): VerifiedLabAuthority => ({
  verifiedByHarness: true, organizationId: ORG, harnessRunId: HARNESS,
  capability: 'university.distillation.execute', authorityExpanded: false, ...overrides,
})

function startDb(response: Record<string, unknown> | null = null) {
  const calls: any[] = []
  const db: LabExperimentStartDb = {
    async readExperiment({ organizationId, experimentId }) {
      return organizationId === ORG && experimentId === EXP ? { id: EXP, organizationId: ORG, privacyTier: 'PRIVATE', budgetMicrocredits: 0 } : null
    },
    async startExperimentUniversityRun(input) {
      calls.push(input)
      return response ?? {
        ok: true, grantId: '66666666-6666-4666-8666-666666666666', organizationId: ORG, experimentId: EXP,
        universityRunId: RUN, campaignId: CAMPAIGN, candidateId: `mass:${CAMPAIGN}:0123456789abcdef`,
        batchKey: 'batch-key', subjectId: input.subjectId, expiresAt: '2026-10-10T03:00:00Z', maxTrainingCostUsd: 1.825,
        authorityExpanded: false,
      }
    },
  }
  return { db, calls }
}

test('starts one run for the verified tenant and returns the candidate, campaign and expiring grant', async () => {
  const store = startDb()
  const result = await startLabExperimentUniversityRun({ authority: authority(), experimentId: EXP, subjectId: 'Computer Science & Coding', startedBy: USER, db: store.db })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.campaignId, CAMPAIGN)
  assert.equal(result.maxTrainingCostUsd, 1.825)
  assert.equal(result.authorityExpanded, false)
  assert.equal(result.factory, 'existing_cos_university')
  assert.deepEqual(store.calls, [{ organizationId: ORG, experimentId: EXP, subjectId: 'Computer Science & Coding', harnessRunId: HARNESS, startedBy: USER }])
})

test('a subject with no eligible batch is a clear refusal, not an error', async () => {
  const store = startDb({ ok: false, reason: 'no_eligible_prepared_batch' })
  const result = await startLabExperimentUniversityRun({ authority: authority(), experimentId: EXP, subjectId: 'Mathematics', startedBy: USER, db: store.db })
  assert.deepEqual(result, { ok: false, reason: 'no_eligible_prepared_batch', subjectId: 'Mathematics', authorityExpanded: false })
})

test('fails closed before any start on cross-tenant, unverified, expanded or non-customer authority', async () => {
  const cases: Array<[Partial<VerifiedLabAuthority>, RegExp]> = [
    [{ organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, /lab_execution_experiment_tenant_mismatch/],
    [{ verifiedByHarness: false as any }, /lab_execution_harness_authority_denied/],
    [{ authorityExpanded: true as any }, /lab_execution_harness_authority_denied/],
    [{ capability: 'university.promotion.execute' as any }, /lab_execution_harness_authority_denied/],
    [{ harnessRunId: '44444444-4444-4444-8444-444444444444' }, /lab_execution_invalid_identifier/],
    [{ harnessRunId: 'cron-44444444-4444-4444-8444-444444444444' }, /lab_execution_invalid_identifier/],
  ]
  for (const [override, error] of cases) {
    const store = startDb()
    await assert.rejects(startLabExperimentUniversityRun({ authority: authority(override), experimentId: EXP, subjectId: 'Physics', startedBy: USER, db: store.db }), error)
    assert.equal(store.calls.length, 0)
  }
})

test('rejects a blank subject and a database answer that widens authority or names another tenant', async () => {
  await assert.rejects(startLabExperimentUniversityRun({ authority: authority(), experimentId: EXP, subjectId: '  ', startedBy: USER, db: startDb().db }), /lab_execution_subject_invalid/)
  for (const bad of [{ authorityExpanded: true }, { organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }]) {
    const store = startDb({ ok: true, organizationId: ORG, experimentId: EXP, authorityExpanded: false, ...bad })
    await assert.rejects(startLabExperimentUniversityRun({ authority: authority(), experimentId: EXP, subjectId: 'Physics', startedBy: USER, db: store.db }), /lab_execution_start_contract_violation/)
  }
})

test('regression: a real customer HarnessRun id can bind (it was rejected as an invalid identifier)', async () => {
  const bindings: any[] = []
  await withCustomerLabUniversityBindingHarness({
    organizationId: ORG,
    operation: async manifest => {
      assert.match(manifest.runId, /^lab-customer-/)
      return bindLabExperimentToUniversityRun({
        authority: authority({ harnessRunId: manifest.runId }), experimentId: EXP, runId: RUN,
        db: {
          async readExperiment() { return { id: EXP, organizationId: ORG, privacyTier: 'PRIVATE', budgetMicrocredits: 0 } },
          async readUniversityRun() { return { id: RUN, authorityExpanded: false } },
          async bindUniversityRun(input) { bindings.push(input) },
        },
      })
    },
  })
  assert.equal(bindings.length, 1)
})

test('the customer Harness keeps one non-expanding, zero-spend envelope whatever the objective', async () => {
  let seen: any = null
  await withCustomerLabUniversityBindingHarness({ organizationId: ORG, objective: 'Start one run', operation: async manifest => { seen = manifest } })
  assert.equal(seen.limits.maxCostUsd, 0)
  assert.equal(seen.capabilities.length, 1)
  assert.equal(seen.capabilities[0].id, 'university.distillation.execute')
})

test('Supabase adapter calls only the service-role start RPC with the exact arguments', async () => {
  const calls: any[] = []
  const db = createSupabaseLabExecutionDb({ async rpc(name, args) { calls.push({ name, args }); return { data: { ok: false, reason: 'no_eligible_prepared_batch' }, error: null } } })
  const out = await db.startExperimentUniversityRun({ organizationId: ORG, experimentId: EXP, subjectId: 'Physics', harnessRunId: HARNESS, startedBy: USER })
  assert.deepEqual(out, { ok: false, reason: 'no_eligible_prepared_batch' })
  assert.deepEqual(calls, [{ name: 'itmounts_lab_start_experiment_university_run', args: {
    p_organization_id: ORG, p_experiment_id: EXP, p_subject_id: 'Physics', p_harness_run_id: HARNESS, p_started_by: USER,
  } }])
  const failing = createSupabaseLabExecutionDb({ async rpc() { return { data: null, error: { message: 'lab_tenant_authority_denied' } } } })
  await assert.rejects(failing.startExperimentUniversityRun({ organizationId: ORG, experimentId: EXP, subjectId: 'Physics', harnessRunId: HARNESS, startedBy: USER }), /lab_tenant_authority_denied/)
})

test('the start route requires a session, active membership and an owner/admin role, inside the customer Harness', () => {
  const route = readFileSync(new URL('../app/api/lab/experiments/route.ts', import.meta.url), 'utf8')
  assert.match(route, /if \(!userId\) return NextResponse\.json\(\{ ok: false, error: 'unauthorized' \}, \{ status: 401 \}\)/)
  assert.match(route, /itmounts_lab_resolve_user_organization/)
  assert.match(route, /member\.status !== 'active'/)
  assert.match(route, /const START_ROLES = new Set\(\['owner', 'admin'\]\)/)
  assert.match(route, /withCustomerLabUniversityBindingHarness\(/)
  assert.match(route, /startedBy: userId/)
})
