// saas/tests/cosWorkforceProductionVerification.node.test.ts
//
// Workforce stage after WORKING (2026-10-02): real graduate Production work enters the Workforce, and only a governed
// Production outcome on the exact turn the graduate delivered can verify or fail it. Shadow work is never relabelled
// as verified; runtime failure is never a competence verdict.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { decideWorkforceVerification } from '../lib/ai/cos/cosWorkforceVerificationPolicy.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('only a decided production_verified outcome verifies or fails a graduate', () => {
  assert.deepEqual(decideWorkforceVerification({ turn_id: 't', verified_success: true, outcome_source: 'production_verified:owner' }),
    { decided: true, status: 'verified', lifecycleEvent: 'verified_outcome' })
  assert.deepEqual(decideWorkforceVerification({ turn_id: 't', verified_success: false, outcome_source: 'production_verified:owner' }),
    { decided: true, status: 'remediation', lifecycleEvent: 'remediation_started' })
  assert.deepEqual(decideWorkforceVerification({ turn_id: 't', verified_success: true, outcome_source: 'benchmark:synthetic' }),
    { decided: false, reason: 'not_production_verified' }, 'synthetic/benchmark evidence never counts')
  assert.deepEqual(decideWorkforceVerification({ turn_id: 't', verified_success: null, outcome_source: 'production_verified:owner' }),
    { decided: false, reason: 'outcome_undecided' })
  assert.deepEqual(decideWorkforceVerification(null), { decided: false, reason: 'no_outcome' })
})

test('a graduate that answers a real request enters the Workforce as served Production work', () => {
  const workers = read('lib/ai/cos/cosReasoningWorkers.ts')
  const at = workers.indexOf('function createGraduateWorker(')
  const worker = workers.slice(at, workers.indexOf('function baseOpenModelWorkers()', at))
  const success = worker.indexOf("phase: 'attempt_succeeded'")
  const served = worker.indexOf('recordGraduateProductionServed({')
  assert.ok(success > 0 && served > success, 'recorded only after a successful serve')
  assert.match(worker, /turnId,\s+objective: request\.prompt,\s+servingAttemptId: attemptId,/)
  const assignments = read('lib/ai/cos/cosWorkforceAssignments.ts')
  assert.match(assignments, /source_kind: 'production_request',\s+source_ref: clean\(input\.turnId, 80\),/)
  assert.match(assignments, /status: 'served',/)
  assert.match(assignments, /authority_expanded: false/)
})

test('shadow work never sticks in WORKING and never becomes a competence verdict', () => {
  const workers = read('lib/ai/cos/cosReasoningWorkers.ts')
  const at = workers.indexOf('export async function runWorkforceApprenticeShadow(')
  const shadow = workers.slice(at, workers.indexOf('async function routingDecision(', at))
  const empty = shadow.slice(shadow.indexOf('if (!text?.trim()) {'), shadow.indexOf("phase: 'attempt_succeeded'"))
  assert.match(empty, /status: 'runtime_failed'/, 'the empty path closes the assignment')
  assert.doesNotMatch(shadow, /status: 'remediation'|status: 'completed'/)
  assert.match(shadow, /status: 'served'/)
})

test('the Workforce cron verifies served Production work and writes it to the permanent lifecycle ledger', () => {
  const route = read('app/api/cron/cos-workforce-pipeline/route.ts')
  assert.match(route, /verifyServedWorkforceAssignments\(\)/)
  const assignments = read('lib/ai/cos/cosWorkforceAssignments.ts')
  assert.match(assignments, /\.eq\('source_kind', 'production_request'\)\s+\.eq\('status', 'served'\)/)
  assert.match(assignments, /\.like\('outcome_source', `\$\{WORKFORCE_PRODUCTION_OUTCOME_NAMESPACE\}%`\)/)
  const ledger = assignments.indexOf("db.rpc('append_cos_graduate_lifecycle_event'")
  const close = assignments.indexOf(".eq('id', row.id).eq('status', 'served')")
  assert.ok(ledger > 0 && close > ledger, 'ledger first, then close: a crash between them is repaired on the next run')
  assert.match(assignments, /ledgerHasEvent\(db, row\.registry_id, decision\.lifecycleEvent, correlationId\)/, 'idempotent ledger append')
})

test('the stage view stops calling unverified work PRODUCTION_VERIFIED', () => {
  const migration = read('supabase/migrations/20261002110000_workforce_production_verification_stage.sql')
  assert.match(migration, /when coalesce\(c\.verified,0\) > 0 then 'PRODUCTION_VERIFIED'/)
  assert.match(migration, /'AWAITING_PRODUCTION_VERIFICATION'/)
  assert.match(migration, /'SHADOW_SERVED'/)
  assert.match(migration, /'RUNTIME_RECOVERY'/)
  assert.match(migration, /set status = 'served', updated_at = now\(\)\s+where status = 'completed';/)
  assert.doesNotMatch(migration, /\bdelete\s+from\b/i, 'no evidence is deleted')
})
// end of saas/tests/cosWorkforceProductionVerification.node.test.ts (if this line is missing, the paste was cut short)