import test from 'node:test'
import assert from 'node:assert/strict'
import * as crypto from 'crypto'

import { createReasoningEngine, type RemediationStrategy } from '../lib/supervisor/reasoning/index.ts'
import { DefaultSupervisorPolicyEngine } from '../lib/supervisor/policy-engine.ts'
import { SupervisorOrchestrator } from '../lib/supervisor/orchestrator.ts'
import { createReferenceVerifier } from '../lib/supervisor/portable/reference-verifier.ts'
import type { AuditEvent } from '../lib/supervisor/execution-contracts.ts'
import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import type { RepairStep } from '../lib/supervisor/repair-plan-schema.ts'
import { MerkleAuditLedger } from '../lib/supervisor/kernel/merkle-audit-ledger.ts'
import { MerkleAuditSink } from '../lib/supervisor/kernel/merkle-audit-sink.ts'
import { QuorumApprovalEngine, quorumRequestId, type QuorumRole } from '../lib/supervisor/kernel/quorum-approval.ts'
import { QuorumApprovalGate } from '../lib/supervisor/kernel/quorum-gate.ts'
import { QuorumAwarePolicyEngine } from '../lib/supervisor/kernel/quorum-policy-engine.ts'

const NOW = new Date('2026-08-07T22:30:00.000Z')
const now = () => NOW

const incident: SupervisorIncident = {
  incidentId: 'incident-kernel-1',
  provider: 'generic-cloud',
  environment: 'production',
  severity: 'critical',
  detectedAt: NOW.toISOString(),
  source: 'webhook',
  errorCode: 'HTTP_503',
  errorMessage: 'checkout unavailable with 503',
  evidence: [{ evidenceId: 'e1', type: 'alert', capturedAt: NOW.toISOString(), summary: '503 observed' }],
  affectedResource: '/services/checkout',
  metadata: {},
}

const strategy: RemediationStrategy = {
  strategyId: 'restart-service',
  matches: ({ task }) => task.shape === 'availability',
  buildSteps: ({ task }): RepairStep[] => [{
    stepId: 'restart-service', action: 'api_request', description: 'Restart service', protectedAction: true,
    parameters: { actionId: 'restart_service', method: 'POST', resource: task.affectedResource }, expectedResult: 'restart accepted',
  }],
  buildVerificationSteps: ({ task }): RepairStep[] => [{
    stepId: 'verify-service', action: 'verify', description: 'Verify service health', protectedAction: false,
    parameters: { target: task.affectedResource }, expectedResult: 'healthy',
  }],
  buildRollbackSteps: ({ task }): RepairStep[] => [{
    stepId: 'restore-service', action: 'api_request', description: 'Restore previous state', protectedAction: false,
    parameters: { actionId: 'restore_service', method: 'POST', resource: task.affectedResource }, expectedResult: 'restored',
  }],
}

