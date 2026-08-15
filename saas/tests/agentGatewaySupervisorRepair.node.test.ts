// saas/tests/agentGatewaySupervisorRepair.node.test.ts
//
// Proves the four rules that let the supervisor actuate without ever becoming less safe than
// its own diagnosis asked for: requires_approval forces a halt, 'human' is never machine-
// dispatched, model prose can never become an executable target, and a plan stops at the
// first step that does not execute.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  dispatchRepairPlan,
  repairStepToRequest,
  resolveNothing,
  UNRECOGNIZED_TARGET,
} from '../agent-gateway-host/index.ts'
import type { RepairIncident, RepairStep } from '../agent-gateway-host/index.ts'
import { defaultConsequenceClassifier } from '../agent-gateway/classifier.ts'
import type { AgentRequest, GatewayHost, GovernancePolicy } from '../agent-gateway/types.ts'

const INCIDENT: RepairIncident = { incident_id: 'inc-1', project: 'signalboost', provider: 'Vercel' }

function step(over: Partial<RepairStep> = {}): RepairStep {
  return {
    step: 1,
    action: 'Restart the stalled render worker',
    executor: 'api_executor',
    target: 'render worker',
    expected_result: 'worker resumes',
    requires_approval: false,
    ...over,
  }
}

function host() {
  const performed: AgentRequest[] = []
  const approvals: AgentRequest[] = []
  const h: GatewayHost = {
    execution: { async perform(r) { performed.push(r); return { ok: true, result: 'done' } } },
    approvals: { async requestApproval(r) { approvals.push(r); return { approvalId: `PR-${approvals.length}` } } },
  }
  return { host: h, performed, approvals }
}

const POLICY: GovernancePolicy = {
  classifier: defaultConsequenceClassifier,
  allowlist: [{ actionKind: 'supervisor_repair', target: 'restart_worker', rollback: 'restore previous worker generation' }],
}

const resolveRestart = (s: RepairStep) => (s.action.toLowerCase().includes('restart') ? 'restart_worker' : null)

test('the default resolver recognizes nothing, so every step halts into a PR', async () => {
  const { host: h, performed, approvals } = host()
  const result = await dispatchRepairPlan({
    incident: INCIDENT, repairPlan: [step()], policy: POLICY, host: h, resolveAction: resolveNothing,
  })
  assert.equal(result.completed, false)
  assert.equal(result.results[0].resolvedTarget, null)
  assert.equal(result.results[0].outcome.verdict, 'halt_for_approval')
  assert.equal(performed.length, 0)
  assert.equal(approvals.length, 1, 'the owner gets a PR instead of the plan being discarded')
})

test('a recognized, allowlisted, reversible step actually executes', async () => {
  const { host: h, performed } = host()
  const result = await dispatchRepairPlan({
    incident: INCIDENT, repairPlan: [step()], policy: POLICY, host: h, resolveAction: resolveRestart,
  })
  assert.equal(result.completed, true)
  assert.equal(result.results[0].resolvedTarget, 'restart_worker')
  assert.equal(result.results[0].outcome.verdict, 'execute')
  assert.equal(performed.length, 1)
  assert.equal(performed[0].protocol, 'supervisor')
})

test('RULE 1: requires_approval forces a halt even when the action is allowlisted', async () => {
  const { host: h, performed } = host()
  const result = await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: [step({ requires_approval: true })],
    policy: POLICY, host: h, resolveAction: resolveRestart,
  })
  assert.equal(result.results[0].outcome.verdict, 'halt_for_approval')
  assert.equal(result.results[0].resolvedTarget, null, 'the diagnosis\'s caution is binding')
  assert.equal(performed.length, 0)
})

test("RULE 2: an executor of 'human' is never machine-dispatched", async () => {
  const { host: h, performed } = host()
  const result = await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: [step({ executor: 'human' })],
    policy: POLICY, host: h, resolveAction: resolveRestart,
  })
  assert.equal(result.results[0].outcome.verdict, 'halt_for_approval')
  assert.equal(performed.length, 0)
})

