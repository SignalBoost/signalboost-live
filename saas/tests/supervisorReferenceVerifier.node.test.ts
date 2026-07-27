// saas/tests/supervisorReferenceVerifier.node.test.ts
//
// The reference Verifier. Nearly every test here is about the difference between
// "the repair did not work" and "we could not tell" — because the tempting shortcut
// in a verifier is to return `verified` whenever nothing objected, and that would
// close real production incidents that nobody actually looked at.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createReferenceVerifier,
  READ_ONLY_VERIFICATION_ACTIONS,
  VERIFIER_DEFAULTS,
  type VerificationCheckResult,
} from '../lib/supervisor/portable/reference-verifier.ts'
import { SupervisorOrchestrator } from '../lib/supervisor/orchestrator.ts'
import { DefaultSupervisorPolicyEngine } from '../lib/supervisor/policy-engine.ts'
import type { RepairPlan, RepairStep } from '../lib/supervisor/repair-plan-schema.ts'
import type { ExecutionResult } from '../lib/supervisor/execution-contracts.ts'
import type { SupervisorIncident } from '../lib/supervisor/incident-schema.ts'

const NOW = new Date('2026-07-27T12:00:00.000Z')
const now = () => NOW

const step = (overrides: Partial<RepairStep> = {}): RepairStep => ({
  stepId: 'verify-1',
  action: 'read',
  description: 'Read the health endpoint',
  protectedAction: false,
  parameters: {},
  ...overrides,
})

const incident: SupervisorIncident = {
  incidentId: 'incident-1',
  provider: 'acme',
  environment: 'production',
  severity: 'critical',
  detectedAt: NOW.toISOString(),
  source: 'webhook',
  errorMessage: 'endpoint returning 503',
  evidence: [{ evidenceId: 'e1', type: 'alert', capturedAt: NOW.toISOString(), summary: '503 from /health' }],
  metadata: {},
}

const plan = (verificationSteps: RepairStep[]): RepairPlan => ({
  planId: 'plan-1',
  incidentId: 'incident-1',
  diagnosis: 'The service needs a restart',
  confidenceScore: 70,
  requiresBrowser: false,
  riskLevel: 'low',
  targetProvider: 'acme',
  targetEnvironment: 'production',
  steps: [step({ stepId: 'step-1' })],
  verificationSteps,
  generatedAt: NOW.toISOString(),
  schemaVersion: 'supervisor-repair-plan-v1',
})

const completed: ExecutionResult = {
  status: 'completed',
  executedStepIds: ['step-1'],
  startedAt: NOW.toISOString(),
  finishedAt: NOW.toISOString(),
  summary: 'restart issued',
}

const pass = (): VerificationCheckResult => ({ ok: true, summary: 'health endpoint returned 200 OK' })

test('an unconfigured verifier reports unresolved, never verified', async () => {
  // The single most important branch. A verifier with nothing to check with must not
  // report success — that would close a live incident nobody looked at.
  const verifier = createReferenceVerifier({ now })
  const outcome = await verifier.verify({ incident, plan: plan([step()]), execution: completed })

  assert.equal(outcome.status, 'unresolved')
  assert.deepEqual(outcome.errors, ['verifier_not_configured'])
  assert.equal(outcome.summary.includes('could not be checked'), true)
})

test('verifies when every read-only check actually passes', async () => {
  const verifier = createReferenceVerifier({ runner: pass, now })
  const outcome = await verifier.verify({ incident, plan: plan([step(), step({ stepId: 'verify-2', action: 'verify' })]), execution: completed })

  assert.equal(outcome.status, 'verified')
  assert.deepEqual(outcome.errors, [])
  assert.equal(outcome.metadata?.stepsPassed, 2)
})

test('reports failed when a check runs and the repair did not work', async () => {
  const verifier = createReferenceVerifier({ runner: () => ({ ok: false, summary: 'still returning 503' }), now })
  const outcome = await verifier.verify({ incident, plan: plan([step()]), execution: completed })

  assert.equal(outcome.status, 'failed', 'we checked, and it did not work')
  assert.ok(outcome.errors[0].startsWith('check_failed:verify-1'))
  assert.ok(outcome.errors[0].includes('still returning 503'))
})

