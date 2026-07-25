// saas/tests/agentGatewayHost.node.test.ts
//
// Proves the host adapter closes the loop from the handoff: halts become OPEN Infrastructure
// PRs the owner approves, allowlisted reversible actions auto-run, and the ExecutionPort is
// a closed map rather than a door onto the whole provider registry.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createInfraPrApprovalPort,
  draftForHaltedAction,
  riskTierFor,
  createUniversalExecutionPort,
  refuseAllExecutionPort,
  filterParams,
} from '../agent-gateway-host/index.ts'
import type { StagedInfraPrDraft, UniversalRunnerCall } from '../agent-gateway-host/index.ts'
import { runGoverned } from '../agent-gateway/governance.ts'
import { defaultConsequenceClassifier } from '../agent-gateway/classifier.ts'
import type { AgentRequest, GatewayHost, GovernancePolicy } from '../agent-gateway/types.ts'

function req(kind: string, target: string, params?: Record<string, unknown>): AgentRequest {
  return {
    requestId: 'req-1',
    protocol: 'mcp',
    agentId: 'copilot-1',
    tenantId: 'acme',
    actor: { userId: 'u-7' },
    action: { kind, target, params },
  }
}

const POLICY: GovernancePolicy = {
  classifier: defaultConsequenceClassifier,
  allowlist: [{ actionKind: 'tool_call', target: 'restart_worker', rollback: 'restore previous generation' }],
}

function stagingHost() {
  const staged: StagedInfraPrDraft[] = []
  const calls: UniversalRunnerCall[] = []
  const host: GatewayHost = {
    approvals: createInfraPrApprovalPort({
      createInfraPr: async (draft) => {
        staged.push(draft)
        return { ok: true, data: { id: `infra_pr_${staged.length}` } }
      },
    }),
    execution: createUniversalExecutionPort({
      runUniversalProvider: async (input) => {
        calls.push(input)
        return { ok: true, status: 200, outputs: { restarted: true } }
      },
      actions: [
        {
          actionKind: 'tool_call',
          target: 'restart_worker',
          providerId: 'vercel',
          actionId: 'restart_worker',
          allowedParams: ['worker'],
        },
      ],
    }),
  }
  return { host, staged, calls }
}

test('risk tier never returns low — a halted action is not low risk by definition', () => {
  for (const c of ['safety', 'financial', 'data_destructive', 'unknown'] as const) {
    assert.equal(riskTierFor(c), 'high')
  }
  assert.equal(riskTierFor('external_effect'), 'medium')
  assert.notEqual(riskTierFor('reversible_internal'), 'low')
})

test('a halted action is staged as an Infrastructure PR that states it has NOT run', () => {
  const draft = draftForHaltedAction(
    req('tool_call', 'wireTransfer', { amount_cents: 100 }),
    { requestId: 'req-1', verdict: 'halt_for_approval', consequenceClass: 'financial', reason: 'financial actions always require a human' },
    'agent-gateway',
  )
  assert.equal(draft.risk, 'high')
  assert.equal(draft.source, 'assistant')
  assert.equal(draft.triggers_redeploy, false, 'staging a proposal must never redeploy')
  assert.equal(draft.created_by, 'u-7')
  assert.match(draft.description, /has NOT been performed/)
  assert.match(draft.description, /financial/)
  assert.equal((draft.payload as Record<string, unknown>).requestId, 'req-1')
})

test('END TO END: a financial action halts, opens a PR, and never reaches the provider', async () => {
  const { host, staged, calls } = stagingHost()
  const outcome = await runGoverned(req('tool_call', 'wireTransfer', { amount_cents: 900_00 }), POLICY, host)

  assert.equal(outcome.verdict, 'halt_for_approval')
  assert.equal(outcome.consequenceClass, 'financial')
  assert.equal(outcome.approvalId, 'infra_pr_1', 'the agent is told which PR holds its request')
  assert.equal(staged.length, 1)
  assert.equal(calls.length, 0, 'the provider was never called')
})

