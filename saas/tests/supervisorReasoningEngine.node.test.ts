import test from 'node:test'
import assert from 'node:assert/strict'

import { createReasoningEngine, REASONING_PLAN_SCHEMA_VERSION, type RemediationStrategy } from '../lib/supervisor/reasoning/index.ts'
import { repairPlanSchema, type RepairStep } from '../lib/supervisor/repair-plan-schema.ts'
import { SupervisorOrchestrator } from '../lib/supervisor/orchestrator.ts'
import { DefaultSupervisorPolicyEngine } from '../lib/supervisor/policy-engine.ts'
import { createReferenceVerifier } from '../lib/supervisor/portable/reference-verifier.ts'
import type { AuditEvent } from '../lib/supervisor/execution-contracts.ts'
import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'

const NOW = new Date('2026-08-07T12:00:00.000Z')
const now = () => NOW

const incident = (overrides: Partial<SupervisorIncident> = {}): SupervisorIncident => ({
  incidentId: 'incident-reasoning-1',
  provider: 'generic-cloud',
  environment: 'production',
  severity: 'critical',
  detectedAt: NOW.toISOString(),
  source: 'webhook',
  errorCode: 'HTTP_503_CheckoutAPI',
  errorMessage: 'CheckoutAPI returning 503 after ReleaseCandidate-42',
  evidence: [{ evidenceId: 'e1', type: 'alert', capturedAt: NOW.toISOString(), summary: '503 observed' }],
  affectedResource: 'Service/CheckoutAPI',
  metadata: { deploymentId: 'ReleaseCandidate-42' },
  ...overrides,
})

const mutationStrategy = (withRollback = true): RemediationStrategy => ({
  strategyId: 'restart-known-service',
  matches: ({ task }) => task.shape === 'availability',
  buildSteps: ({ task }): RepairStep[] => [{
    stepId: 'strategy-restart-service',
    action: 'api_request',
    description: `Restart ${task.affectedResource} using the registered provider adapter`,
    protectedAction: true,
    parameters: { method: 'POST', operation: 'restart_service', target: task.affectedResource, reversible: true },
    expectedResult: 'provider accepts restart request',
  }],
  buildVerificationSteps: ({ task }): RepairStep[] => [{
    stepId: 'strategy-verify-service',
    action: 'verify',
    description: `Verify ${task.affectedResource} health after restart`,
    protectedAction: false,
    parameters: { target: task.affectedResource },
    expectedResult: 'service healthy',
  }],
  ...(withRollback ? {
    buildRollbackSteps: ({ task }): RepairStep[] => [{
      stepId: 'strategy-rollback-service',
      action: 'api_request',
      description: `Restore the pre-repair state for ${task.affectedResource}`,
      protectedAction: true,
      parameters: { method: 'POST', operation: 'restore_snapshot', target: task.affectedResource },
      expectedResult: 'pre-repair state restored',
    }],
  } : {}),
})

test('produces a schema-valid deterministic read-only plan when no remediation strategy matches', () => {
  const engine = createReasoningEngine({ now })
  const a = engine.proposeRepairPlan(incident({ errorMessage: 'p99 latency above 2 seconds' }))
  const b = engine.proposeRepairPlan(incident({ errorMessage: 'p99 latency above 2 seconds' }))

  assert.deepEqual(a, b)
  assert.equal(a.schemaVersion, REASONING_PLAN_SCHEMA_VERSION)
  assert.equal(a.riskLevel, 'low')
  assert.ok(a.steps.every(step => step.action === 'read'))
  assert.equal(a.verificationSteps[0]?.action, 'verify')
  repairPlanSchema.parse(JSON.parse(JSON.stringify(a)))
})

test('task rewriting preserves case-sensitive identifiers and deployment names', () => {
  const synthesis = createReasoningEngine({ now }).synthesize(incident())

  assert.equal(synthesis.trace.task.affectedResource, 'Service/CheckoutAPI')
  assert.equal(synthesis.trace.task.assumedState.deploymentId, 'ReleaseCandidate-42')
  assert.ok(synthesis.trace.task.canonicalGoal.includes('CheckoutAPI'))
  assert.ok(synthesis.trace.task.canonicalGoal.includes('ReleaseCandidate-42'))
})

