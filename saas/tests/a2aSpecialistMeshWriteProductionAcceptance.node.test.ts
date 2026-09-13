import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID,
  REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID,
  parseReferenceWriteRecoveryEnvelope,
  referenceWriteAcceptanceIdempotencyKey,
} from '../a2a-host/reference-write-acceptance.ts'
import {
  createSpecialistMeshWriteAcceptanceControlToken,
  verifySpecialistMeshWriteAcceptanceControlToken,
} from '../a2a-host/specialist-mesh-write-acceptance-control.ts'

const secret = '0123456789abcdef0123456789abcdef'
const agentId = PRIMARY_REFERENCE_WRITE_ACCEPTANCE_AGENT_ID
const taskId = 'write-acceptance-test-task'

test('write acceptance control is signed, task-bound, agent-bound, mode-bound, and expiring', () => {
  const now = new Date('2026-09-13T07:30:00.000Z')
  const token = createSpecialistMeshWriteAcceptanceControlToken({
    agentId,
    taskId,
    mode: 'after_apply_unavailable',
    signingSecret: secret,
    now,
    ttlMs: 60_000,
    nonce: 'test-nonce',
  })

  assert.deepEqual(verifySpecialistMeshWriteAcceptanceControlToken({ token, agentId, taskId, signingSecret: secret, now }), {
    valid: true,
    mode: 'after_apply_unavailable',
  })
  assert.deepEqual(verifySpecialistMeshWriteAcceptanceControlToken({ token, agentId, taskId: 'wrong-task', signingSecret: secret, now }), { valid: false })
  assert.deepEqual(verifySpecialistMeshWriteAcceptanceControlToken({ token, agentId: 'wrong-agent', taskId, signingSecret: secret, now }), { valid: false })
  assert.deepEqual(verifySpecialistMeshWriteAcceptanceControlToken({ token: `${token}x`, agentId, taskId, signingSecret: secret, now }), { valid: false })
  assert.deepEqual(verifySpecialistMeshWriteAcceptanceControlToken({ token, agentId, taskId, signingSecret: secret, now: new Date(now.getTime() + 61_000) }), { valid: false })
})

test('reference provider idempotency key is deterministic per logical operation', () => {
  const first = referenceWriteAcceptanceIdempotencyKey('tenant|prod|portable|task|marketing.publish')
  const duplicate = referenceWriteAcceptanceIdempotencyKey('tenant|prod|portable|task|marketing.publish')
  const other = referenceWriteAcceptanceIdempotencyKey('tenant|prod|portable|other-task|marketing.publish')
  assert.equal(first, duplicate)
  assert.notEqual(first, other)
  assert.match(first, /^sb-write-acceptance:[0-9a-f]{64}$/)
})

test('reference writer accepts only the exact host recovery provider envelope', () => {
  const envelope = parseReferenceWriteRecoveryEnvelope(JSON.stringify({
    schemaVersion: 'signalboost-specialist-mesh-write-recovery-v1',
    operationKey: 'operation-1',
    providerId: REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID,
    idempotencyKey: 'idem-1',
  }))
  assert.equal(envelope.providerId, REFERENCE_WRITE_ACCEPTANCE_PROVIDER_ID)
  assert.throws(() => parseReferenceWriteRecoveryEnvelope(JSON.stringify({
    ...envelope,
    providerId: 'other-provider',
  })), /provider_invalid/)
})

test('Production reference provider is RPC-only and persists applied, not_applied, and unknown reconciliation evidence', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260913073000_specialist_mesh_write_live_acceptance.sql', import.meta.url), 'utf8')
  assert.match(sql, /revoke all on table public\.a2a_specialist_mesh_write_acceptance_effects from public, anon, authenticated, service_role;/)
  assert.match(sql, /revoke all on table public\.a2a_specialist_mesh_write_acceptance_reconciliations from public, anon, authenticated, service_role;/)
  assert.match(sql, /create or replace function public\.a2a_specialist_mesh_write_acceptance_apply/)
  assert.match(sql, /on conflict \(operation_key\) do nothing;/)
  assert.match(sql, /write_acceptance_idempotency_conflict/)
  assert.match(sql, /create or replace function public\.a2a_specialist_mesh_write_acceptance_reconcile/)
  assert.match(sql, /p_force_unknown boolean default false/)
  assert.match(sql, /v_outcome := 'unknown'/)
  assert.match(sql, /v_outcome := 'applied'/)
  assert.match(sql, /v_outcome := 'not_applied'/)
  assert.match(sql, /a2a_specialist_mesh_write_acceptance_reconciliations/)
  assert.match(sql, /grant execute on function public\.a2a_specialist_mesh_write_acceptance_evidence\(text\) to service_role;/)
  assert.match(sql, /grant execute on function public\.a2a_specialist_mesh_write_recovery_evidence\(text\) to service_role;/)
})

test('public reference write endpoints require signed task-bound control before any provider apply', () => {
  for (const relative of [
    '../app/api/a2a/reference-write-acceptance-primary/route.ts',
    '../app/api/a2a/reference-write-acceptance-secondary/route.ts',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
    const verify = source.indexOf('verifySpecialistMeshWriteAcceptanceControlToken')
    const valid = source.indexOf('if (!control.valid)')
    const preApply = source.indexOf("control.mode === 'before_apply_unavailable'")
    const apply = source.indexOf('applyReferenceWriteAcceptanceEffect')
    const postApply = source.indexOf("control.mode === 'after_apply_unavailable'")
    assert.ok(verify >= 0)
    assert.ok(valid > verify)
    assert.ok(preApply > valid)
    assert.ok(apply > preApply)
    assert.ok(postApply > apply)
  }
})

test('deployment-bound acceptance explicitly refuses buyer/external-provider acceptance claims', () => {
  const route = readFileSync(new URL('../app/api/cron/specialist-mesh-write-production-acceptance/route.ts', import.meta.url), 'utf8')
  const runner = readFileSync(new URL('../a2a-host/specialist-mesh-write-production-live-acceptance.ts', import.meta.url), 'utf8')
  assert.match(route, /VERCEL_GIT_COMMIT_SHA/)
  assert.match(route, /productionDeploymentFingerprint/)
  assert.match(route, /buyerAccepted: false/)
  assert.match(route, /externalProviderAccepted: false/)
  assert.match(route, /referenceProviderOnly: true/)
  assert.match(runner, /scenario: 'already_applied'/)
  assert.match(runner, /scenario: 'safe_takeover'/)
  assert.match(runner, /scenario: 'unknown_outcome'/)
  assert.match(runner, /unknownOutcomeFailsClosed: true/)
})
