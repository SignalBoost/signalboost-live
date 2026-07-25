// saas/tests/agentGatewayPrEngineApprovals.node.test.ts
//
// Proves the two-tier approval routing: a template-mapped halt becomes a real cockpit PR
// carrying an executable step, an unmapped halt falls back to the durable holding pen rather
// than vanishing, and no failure path can ever turn a halt into an execution.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createPrEngineApprovalPort,
  stagedPrFor,
} from '../agent-gateway-host/index.ts'
import type { ApprovableAction, StagePrInput } from '../agent-gateway-host/index.ts'
import { runGoverned } from '../agent-gateway/governance.ts'
import { defaultConsequenceClassifier } from '../agent-gateway/classifier.ts'
import type { AgentRequest, ApprovalPort, GatewayHost, GovernancePolicy } from '../agent-gateway/types.ts'

function req(target: string, params?: Record<string, unknown>): AgentRequest {
  return {
    requestId: 'req-42',
    protocol: 'mcp',
    agentId: 'copilot-1',
    tenantId: 'acme',
    actor: { userId: 'u-7' },
    action: { kind: 'tool_call', target, params },
  }
}

const DECISION = {
  requestId: 'req-42',
  verdict: 'halt_for_approval' as const,
  consequenceClass: 'external_effect' as const,
  reason: 'external_effect always requires a human',
}

const MAPPED: readonly ApprovableAction[] = [
  {
    actionKind: 'tool_call',
    target: 'set_env',
    templateId: 'vercel.set_env',
    label: 'Set a Vercel environment variable',
    allowedParams: ['key', 'value'],
  },
]

test('a mapped halt becomes a cockpit PR carrying one executable step', () => {
  const pr: StagePrInput = stagedPrFor(req('set_env', { key: 'A', value: 'B' }), DECISION, MAPPED[0])
  assert.equal(pr.steps.length, 1)
  assert.equal(pr.steps[0].templateId, 'vercel.set_env')
  assert.equal(pr.steps[0].provider, 'vercel', 'provider is derived from the template id')
  assert.deepEqual(pr.steps[0].payload, { key: 'A', value: 'B' })
  assert.equal(pr.createdBy, 'u-7')
  assert.match(pr.summary ?? '', /has NOT been performed/)
  assert.match(pr.summary ?? '', /Approving this PR executes it/)
})

test('agent-supplied parameters are filtered before they reach the PR payload', () => {
  const pr = stagedPrFor(req('set_env', { key: 'A', value: 'B', target: 'production' }), DECISION, MAPPED[0])
  assert.deepEqual(pr.steps[0].payload, { key: 'A', value: 'B' }, 'the extra field never reaches the step')
})

test('TIER 1: a mapped halt is staged and its PR id comes back as the approvalId', async () => {
  const staged: StagePrInput[] = []
  const port = createPrEngineApprovalPort({
    stageInfrastructurePr: async (input) => { staged.push(input); return { ok: true, pr: { id: 'PR-9' } } },
    actions: MAPPED,
  })

  const result = await port.requestApproval(req('set_env', { key: 'A', value: 'B' }), DECISION)
  assert.equal(result.approvalId, 'PR-9')
  assert.equal(staged.length, 1)
})

test('TIER 2: an unmapped halt goes to the fallback holding pen, not nowhere', async () => {
  const staged: StagePrInput[] = []
  const penned: AgentRequest[] = []
  const fallback: ApprovalPort = {
    async requestApproval(r) { penned.push(r); return { approvalId: 'PEN-3' } },
  }

  const port = createPrEngineApprovalPort({
    stageInfrastructurePr: async (input) => { staged.push(input); return { ok: true, pr: { id: 'PR-9' } } },
    actions: MAPPED,
    fallback,
  })

  const result = await port.requestApproval(req('wireTransfer'), DECISION)
  assert.equal(result.approvalId, 'PEN-3')
  assert.equal(staged.length, 0, 'an untemplated action must never be staged as a cockpit PR')
  assert.equal(penned.length, 1)
})

test('an unmapped halt with no fallback reports an empty approvalId rather than inventing one', async () => {
  const port = createPrEngineApprovalPort({
    stageInfrastructurePr: async () => ({ ok: true, pr: { id: 'PR-9' } }),
    actions: MAPPED,
  })
  const result = await port.requestApproval(req('wireTransfer'), DECISION)
  assert.equal(result.approvalId, '')
})

test('a staging failure and a throwing store both yield an empty approvalId', async () => {
  const failing = createPrEngineApprovalPort({
    stageInfrastructurePr: async () => ({ ok: false, error: 'Unknown template' }),
    actions: MAPPED,
  })
  assert.equal((await failing.requestApproval(req('set_env'), DECISION)).approvalId, '')

  const throwing = createPrEngineApprovalPort({
    stageInfrastructurePr: async () => { throw new Error('db down') },
    actions: MAPPED,
  })
  assert.equal((await throwing.requestApproval(req('set_env'), DECISION)).approvalId, '')
})

test('a throwing FALLBACK also cannot crash the governance core', async () => {
  const port = createPrEngineApprovalPort({
    stageInfrastructurePr: async () => ({ ok: true, pr: { id: 'PR-9' } }),
    actions: MAPPED,
    fallback: { async requestApproval() { throw new Error('pen down') } },
  })
  assert.equal((await port.requestApproval(req('wireTransfer'), DECISION)).approvalId, '')
})

test('END TO END: with an empty allowlist every action halts and nothing executes', async () => {
  // This is the shipped posture — the pre-authorized envelope starts empty.
  const performed: AgentRequest[] = []
  const staged: StagePrInput[] = []

  const policy: GovernancePolicy = { classifier: defaultConsequenceClassifier, allowlist: [] }
  const host: GatewayHost = {
    execution: { async perform(r) { performed.push(r); return { ok: true } } },
    approvals: createPrEngineApprovalPort({
      stageInfrastructurePr: async (input) => { staged.push(input); return { ok: true, pr: { id: 'PR-1' } } },
      actions: MAPPED,
    }),
  }

  const outcome = await runGoverned(req('set_env', { key: 'A', value: 'B' }), policy, host)
  assert.equal(outcome.verdict, 'halt_for_approval')
  assert.equal(outcome.approvalId, 'PR-1')
  assert.equal(performed.length, 0, 'nothing runs unattended before a playbook is pre-authorized')
  assert.equal(staged.length, 1)
})