function signer(role: QuorumRole, approverId: string) {
  const pair = crypto.generateKeyPairSync('ed25519')
  return {
    approver: { approverId, role, publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
    sign(payload: string) {
      return {
        approverId,
        role,
        signedAt: NOW.toISOString(),
        signatureHex: crypto.sign(null, Buffer.from(payload), pair.privateKey).toString('hex'),
      }
    },
  }
}

test('quorum requires unique authorized signatures and mandatory roles', async () => {
  const engine = new QuorumApprovalEngine({ now, nonceFactory: () => 'nonce-fixed' })
  const lead = signer('ON_CALL_LEAD', 'lead-1')
  const security = signer('SECURITY_OFFICER', 'security-1')
  engine.registerApprover(lead.approver)
  engine.registerApprover(security.approver)

  const thinker = createReasoningEngine({ now, strategies: [strategy] })
  const plan = thinker.proposeRepairPlan(incident)
  const policy = await new DefaultSupervisorPolicyEngine().evaluate({ incident, plan, mode: 'autopilot', context: {} })
  assert.equal(policy.outcome, 'approval_required')

  const state = await engine.ensureRequest({ incident, plan, policy, quorumPolicy: { requiredSignaturesCount: 2, requiredRoles: ['ON_CALL_LEAD', 'SECURITY_OFFICER'], ttlMs: 60_000 } })
  const payload = engine.signingPayload(state.request)
  const one = await engine.submitSignature(state.request.requestId, lead.sign(payload))
  assert.equal(one.satisfied, false)
  await assert.rejects(() => engine.submitSignature(state.request.requestId, lead.sign(payload)), /already signed/)
  const two = await engine.submitSignature(state.request.requestId, security.sign(payload))
  assert.equal(two.satisfied, true)
})

test('quorum signatures are bound to the exact canonical request payload', async () => {
  const engine = new QuorumApprovalEngine({ now, nonceFactory: () => 'nonce-fixed' })
  const lead = signer('ON_CALL_LEAD', 'lead-1')
  engine.registerApprover(lead.approver)
  const thinker = createReasoningEngine({ now, strategies: [strategy] })
  const plan = thinker.proposeRepairPlan(incident)
  const policy = await new DefaultSupervisorPolicyEngine().evaluate({ incident, plan, mode: 'autopilot', context: {} })
  const state = await engine.ensureRequest({ incident, plan, policy, quorumPolicy: { requiredSignaturesCount: 1, requiredRoles: ['ON_CALL_LEAD'], ttlMs: 60_000 } })
  const bad = lead.sign(engine.signingPayload({ ...state.request, nonce: 'tampered' }))
  await assert.rejects(() => engine.submitSignature(state.request.requestId, bad), /Invalid cryptographic signature/)
})

test('quorum policy wrapper cannot override blocked policy and unlocks only approval_required', async () => {
  const engine = new QuorumApprovalEngine({ now, nonceFactory: () => 'nonce-fixed' })
  const lead = signer('ON_CALL_LEAD', 'lead-1')
  const security = signer('SECURITY_OFFICER', 'security-1')
  engine.registerApprover(lead.approver)
  engine.registerApprover(security.approver)
  const base = new DefaultSupervisorPolicyEngine()
  const gate = new QuorumApprovalGate(engine, () => ({ requiredSignaturesCount: 2, requiredRoles: ['ON_CALL_LEAD', 'SECURITY_OFFICER'], ttlMs: 60_000 }))
  const policyEngine = new QuorumAwarePolicyEngine(base, gate)
  const thinker = createReasoningEngine({ now, strategies: [strategy] })
  const plan = thinker.proposeRepairPlan(incident)
  const baseDecision = await base.evaluate({ incident, plan, mode: 'autopilot', context: {} })
  const requestId = quorumRequestId(plan, baseDecision)

  let executions = 0
  const orchestrator = new SupervisorOrchestrator({
    thinker,
    policyEngine,
    executor: { execute: ({ approvedStepIds }) => { executions += 1; return { status: 'completed', executedStepIds: [...approvedStepIds], startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), summary: 'done' } } },
    verifier: createReferenceVerifier({ runner: () => ({ ok: true, summary: 'healthy' }), now }),
    audit: { write: () => {} },
    mode: 'autopilot',
    executionContext: { executionId: 'exec-kernel-quorum' },
  })

  const pending = await orchestrator.run(incident)
  assert.equal(pending.status, 'approval_required')
  assert.equal(executions, 0)
  const state = await engine.getState(requestId)
  assert.ok(state)
  const payload = engine.signingPayload(state!.request)
  await engine.submitSignature(requestId, lead.sign(payload))
  await engine.submitSignature(requestId, security.sign(payload))

  const approved = await orchestrator.run(incident)
  assert.equal(approved.status, 'completed')
  assert.equal(executions, 1)

  const blocked = await policyEngine.evaluate({ incident, plan, mode: 'disabled', context: {} })
  assert.equal(blocked.outcome, 'blocked')
})

test('Merkle ledger verifies inclusion and detects tampered event content', async () => {
  const checkpoints: string[] = []
  const ledger = new MerkleAuditLedger({ checkpoint: ({ merkleRoot }) => { checkpoints.push(merkleRoot) } })
  const events: AuditEvent[] = [0, 1, 2].map(index => ({
    eventId: `event-${index}`,
    incidentId: 'incident-kernel-1',
    eventType: index === 0 ? 'incident_received' : index === 1 ? 'policy_evaluated' : 'execution_completed',
    occurredAt: new Date(NOW.getTime() + index * 1000).toISOString(),
    payload: { index },
    schemaVersion: 'supervisor-audit-v1',
  }))
  for (const event of events) await ledger.append(event)
  assert.equal(ledger.leafCount(), 3)
  assert.equal(checkpoints.length, 3)
  const proof = ledger.getInclusionProof(1)
  assert.equal(MerkleAuditLedger.verifyEvent(events[1], proof), true)
  assert.equal(MerkleAuditLedger.verifyEvent({ ...events[1], payload: { index: 99 } }, proof), false)
})

test('MerkleAuditSink can wrap the existing Supervisor audit path', async () => {
  const ledger = new MerkleAuditLedger()
  const sink = new MerkleAuditSink(ledger)
  const event: AuditEvent = { eventId: 'event-1', incidentId: 'incident-1', eventType: 'incident_received', occurredAt: NOW.toISOString(), payload: { provider: 'generic-cloud' }, schemaVersion: 'supervisor-audit-v1' }
  await sink.write(event)
  assert.equal(ledger.leafCount(), 1)
  assert.equal(sink.latestEvidence()?.merkleRoot, ledger.rootHash())
})
