// saas/tests/platformHarnessCompensation.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveHarnessManifest } from '../platform-harness/core/policy.ts'
import { createProductionHarnessRequest } from '../platform-harness/adapters/production.ts'
import { runHarnessWorker, harnessCompensationContractViolation } from '../platform-harness/runtime/runner.ts'
import { createHarnessEvidenceRecord } from '../platform-harness/evidence/durable-evidence.ts'
import { createSupervisorAuditHarnessEvidenceSink } from '../platform-harness/evidence/supervisor-audit-sink.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'
import type { GovernedHarnessExecutor, HarnessAction } from '../platform-harness/runtime/governed-executor.ts'

function manifest(input: { environmentClass?: 'production' | 'sandbox'; risk?: 'write' | 'consequential' } = {}): HarnessManifest {
  const environmentClass = input.environmentClass ?? 'production'
  const request = {
    ...createProductionHarnessRequest({
      runId: `compensation-${environmentClass}-${input.risk ?? 'write'}`,
      objective: 'compensation contract test',
      tenantId: 'tenant-test',
      portableId: 'portable-test',
      agentId: 'agent-test',
      role: 'worker',
      environmentId: 'env-test',
      requestedCapabilities: ['store.write', 'store.read'],
      limits: { maxToolCalls: 10, deadlineMs: 60_000, maxConcurrency: 1 },
    }),
    ...(environmentClass === 'sandbox'
      ? { profile: 'sandbox' as const, environment: { environmentId: 'env-test', class: 'sandbox' as const } }
      : {}),
  }
  const decision = resolveHarnessManifest(request, {
    manifestRef: 'host://compensation-test',
    verified: true,
    verifiedBy: 'host',
    environments: [environmentClass],
    capabilities: [
      { id: 'store.write', environments: [environmentClass], mutating: true, risk: input.risk ?? 'write' },
      { id: 'store.read', environments: [environmentClass], mutating: false, risk: 'read' },
    ],
    limits: { maxToolCalls: 10, deadlineMs: 60_000, maxConcurrency: 1 },
  })
  assert.equal(decision.allowed, true)
  if (decision.allowed === false) throw new Error(decision.reasons.join(','))
  return decision.manifest
}

const capabilities = {
  async resolve(m: HarnessManifest) {
    return {
      satisfied: true,
      resolved: Object.fromEntries(m.capabilities.map(c => [c.id, { capabilityId: c.id } as any])),
      missing: [],
    }
  },
}

function executor(executed: string[]): GovernedHarnessExecutor {
  return {
    async execute(_m, action) {
      executed.push(action.actionId)
      return { actionId: action.actionId, capabilityId: action.capabilityId, status: 'executed' }
    },
  }
}

const verifier = (verified: boolean) => ({
  async verify() {
    return verified
      ? { verified: true, verifierRef: 'verifier://test', evidenceRefs: ['ev://ok'] }
      : { verified: false, verifierRef: 'verifier://test', evidenceRefs: [], reason: 'not_verified', failureAttribution: 'competency' as const }
  },
})

function compensable(actionId: string, undone: string[], ok = true): HarnessAction {
  return {
    actionId,
    kind: 'write',
    capabilityId: 'store.write',
    compensation: {
      mode: 'compensate',
      compensationId: `undo-${actionId}`,
      async run() {
        undone.push(actionId)
        return ok ? { ok: true, evidenceRefs: [`undo://${actionId}`] } : { ok: false, error: 'undo_failed' }
      },
    },
  }
}

test('production mutating action without a compensation contract never executes', async () => {
  const executed: string[] = []
  const result = await runHarnessWorker({
    manifest: manifest(),
    capabilities,
    executor: executor(executed),
    verifier: verifier(true),
    worker: { async run(ctx) { await ctx.execute({ actionId: 'w1', kind: 'write', capabilityId: 'store.write' }) } },
  })
  assert.deepEqual(executed, [])
  assert.equal(result.outcome.status, 'harness_failure')
  assert.equal(result.outcome.failureCode, 'harness_compensation_contract_required')
})

