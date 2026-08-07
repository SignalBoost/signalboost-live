import test from 'node:test'
import assert from 'node:assert/strict'

import { AdaptiveReplanner, createCognitiveReasoningEngine, type CognitiveEvidenceSource } from '../lib/supervisor/cognitive/index.ts'
import { createApiCapabilityRegistry } from '../lib/supervisor/executors/api-capability-registry.ts'
import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'
import type { RepairStep } from '../lib/supervisor/repair-plan-schema.ts'
import type { RemediationStrategy } from '../lib/supervisor/reasoning/types.ts'
import { SupervisorOrchestrator } from '../lib/supervisor/orchestrator.ts'
import { DefaultSupervisorPolicyEngine } from '../lib/supervisor/policy-engine.ts'
import { createReferenceVerifier } from '../lib/supervisor/portable/reference-verifier.ts'
import type { RollbackOutcome } from '../lib/supervisor/executors/rollback-coordinator.ts'

const NOW = new Date('2026-08-07T12:00:00.000Z')
const now = () => NOW

const incident = (overrides: Partial<SupervisorIncident> = {}): SupervisorIncident => ({
  incidentId: 'incident-cognitive-1',
  provider: 'generic-cloud',
  environment: 'production',
  severity: 'critical',
  detectedAt: NOW.toISOString(),
  source: 'webhook',
  errorCode: 'HTTP_503',
  errorMessage: 'checkout service returning 503',
  evidence: [{ evidenceId: 'alert-1', type: 'alert', capturedAt: NOW.toISOString(), summary: '503 alert' }],
  affectedResource: '/services/checkout',
  metadata: {},
  ...overrides,
})

const evidenceSource: CognitiveEvidenceSource = {
  sourceId: 'provider-health',
  collect: () => [{
    evidenceId: 'health-1',
    type: 'health_probe',
    capturedAt: '2026-08-07T12:00:01.000Z',
    summary: 'read-only health probe confirms failure',
  }],
}

const strategy: RemediationStrategy = {
  strategyId: 'restart-service',
  matches: ({ task }) => task.shape === 'availability',
  buildSteps: ({ task }): RepairStep[] => [{
    stepId: 'restart-service',
    action: 'api_request',
    description: 'Restart the known service',
    protectedAction: true,
    parameters: { actionId: 'restart_service', method: 'POST', resource: task.affectedResource },
  }],
  buildRollbackSteps: ({ task }): RepairStep[] => [{
    stepId: 'restore-service',
    action: 'api_request',
    description: 'Restore the previous service state',
    protectedAction: false,
    parameters: { actionId: 'restore_service', method: 'POST', resource: task.affectedResource },
  }],
}

const registry = createApiCapabilityRegistry([
  {
    provider: 'generic-cloud',
    actionId: 'restart_service',
    mutation: true,
    riskClass: 'consequential',
    approvalRequired: true,
    autoExecutable: false,
    methods: ['POST'],
    resourcePattern: /^\/services\/[a-z0-9-]+$/,
    validateParameters: parameters => parameters.actionId === 'restart_service',
  },
  {
    provider: 'generic-cloud',
    actionId: 'restore_service',
    mutation: true,
    riskClass: 'routine_reversible',
    approvalRequired: false,
    autoExecutable: true,
    methods: ['POST'],
    resourcePattern: /^\/services\/[a-z0-9-]+$/,
    validateParameters: parameters => parameters.actionId === 'restore_service',
  },
])

test('collects registered read-only evidence and builds deterministic context before reasoning', async () => {
  const engine = createCognitiveReasoningEngine({ now, evidenceSources: [evidenceSource] })
  const synthesis = await engine.synthesize(incident({ errorMessage: 'p99 latency above 2 seconds' }))

  assert.equal(synthesis.trace.context.evidence.length, 2)
  assert.deepEqual(synthesis.trace.context.evidenceTypes, ['alert', 'health_probe'])
  assert.equal(synthesis.plan.riskLevel, 'low')
  assert.ok(synthesis.plan.steps.every(step => step.action === 'read'))
})

test('fails closed when a reasoning strategy references an unregistered API capability', async () => {
  const engine = createCognitiveReasoningEngine({ now, strategies: [strategy] })
  await assert.rejects(() => engine.proposeRepairPlan(incident()), /unregistered API capability/)
})

