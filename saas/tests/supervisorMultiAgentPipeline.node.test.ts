import test from 'node:test'
import assert from 'node:assert/strict'

import { createMultiAgentReasoningEngine, type DiagnosisAgentPort, type RemediationStrategy } from '../lib/supervisor/index.ts'
import { createApiCapabilityRegistry } from '../lib/supervisor/executors/api-capability-registry.ts'
import { SupervisorOrchestrator } from '../lib/supervisor/orchestrator.ts'
import { DefaultSupervisorPolicyEngine } from '../lib/supervisor/policy-engine.ts'
import { createReferenceVerifier } from '../lib/supervisor/portable/reference-verifier.ts'
import type { RepairStep } from '../lib/supervisor/repair-plan-schema.ts'
import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'

const NOW = new Date('2026-08-07T21:00:00.000Z')
const now = () => NOW

const incident = (overrides: Partial<SupervisorIncident> = {}): SupervisorIncident => ({
  incidentId: 'incident-multi-agent-1',
  provider: 'generic-cloud',
  environment: 'production',
  severity: 'critical',
  detectedAt: NOW.toISOString(),
  source: 'webhook',
  errorCode: 'HTTP_503',
  errorMessage: 'Checkout service unavailable with HTTP 503',
  evidence: [{ evidenceId: 'e1', type: 'alert', capturedAt: NOW.toISOString(), summary: 'HTTP 503 observed on checkout service' }],
  affectedResource: '/services/checkout',
  metadata: {},
  ...overrides,
})

const capabilities = createApiCapabilityRegistry([
  {
    provider: 'generic-cloud', actionId: 'restart_service', mutation: true, riskClass: 'routine_reversible', approvalRequired: false, autoExecutable: true,
    methods: ['POST'], resourcePattern: /^\/services\//, validateParameters: params => params.actionId === 'restart_service' && typeof params.resource === 'string', maximumExecutionsPerDispatch: 1,
  },
  {
    provider: 'generic-cloud', actionId: 'restore_service', mutation: true, riskClass: 'routine_reversible', approvalRequired: false, autoExecutable: true,
    methods: ['POST'], resourcePattern: /^\/services\//, validateParameters: params => params.actionId === 'restore_service' && typeof params.resource === 'string', maximumExecutionsPerDispatch: 1,
  },
])

const strategy: RemediationStrategy = {
  strategyId: 'restart-checkout',
  matches: ({ task }) => task.shape === 'availability',
  buildSteps: ({ task }): RepairStep[] => [{
    stepId: 'restart-checkout', action: 'api_request', description: 'Restart the affected service through its registered capability.', protectedAction: true,
    parameters: { actionId: 'restart_service', method: 'POST', resource: task.affectedResource }, expectedResult: 'service restart accepted',
  }],
  buildVerificationSteps: ({ task }): RepairStep[] => [{
    stepId: 'verify-checkout', action: 'verify', description: 'Verify service health using read-only observations.', protectedAction: false,
    parameters: { target: task.affectedResource }, expectedResult: 'service healthy',
  }],
  buildRollbackSteps: ({ task }): RepairStep[] => [{
    stepId: 'restore-checkout', action: 'api_request', description: 'Restore the pre-repair service state.', protectedAction: false,
    parameters: { actionId: 'restore_service', method: 'POST', resource: task.affectedResource }, expectedResult: 'pre-repair state restored',
  }],
}

test('multi-agent handoffs are immutable and diagnosis is evidence-bound', async () => {
  const result = await createMultiAgentReasoningEngine({ now }).synthesize(incident({ environment: 'staging' }))
  assert.equal(result.trace.diagnosisValidation.valid, true)
  assert.equal(result.trace.diagnosis.evidenceIds[0], 'e1')
  assert.ok(Object.isFrozen(result.trace.context))
  assert.ok(Object.isFrozen(result.trace.diagnosis))
  assert.ok(Object.isFrozen(result.trace.proposedPlan))
  assert.ok(Object.isFrozen(result.trace.securityAssessment))
})

test('diagnosis validator fails closed on invented evidence', async () => {
  const badDiagnosis: DiagnosisAgentPort = {
    analyze: ({ incident }) => ({
      diagnosisId: `diag-${incident.incidentId}`, incidentId: incident.incidentId,
      hypotheses: [{ category: 'availability', explanation: 'invented', evidenceIds: ['not-real'], confidenceScore: 99 }],
      affectedResources: [incident.affectedResource ?? incident.provider], evidenceIds: ['not-real'], missingEvidence: [], confidenceScore: 99, summary: 'invented evidence diagnosis',
    }),
  }
  await assert.rejects(() => createMultiAgentReasoningEngine({ now, diagnosisAgent: badDiagnosis }).proposeRepairPlan(incident()), /Diagnosis validation failed closed/)
})

test('low-confidence diagnosis cannot reach planning', async () => {
  const engine = createMultiAgentReasoningEngine({ now, minimumDiagnosisConfidence: 95 })
  await assert.rejects(() => engine.proposeRepairPlan(incident()), /confidence below threshold/)
})

test('security review recommends dual roles during a production freeze window without granting authority', async () => {
  const result = await createMultiAgentReasoningEngine({ now, strategies: [strategy], apiCapabilityRegistry: capabilities, freezeWindow: true }).synthesize(incident())
  assert.equal(result.trace.securityAssessment.riskAssessment, 'high')
  assert.equal(result.trace.securityAssessment.recommendedApprovalsCount, 2)
  assert.deepEqual(result.trace.securityAssessment.recommendedRoles, ['ON_CALL_LEAD', 'SECURITY_OFFICER'])
  assert.equal(result.plan.approvalRequirements?.requiredApprovalsCount, 2)
  assert.deepEqual(result.plan.approvalRequirements?.requiredRoles, ['ON_CALL_LEAD', 'SECURITY_OFFICER'])
  assert.ok(result.trace.securityAssessment.findings.some(item => item.code === 'FREEZE_WINDOW_MUTATION'))
})

test('unknown mutating capability fails before deterministic policy or execution', async () => {
  await assert.rejects(
    () => createMultiAgentReasoningEngine({ now, strategies: [strategy] }).proposeRepairPlan(incident()),
    /unregistered API capability/,
  )
})

test('END TO END: multi-agent production mutation still stops at deterministic policy approval gate', async () => {
  let executorCalled = false
  const thinker = createMultiAgentReasoningEngine({ now, strategies: [strategy], apiCapabilityRegistry: capabilities })
  const orchestrator = new SupervisorOrchestrator({
    thinker,
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: { execute: () => { executorCalled = true; throw new Error('must not execute before deterministic approval') } },
    verifier: createReferenceVerifier({ runner: () => ({ ok: true, summary: 'healthy' }), now }),
    audit: { write: () => {} },
    mode: 'autopilot',
    executionContext: { executionId: 'exec-multi-agent-prod' },
  })

  const outcome = await orchestrator.run(incident())
  assert.equal(outcome.status, 'approval_required')
  assert.equal(executorCalled, false)
})
