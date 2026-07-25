// saas/tests/deploymentRecovery.node.test.ts
//
// The first action the gateway is allowed to perform. These tests exist to prove three
// things: it runs when authorized, it stays inside its lane, and NOTHING on the automatic
// webhook path can reach it.

import test from 'node:test'
import assert from 'node:assert/strict'

import { runGoverned } from '../agent-gateway/index.ts'
import { defaultConsequenceClassifier } from '../agent-gateway/classifier.ts'
import type { AgentRequest, GatewayHost, GovernancePolicy } from '../agent-gateway/index.ts'
import { createExecutionChain } from '../agent-gateway-host/execution-chain.ts'
import {
  RETRY_DEPLOYMENT_ALLOWLIST_ENTRY,
  RETRY_DEPLOYMENT_KIND,
  RETRY_DEPLOYMENT_TARGET,
  createRetryDeploymentExecutor,
} from '../agent-gateway-host/deployment-recovery.ts'
import { GATEWAY_ALLOWLIST } from '../agent-gateway-host/signalboost-host.ts'
import {
  PROPOSED_REPAIR_TARGET,
  resolveSupervisorRepairAction,
} from '../agent-gateway-host/supervisor-actions.ts'
import type { RepairStep } from '../agent-gateway-host/supervisor-repair.ts'

const POLICY: GovernancePolicy = {
  classifier: defaultConsequenceClassifier,
  allowlist: [RETRY_DEPLOYMENT_ALLOWLIST_ENTRY],
}

function retryRequest(overrides: Partial<AgentRequest['action']> = {}): AgentRequest {
  return {
    requestId: 'retry-deploy:test',
    protocol: 'supervisor',
    agentId: 'owner-initiated-recovery',
    action: { kind: RETRY_DEPLOYMENT_KIND, target: RETRY_DEPLOYMENT_TARGET, ...overrides },
  }
}

function hostWith(redeploy: () => Promise<{ ok: boolean; data?: unknown; error?: string }>) {
  const calls: number[] = []
  const host: GatewayHost = {
    execution: createExecutionChain({
      executors: [
        createRetryDeploymentExecutor({
          redeploy: async () => {
            calls.push(1)
            return redeploy()
          },
        }),
      ],
    }),
  }
  return { host, calls }
}

test('production gateway policy contains only the reviewed deployment retry action', () => {
  assert.equal(GATEWAY_ALLOWLIST.length, 1)
  assert.deepEqual(GATEWAY_ALLOWLIST[0], RETRY_DEPLOYMENT_ALLOWLIST_ENTRY)
  assert.equal(GATEWAY_ALLOWLIST[0]?.actionKind, RETRY_DEPLOYMENT_KIND)
  assert.equal(GATEWAY_ALLOWLIST[0]?.target, RETRY_DEPLOYMENT_TARGET)
})

test('a retry is classified reversible_internal on its own merits', () => {
  const outcome = defaultConsequenceClassifier.classify(retryRequest())
  assert.equal(outcome, 'reversible_internal')
})

test('END TO END: an authorized retry actually redeploys', async () => {
  const { host, calls } = hostWith(async () => ({ ok: true, data: { via: 'deploy_hook' } }))
  const outcome = await runGoverned(retryRequest(), POLICY, host)

  assert.equal(outcome.verdict, 'execute')
  assert.equal(outcome.ok, true)
  assert.equal(calls.length, 1)
  assert.deepEqual(outcome.result, { via: 'deploy_hook' })
})

test('a failed redeploy is reported as a failure, never as a success', async () => {
  const { host } = hostWith(async () => ({ ok: false, error: 'Deploy hook returned 500' }))
  const outcome = await runGoverned(retryRequest(), POLICY, host)

  assert.equal(outcome.verdict, 'execute')
  assert.equal(outcome.ok, false)
  assert.match(outcome.error ?? '', /500/)
})

test('a redeploy that throws is handled, not escaped', async () => {
  const { host } = hostWith(async () => {
    throw new Error('network unreachable')
  })
  const outcome = await runGoverned(retryRequest(), POLICY, host)
  assert.equal(outcome.ok, false)
  assert.match(outcome.error ?? '', /network unreachable/)
})

test('remove the allowlist entry and the SAME request halts — the envelope is what authorizes it', async () => {
  const { host, calls } = hostWith(async () => ({ ok: true }))
  const outcome = await runGoverned(
    retryRequest(),
    { classifier: defaultConsequenceClassifier, allowlist: [] },
    host,
  )

  assert.equal(outcome.verdict, 'halt_for_approval')
  assert.equal(calls.length, 0)
})

test('the executor stays in its lane: any other target declines', async () => {
  const { host, calls } = hostWith(async () => ({ ok: true }))
  const outcome = await runGoverned(
    retryRequest({ target: 'platform.delete_everything' }),
    { classifier: defaultConsequenceClassifier, allowlist: [RETRY_DEPLOYMENT_ALLOWLIST_ENTRY] },
    host,
  )

  // data_destructive — Gate 1 halts it before the chain is ever consulted.
  assert.equal(outcome.consequenceClass, 'data_destructive')
  assert.equal(outcome.verdict, 'halt_for_approval')
  assert.equal(calls.length, 0)
})

test('ANTI-LOOP: no diagnosed repair step can ever resolve to the retry target', () => {
  const phrasings = [
    'retry the deployment',
    'redeploy production',
    'trigger a new build',
    'platform.retry_deployment',
    'rerun the failed deploy immediately',
  ]

  for (const action of phrasings) {
    const step: RepairStep = {
      step: 1,
      action,
      executor: 'api_executor',
      target: action,
      expected_result: 'the deployment succeeds',
      requires_approval: false,
    }
    const resolved = resolveSupervisorRepairAction(step, {
      incident_id: 'INC-1',
      project: 'signalboost-live',
    })
    assert.equal(resolved, PROPOSED_REPAIR_TARGET)
    assert.notEqual(resolved, RETRY_DEPLOYMENT_TARGET)
  }
})

test('the allowlist entry states its rollback honestly rather than naming a fake one', () => {
  assert.equal(RETRY_DEPLOYMENT_ALLOWLIST_ENTRY.target, RETRY_DEPLOYMENT_TARGET)
  assert.ok(RETRY_DEPLOYMENT_ALLOWLIST_ENTRY.rollback.length > 0)
  assert.match(RETRY_DEPLOYMENT_ALLOWLIST_ENTRY.rollback, /never promoted|no state to undo/i)
})