test('admits known repair capability but requires policy approval, and admits routine reversible rollback', async () => {
  const engine = createCognitiveReasoningEngine({ now, strategies: [strategy], apiCapabilityRegistry: registry })
  const synthesis = await engine.synthesize(incident())

  const repair = synthesis.trace.capabilityAdmissions.find(item => item.stepId === 'restart-service')
  const rollback = synthesis.trace.capabilityAdmissions.find(item => item.stepId === 'restore-service')
  assert.equal(repair?.known, true)
  assert.equal(repair?.approvalRequired, true)
  assert.equal(repair?.riskClass, 'consequential')
  assert.equal(rollback?.autoExecutable, true)
  assert.equal(rollback?.riskClass, 'routine_reversible')
})

test('end to end: cognitive thinker still stops production mutation at the existing policy gate', async () => {
  let executed = false
  const orchestrator = new SupervisorOrchestrator({
    thinker: createCognitiveReasoningEngine({ now, strategies: [strategy], apiCapabilityRegistry: registry, evidenceSources: [evidenceSource] }),
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: { execute: () => { executed = true; throw new Error('must not execute') } },
    verifier: createReferenceVerifier({ runner: () => ({ ok: true, summary: 'healthy' }), now }),
    audit: { write: () => {} },
    mode: 'autopilot',
    executionContext: { executionId: 'exec-cognitive' },
  })

  const outcome = await orchestrator.run(incident())
  assert.equal(outcome.status, 'approval_required')
  assert.equal(executed, false)
})

test('adaptive replanning refuses unresolved verification', async () => {
  const engine = createCognitiveReasoningEngine({ now })
  const previousPlan = await engine.proposeRepairPlan(incident({ errorMessage: 'p99 latency above 2 seconds' }))
  const replanner = new AdaptiveReplanner(engine)

  await assert.rejects(() => replanner.replan({
    incident: incident({ errorMessage: 'p99 latency above 2 seconds' }),
    previousPlan,
    verification: { status: 'unresolved', verifiedAt: NOW.toISOString(), summary: 'cannot determine state', errors: ['probe timeout'] },
    attempt: 0,
  }), /requires an explicit failed verification/)
})

test('adaptive replanning refuses a failed mutation until rollback is restored', async () => {
  const engine = createCognitiveReasoningEngine({ now, strategies: [strategy], apiCapabilityRegistry: registry })
  const previousPlan = await engine.proposeRepairPlan(incident())
  const replanner = new AdaptiveReplanner(engine)

  await assert.rejects(() => replanner.replan({
    incident: incident(),
    previousPlan,
    verification: { status: 'failed', verifiedAt: NOW.toISOString(), summary: 'still unhealthy', errors: ['503'] },
    attempt: 0,
  }), /must be successfully restored/)
})

test('adaptive replanning can produce one fresh candidate after successful restoration', async () => {
  const engine = createCognitiveReasoningEngine({ now, strategies: [strategy], apiCapabilityRegistry: registry })
  const previousPlan = await engine.proposeRepairPlan(incident())
  const replanner = new AdaptiveReplanner(engine)
  const rollback: RollbackOutcome = {
    planId: previousPlan.planId,
    incidentId: previousPlan.incidentId,
    status: 'restored',
    mechanism: 'snapshot_restore',
    restoredSnapshotIds: ['snapshot-1'],
    reason: 'restored',
    executedStepIds: [],
    skippedStepIds: [],
    evidence: [],
    reverification: 'verified',
    attemptedAt: NOW.toISOString(),
    completedAt: NOW.toISOString(),
    schemaVersion: 'supervisor-rollback-result-v1',
  }

  const result = await replanner.replan({
    incident: incident(),
    previousPlan,
    verification: { status: 'failed', verifiedAt: NOW.toISOString(), summary: 'still unhealthy', errors: ['503'] },
    rollback,
    attempt: 0,
  })

  assert.equal(result.parentPlanId, previousPlan.planId)
  assert.ok(result.plan.planId)
  await assert.rejects(() => replanner.replan({
    incident: incident(),
    previousPlan,
    verification: { status: 'failed', verifiedAt: NOW.toISOString(), summary: 'still unhealthy', errors: ['503'] },
    rollback,
    attempt: 1,
  }), /bounded to one retry candidate/)
})