test('reports unresolved when the check itself could not run', async () => {
  // A runner that throws is not evidence the repair failed. Conflating the two would
  // send an operator chasing a repair that may well have worked.
  const verifier = createReferenceVerifier({ runner: () => { throw new Error('monitoring API unreachable') }, now })
  const outcome = await verifier.verify({ incident, plan: plan([step()]), execution: completed })

  assert.equal(outcome.status, 'unresolved')
  assert.ok(outcome.errors[0].startsWith('check_error:verify-1'))
  assert.ok(outcome.errors[0].includes('monitoring API unreachable'))
  assert.equal(outcome.metadata?.stepsUncheckable, 1)
})

test('one uncheckable step makes the whole result unresolved even if the rest passed', async () => {
  // A partially observed system is not a verified one.
  let call = 0
  const verifier = createReferenceVerifier({
    runner: () => { call += 1; if (call === 2) throw new Error('timed out reading metrics'); return pass() },
    now,
  })
  const outcome = await verifier.verify({ incident, plan: plan([step(), step({ stepId: 'verify-2' }), step({ stepId: 'verify-3' })]), execution: completed })

  assert.equal(outcome.status, 'unresolved')
  assert.equal(outcome.metadata?.stepsPassed, 2)
  assert.equal(outcome.metadata?.stepsUncheckable, 1)
})

test('a hung check times out and counts as uncheckable, not as a pass', async () => {
  const verifier = createReferenceVerifier({ runner: () => new Promise(() => {}), stepTimeoutMs: 40, now })
  const started = Date.now()
  const outcome = await verifier.verify({ incident, plan: plan([step()]), execution: completed })

  assert.ok(Date.now() - started < 2000, 'the verifier must not wait forever')
  assert.equal(outcome.status, 'unresolved')
  assert.ok(outcome.errors[0].includes('timed out'))
})

test('refuses to run verification steps that are not read-only', async () => {
  let ran = 0
  const verifier = createReferenceVerifier({ runner: () => { ran += 1; return pass() }, now })
  const outcome = await verifier.verify({
    incident,
    plan: plan([step(), step({ stepId: 'verify-2', action: 'api_request', description: 'Restart the service again' })]),
    execution: completed,
  })

  assert.equal(outcome.status, 'unresolved')
  assert.ok(outcome.errors.some(e => e.startsWith('step_not_read_only:verify-2:api_request')))
  assert.equal(ran, 0, 'nothing runs when the plan is malformed — not even the read-only subset')
})

test('only read, screenshot and verify count as read-only', () => {
  assert.deepEqual([...READ_ONLY_VERIFICATION_ACTIONS], ['read', 'screenshot', 'verify'])
  for (const action of ['api_request', 'navigate', 'click', 'fill', 'select', 'stop', 'request_approval']) {
    assert.ok(!(READ_ONLY_VERIFICATION_ACTIONS as readonly string[]).includes(action), `${action} must not be treated as read-only`)
  }
})

test('enforces an expectedResult the plan declared', async () => {
  // A runner reporting ok:true while the observed output contradicts the plan's own
  // expectation is how verification quietly becomes a rubber stamp.
  const verifier = createReferenceVerifier({ runner: () => ({ ok: true, summary: 'endpoint returned 503 Service Unavailable' }), now })
  const outcome = await verifier.verify({
    incident,
    plan: plan([step({ expectedResult: '200 OK' })]),
    execution: completed,
  })

  assert.equal(outcome.status, 'failed')
  assert.ok(outcome.errors[0].startsWith('expectation_not_met:verify-1'))
})

test('an expectedResult found in the returned data also satisfies the check', async () => {
  const verifier = createReferenceVerifier({ runner: () => ({ ok: true, summary: 'read complete', data: { statusCode: 200, body: 'healthy' } }), now })
  const outcome = await verifier.verify({ incident, plan: plan([step({ expectedResult: 'healthy' })]), execution: completed })
  assert.equal(outcome.status, 'verified')
})