test('RULE 3: model prose never becomes an executable target', async () => {
  const req = repairStepToRequest(INCIDENT, step({ action: 'rm -rf everything; drop all tables' }), null, 'sup')
  assert.equal(req.action.target, UNRECOGNIZED_TARGET, 'the sentinel target, not the prose')
  assert.equal(req.action.params?.describedAction, 'rm -rf everything; drop all tables', 'prose is carried for the human only')

  const { host: h, performed } = host()
  const result = await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: [step({ action: 'rm -rf everything; drop all tables' })],
    policy: POLICY, host: h, resolveAction: resolveNothing,
  })
  assert.equal(result.results[0].outcome.consequenceClass, 'unknown')
  assert.equal(performed.length, 0)
})

test('RULE 4: the plan stops at the first step that does not execute', async () => {
  const { host: h, performed } = host()
  const plan = [
    step({ step: 1 }),
    step({ step: 2, action: 'Rotate the production API key' }),
    step({ step: 3 }),
  ]
  const result = await dispatchRepairPlan({
    incident: INCIDENT, repairPlan: plan, policy: POLICY, host: h, resolveAction: resolveRestart,
  })
  assert.equal(result.completed, false)
  assert.equal(result.results.length, 2, 'step 3 was never attempted')
  assert.equal(result.stoppedAt?.step, 2)
  assert.equal(performed.length, 1, 'only the first step ran against the system')
})

test('steps run in step order regardless of array order', async () => {
  const { host: h, performed } = host()
  await dispatchRepairPlan({
    incident: INCIDENT,
    repairPlan: [step({ step: 2 }), step({ step: 1 })],
    policy: POLICY, host: h, resolveAction: resolveRestart,
  })
  assert.deepEqual(performed.map((r) => r.action.params?.stepNumber), [1, 2])
})

test('an execution failure stops the plan and is reported, not swallowed', async () => {
  const failing: GatewayHost = {
    execution: { async perform() { return { ok: false, error: 'vercel api unreachable' } } },
    approvals: { async requestApproval() { return { approvalId: 'PR-1' } } },
  }
  const result = await dispatchRepairPlan({
    incident: INCIDENT, repairPlan: [step({ step: 1 }), step({ step: 2 })],
    policy: POLICY, host: failing, resolveAction: resolveRestart,
  })
  assert.equal(result.completed, false)
  assert.equal(result.results.length, 1)
  assert.match(result.stoppedAt?.reason ?? '', /vercel api unreachable/)
})

test('the request carries incident context so a PR is reviewable', () => {
  const req = repairStepToRequest(INCIDENT, step(), 'restart_worker', 'autonomous-supervisor')
  assert.equal(req.requestId, 'inc-1:repair:1')
  assert.equal(req.action.params?.incidentId, 'inc-1')
  assert.equal(req.action.params?.project, 'signalboost')
  assert.equal(req.action.params?.expectedResult, 'worker resumes')
})

test('repair attempt identity is idempotent for one detection and distinct for later detections', () => {
  const first = repairStepToRequest(INCIDENT, step(), 'restart_worker', 'autonomous-supervisor', {}, '2026-08-15T12:00:00.000Z')
  const replay = repairStepToRequest(INCIDENT, step(), 'restart_worker', 'autonomous-supervisor', {}, '2026-08-15T12:00:00.000Z')
  const later = repairStepToRequest(INCIDENT, step(), 'restart_worker', 'autonomous-supervisor', {}, '2026-08-15T12:05:00.000Z')
  assert.equal(first.requestId, replay.requestId)
  assert.notEqual(first.requestId, later.requestId)
  assert.match(first.requestId, /:attempt:2026-08-15T12:00:00.000Z$/)
  assert.equal(first.action.params?.executionAttemptId, '2026-08-15T12:00:00.000Z')
})