test('read-only production actions need no compensation contract', async () => {
  const executed: string[] = []
  const result = await runHarnessWorker({
    manifest: manifest(),
    capabilities,
    executor: executor(executed),
    verifier: verifier(true),
    worker: { async run(ctx) { await ctx.execute({ actionId: 'r1', kind: 'read', capabilityId: 'store.read' }) } },
  })
  assert.deepEqual(executed, ['r1'])
  assert.equal(result.outcome.status, 'success')
  assert.equal(result.compensation, undefined)
})

test('irreversible actions require consequential authority and precondition evidence', () => {
  const action: HarnessAction = {
    actionId: 'i1', kind: 'send', capabilityId: 'store.write',
    compensation: { mode: 'irreversible', reason: 'external email cannot be unsent' },
  }
  assert.equal(harnessCompensationContractViolation(manifest(), action), 'harness_irreversible_action_requires_consequential_grant')
  assert.equal(
    harnessCompensationContractViolation(manifest({ risk: 'consequential' }), action),
    'harness_consequential_precondition_evidence_required',
  )
  assert.equal(
    harnessCompensationContractViolation(manifest({ risk: 'consequential' }), {
      ...action,
      preconditionEvidenceRefs: ['evidence://precondition/recipient-confirmed'],
    }),
    null,
  )
})

test('sandbox mutation is not bound by the Production compensation contract', () => {
  const action: HarnessAction = { actionId: 's1', kind: 'write', capabilityId: 'store.write' }
  assert.equal(harnessCompensationContractViolation(manifest({ environmentClass: 'sandbox' }), action), null)
})

test('failed verification undoes executed actions in reverse order and records the saga', async () => {
  const executed: string[] = []
  const undone: string[] = []
  const m = manifest()
  const result = await runHarnessWorker({
    manifest: m,
    capabilities,
    executor: executor(executed),
    verifier: verifier(false),
    worker: {
      async run(ctx) {
        await ctx.execute(compensable('a1', undone))
        await ctx.execute(compensable('a2', undone))
      },
    },
  })
  assert.deepEqual(executed, ['a1', 'a2'])
  assert.deepEqual(undone, ['a2', 'a1'])
  assert.notEqual(result.outcome.status, 'success')
  assert.deepEqual(result.compensation, { status: 'completed', attempted: 2, completed: 2, failedActionIds: [] })
  const rollbacks = result.trajectory.filter(event => event.kind === 'rollback')
  assert.equal(rollbacks.length, 2)
  const record = createHarnessEvidenceRecord(m, result)
  assert.equal(record.compensationStatus, 'completed')
  assert.equal(record.compensationCompleted, 2)
  assert.ok(record.trajectoryEvidenceRefs.includes('undo://a1'))
})

test('a failing compensation is reported as partial, never as clean rollback', async () => {
  const undone: string[] = []
  const result = await runHarnessWorker({
    manifest: manifest(),
    capabilities,
    executor: executor([]),
    verifier: verifier(false),
    worker: {
      async run(ctx) {
        await ctx.execute(compensable('ok1', undone))
        await ctx.execute(compensable('bad1', undone, false))
      },
    },
  })
  assert.equal(result.compensation?.status, 'partial')
  assert.deepEqual(result.compensation?.failedActionIds, ['bad1'])
})

test('worker crash after a mutation still compensates', async () => {
  const undone: string[] = []
  const result = await runHarnessWorker({
    manifest: manifest(),
    capabilities,
    executor: executor([]),
    verifier: verifier(true),
    worker: {
      async run(ctx) {
        await ctx.execute(compensable('c1', undone))
        throw new Error('worker_crashed')
      },
    },
  })
  assert.equal(result.outcome.status, 'harness_failure')
  assert.deepEqual(undone, ['c1'])
  assert.equal(result.compensation?.status, 'completed')
})

test('verified success never runs compensation', async () => {
  const undone: string[] = []
  const result = await runHarnessWorker({
    manifest: manifest(),
    capabilities,
    executor: executor([]),
    verifier: verifier(true),
    worker: { async run(ctx) { await ctx.execute(compensable('s1', undone)) } },
  })
  assert.equal(result.outcome.status, 'success')
  assert.deepEqual(undone, [])
  assert.equal(result.compensation, undefined)
})