test('does not attempt verification when execution did not complete', async () => {
  let ran = 0
  const verifier = createReferenceVerifier({ runner: () => { ran += 1; return pass() }, now })
  for (const status of ['failed', 'partial'] as const) {
    const outcome = await verifier.verify({ incident, plan: plan([step()]), execution: { ...completed, status } })
    assert.equal(outcome.status, 'unresolved', status)
    assert.deepEqual(outcome.errors, [`execution_status:${status}`])
  }
  assert.equal(ran, 0, 'nothing to verify when nothing ran')
})

test('treats a malformed runner result as uncheckable rather than trusting it', async () => {
  const verifier = createReferenceVerifier({ runner: () => ({ summary: 'no ok field' }) as never, now })
  const outcome = await verifier.verify({ incident, plan: plan([step()]), execution: completed })

  assert.equal(outcome.status, 'unresolved')
  assert.ok(outcome.errors[0].startsWith('invalid_check_result:verify-1'))
})

test('the result is frozen and carries a default step timeout', async () => {
  assert.equal(VERIFIER_DEFAULTS.stepTimeoutMs, 15_000)
  const verifier = createReferenceVerifier({ runner: pass, now })
  const outcome = await verifier.verify({ incident, plan: plan([step()]), execution: completed })
  assert.throws(() => { (outcome as { status: string }).status = 'failed' })
  assert.equal(outcome.verifiedAt, NOW.toISOString())
})

test('END TO END: the orchestrator reports completed only when this verifier actually verifies', async () => {
  // Real orchestrator, real policy engine, real verifier. The same read-only plan is
  // run twice against the same wiring — once where the check passes and once where
  // it fails — and the orchestration result changes accordingly. That is the proof
  // the verifier is load-bearing rather than decorative.
  const build = (checkPasses: boolean) => new SupervisorOrchestrator({
    thinker: { proposeRepairPlan: (inc) => ({ ...plan([step({ expectedResult: '200 OK' })]), incidentId: inc.incidentId, planId: `plan-${inc.incidentId}` }) },
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: { execute: ({ approvedStepIds }) => ({ status: 'completed', executedStepIds: [...approvedStepIds], startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), summary: 'read complete' }) },
    verifier: createReferenceVerifier({
      runner: () => ({ ok: true, summary: checkPasses ? 'endpoint returned 200 OK' : 'endpoint returned 503' }),
      now,
    }),
    audit: { write: () => {} },
    mode: 'autopilot',
    executionContext: { executionId: 'exec-verify' },
  })

  const good = await build(true).run(incident)
  assert.equal(good.status, 'completed')
  assert.equal(good.verification?.status, 'verified')

  const bad = await build(false).run(incident)
  assert.equal(bad.status, 'unresolved', 'a repair whose verification fails must not report completed')
  assert.equal(bad.verification?.status, 'failed')
})

test('END TO END: an unconfigured verifier prevents the orchestrator claiming completed', async () => {
  const orchestrator = new SupervisorOrchestrator({
    thinker: { proposeRepairPlan: (inc) => ({ ...plan([step()]), incidentId: inc.incidentId, planId: `plan-${inc.incidentId}` }) },
    policyEngine: new DefaultSupervisorPolicyEngine(),
    executor: { execute: ({ approvedStepIds }) => ({ status: 'completed', executedStepIds: [...approvedStepIds], startedAt: NOW.toISOString(), finishedAt: NOW.toISOString(), summary: 'read complete' }) },
    verifier: createReferenceVerifier({ now }),
    audit: { write: () => {} },
    mode: 'autopilot',
    executionContext: { executionId: 'exec-unconfigured' },
  })

  const outcome = await orchestrator.run(incident)
  assert.equal(outcome.status, 'unresolved')
  assert.equal(outcome.verification?.status, 'unresolved')
  assert.deepEqual(outcome.verification?.errors, ['verifier_not_configured'])
})