test('registered mutation strategy is risk-elevated, protected, verified, and rollback-equipped', () => {
  const plan = createReasoningEngine({ now, strategies: [mutationStrategy()] }).proposeRepairPlan(incident())

  assert.equal(plan.riskLevel, 'high')
  assert.equal(plan.requiresBrowser, false)
  assert.ok(plan.steps.some(step => step.action === 'api_request' && step.protectedAction))
  assert.equal(plan.verificationSteps[0]?.stepId, 'strategy-verify-service')
  assert.equal(plan.rollbackSteps?.[0]?.stepId, 'strategy-rollback-service')
  repairPlanSchema.parse(JSON.parse(JSON.stringify(plan)))
})

test('mutation strategy without rollback fails closed before a RepairPlan is emitted', () => {
  const engine = createReasoningEngine({ now, strategies: [mutationStrategy(false)] })
  assert.throws(() => engine.proposeRepairPlan(incident()), /mutation without rollback steps/)
})

test('multiple matching remediation strategies fail closed instead of choosing authority by array accident', () => {
  const second: RemediationStrategy = { ...mutationStrategy(), strategyId: 'second-match' }
  const engine = createReasoningEngine({ now, strategies: [mutationStrategy(), second] })
  assert.throws(() => engine.proposeRepairPlan(incident()), /multiple remediation strategies/)
})

test('strategy cannot smuggle approval decisions or unprotected mutation into a plan', () => {
  const unsafe: RemediationStrategy = {
    strategyId: 'unsafe',
    matches: () => true,
    buildSteps: () => [{ stepId: 'unsafe-delete', action: 'api_request', description: 'change service', protectedAction: false, parameters: { method: 'POST' } }],
    buildRollbackSteps: () => [{ stepId: 'undo', action: 'read', description: 'noop', protectedAction: false, parameters: {} }],
  }
  assert.throws(() => createReasoningEngine({ now, strategies: [unsafe] }).proposeRepairPlan(incident()), /protectedAction=true/)
})

test('END TO END: read-only reasoning plan runs through the real policy and orchestrator', async () => {
  const audit: AuditEvent[] = []
  const executed: string[] = []
  const orchestrator = new SupervisorOrchestrator({
    thinker: createReasoningEngine({ now }),
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: {
      execute: ({ approvedStepIds }) => {
        executed.push(...approvedStepIds)
        return { status: 'completed', executedStepIds: [...approvedStepIds], startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), summary: 'diagnostic reads completed' }
      },
    },
    verifier: createReferenceVerifier({ runner: () => ({ ok: true, summary: 'observations recorded' }), now }),
    audit: { write: event => { audit.push(event) } },
    mode: 'passive',
    executionContext: { executionId: 'exec-reasoning-readonly' },
  })

  const outcome = await orchestrator.run(incident({ errorMessage: 'p99 latency above 2 seconds' }))

  assert.equal(outcome.status, 'completed')
  assert.equal(outcome.policy?.outcome, 'approved')
  assert.ok(executed.length >= 2)
  assert.ok(audit.some(event => event.eventType === 'plan_generated'))
  assert.ok(audit.some(event => event.eventType === 'verification_completed'))
})

test('END TO END: production mutation from reasoning engine still requires human approval', async () => {
  let executorCalled = false
  const orchestrator = new SupervisorOrchestrator({
    thinker: createReasoningEngine({ now, strategies: [mutationStrategy()] }),
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: {
      execute: () => {
        executorCalled = true
        throw new Error('executor must not run before approval')
      },
    },
    verifier: createReferenceVerifier({ runner: () => ({ ok: true, summary: 'healthy' }), now }),
    audit: { write: () => {} },
    mode: 'autopilot',
    executionContext: { executionId: 'exec-reasoning-prod' },
  })

  const outcome = await orchestrator.run(incident())

  assert.equal(outcome.status, 'approval_required')
  assert.match(outcome.reason, /Production modifications require approval/)
  assert.equal(executorCalled, false)
})