test('durable supervisor evidence keeps parent lineage and compensation outcome', async () => {
  const rows: any[] = []
  const sink = createSupervisorAuditHarnessEvidenceSink({
    from() { return { async insert(value: unknown) { rows.push(value); return { error: null } } } },
  })
  await sink.append({
    runId: 'child-1', profile: 'production', environmentClass: 'production', agentId: 'agent-test',
    authorityManifestRef: 'host://child', parentRunId: 'parent-1', parentAuthorityManifestRef: 'host://parent',
    outcomeStatus: 'agent_failure', authorityExpanded: false, productionMutationObserved: true,
    compensationStatus: 'completed', compensationAttempted: 1, compensationCompleted: 1,
    trajectoryEvidenceRefs: [],
  })
  assert.equal(rows[0].payload.parentRunId, 'parent-1')
  assert.equal(rows[0].payload.parentAuthorityManifestRef, 'host://parent')
  assert.equal(rows[0].payload.compensationStatus, 'completed')
})


test('failed verification after an irreversible consequential action requires manual recovery', async () => {
  const m = manifest({ risk: 'consequential' })
  const result = await runHarnessWorker({
    manifest: m,
    capabilities,
    executor: {
      async execute(_manifest, action) {
        return {
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'executed',
          evidenceRefs: ['evidence://action/send-receipt'],
        }
      },
    },
    verifier: verifier(false),
    worker: {
      async run(ctx) {
        await ctx.execute({
          actionId: 'send-1',
          kind: 'send',
          capabilityId: 'store.write',
          preconditionEvidenceRefs: ['evidence://precondition/recipient-confirmed'],
          compensation: { mode: 'irreversible', reason: 'external message cannot be recalled safely' },
        })
      },
    },
  })

  assert.equal(result.outcome.status, 'harness_failure')
  assert.equal(result.outcome.failureCode, 'harness_manual_recovery_required')
  assert.equal(result.compensation?.status, 'manual_recovery_required')
  assert.deepEqual(result.compensation?.manualRecoveryActionIds, ['send-1'])
  assert.ok(result.trajectory.some(event => event.kind === 'escalation'))
  const durable = createHarnessEvidenceRecord(m, result)
  assert.ok(durable.trajectoryEvidenceRefs.includes('evidence://precondition/recipient-confirmed'))
  assert.ok(durable.trajectoryEvidenceRefs.includes('evidence://action/send-receipt'))
})

test('consequential execution without action evidence fails closed and enters recovery', async () => {
  const undone: string[] = []
  const m = manifest({ risk: 'consequential' })
  const result = await runHarnessWorker({
    manifest: m,
    capabilities,
    executor: executor([]),
    verifier: verifier(true),
    worker: {
      async run(ctx) {
        await ctx.execute({
          ...compensable('missing-action-evidence', undone),
          preconditionEvidenceRefs: ['evidence://precondition/ready'],
        })
      },
    },
  })

  assert.equal(result.outcome.status, 'harness_failure')
  assert.equal(result.outcome.failureCode, 'harness_consequential_action_evidence_required')
  assert.deepEqual(undone, ['missing-action-evidence'])
  assert.equal(result.compensation?.status, 'completed')
})

test('run usage records the hard-limit envelope without persisting worker content', async () => {
  const result = await runHarnessWorker({
    manifest: manifest(),
    capabilities,
    executor: executor([]),
    verifier: verifier(true),
    costBudget: undefined,
    worker: { async run(ctx) { await ctx.execute({ actionId: 'r-usage', kind: 'read', capabilityId: 'store.read' }) } },
  })
  assert.equal(result.outcome.status, 'success')
  assert.equal(result.usage?.toolCalls, 1)
  assert.equal(result.usage?.maxConcurrentObserved, 1)
  assert.equal(result.usage?.reservedCostUsd, 0)
  assert.ok(result.usage?.deadlineAt)
  const durable = createHarnessEvidenceRecord(manifest(), result)
  assert.equal(durable.usage?.toolCalls, 1)
  assert.equal(JSON.stringify(durable).includes('compensation contract test'), false)
})