test('END TO END: an allowlisted reversible action auto-runs through universalRunner', async () => {
  const { host, staged, calls } = stagingHost()
  const outcome = await runGoverned(req('tool_call', 'restart_worker', { worker: 'render' }), POLICY, host)

  assert.equal(outcome.verdict, 'execute')
  assert.equal(outcome.ok, true)
  assert.equal(staged.length, 0, 'no PR needed for a pre-authorized reversible action')
  assert.deepEqual(calls, [{ providerId: 'vercel', actionId: 'restart_worker', variables: { worker: 'render' } }])
})

test('THE SECOND LOCK: an unmapped action is refused even if it clears governance', async () => {
  const calls: UniversalRunnerCall[] = []
  const port = createUniversalExecutionPort({
    runUniversalProvider: async (i) => { calls.push(i); return { ok: true, status: 200, outputs: {} } },
    actions: [],
  })
  const result = await port.perform(req('tool_call', 'restart_worker'))
  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /no executable mapping/)
  assert.equal(calls.length, 0, 'the registry was never touched')
})

test('agent-supplied parameters are filtered to the declared allowlist', async () => {
  assert.deepEqual(filterParams({ worker: 'render', evil: 'rm -rf' }, ['worker']), { worker: 'render' })
  assert.deepEqual(filterParams({ a: 1 }, undefined), { a: 1 })

  const calls: UniversalRunnerCall[] = []
  const port = createUniversalExecutionPort({
    runUniversalProvider: async (i) => { calls.push(i); return { ok: true, status: 200, outputs: {} } },
    actions: [{ actionKind: 'tool_call', target: 'restart_worker', providerId: 'vercel', actionId: 'restart_worker', allowedParams: ['worker'] }],
  })
  await port.perform(req('tool_call', 'restart_worker', { worker: 'render', callbackUrl: 'https://attacker.example' }))
  assert.deepEqual(calls[0].variables, { worker: 'render' }, 'the smuggled field never reached the provider')
})

test('the default execution port refuses everything', async () => {
  const result = await refuseAllExecutionPort.perform(req('tool_call', 'anything'))
  assert.equal(result.ok, false)
})

test('a failed PR staging yields an empty approvalId and still never executes', async () => {
  const calls: UniversalRunnerCall[] = []
  const host: GatewayHost = {
    approvals: createInfraPrApprovalPort({ createInfraPr: async () => ({ ok: false, error: 'db down' }) }),
    execution: createUniversalExecutionPort({
      runUniversalProvider: async (i) => { calls.push(i); return { ok: true, status: 200, outputs: {} } },
      actions: [],
    }),
  }
  const outcome = await runGoverned(req('tool_call', 'wireTransfer'), POLICY, host)
  assert.equal(outcome.verdict, 'halt_for_approval')
  assert.equal(outcome.approvalId, '')
  assert.equal(calls.length, 0)
})

test('a throwing PR store cannot crash the governance core', async () => {
  const port = createInfraPrApprovalPort({ createInfraPr: async () => { throw new Error('boom') } })
  const result = await port.requestApproval(
    req('tool_call', 'wireTransfer'),
    { requestId: 'req-1', verdict: 'halt_for_approval', consequenceClass: 'financial', reason: 'x' },
  )
  assert.equal(result.approvalId, '')
})

test('a provider failure is reported as a failed execution, not a silent success', async () => {
  const port = createUniversalExecutionPort({
    runUniversalProvider: async () => ({ ok: false, status: 502, outputs: {}, error: 'upstream unavailable' }),
    actions: [{ actionKind: 'tool_call', target: 'restart_worker', providerId: 'vercel', actionId: 'restart_worker' }],
  })
  const result = await port.perform(req('tool_call', 'restart_worker'))
  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /upstream unavailable/)
})
