import assert from 'node:assert/strict'
import test from 'node:test'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createCOSSpecialistOrchestrator } from '../a2a-host/cos-specialist-orchestrator.ts'
import {
  createDurableSpecialistMeshDelegationPort,
  specialistMeshWorkerIdentity,
} from '../a2a-host/specialist-mesh-execution-ownership.ts'
import { InMemoryCoordinationStore } from '../lib/supervisor/coordination/index.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-marketing'

function registry(input?: { second?: boolean; risk?: 'advisory' | 'write' | 'consequential' }) {
  const risk = input?.risk ?? 'advisory'
  return createInMemoryA2AAgentRegistry({
    agents: [
      { agentId: 'marketing-a', displayName: 'Marketing A', description: 'Buyer specialist', transportRef: 'transport-a', enabled: true, advertisedSkillIds: ['marketing.research'] },
      ...(input?.second ? [{ agentId: 'marketing-b', displayName: 'Marketing B', description: 'Buyer specialist', transportRef: 'transport-b', enabled: true, advertisedSkillIds: ['marketing.research'] }] : []),
    ],
    assignments: [
      { assignmentId: 'assignment-a', agentId: 'marketing-a', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId: 'marketing.research', risk }] },
      ...(input?.second ? [{ assignmentId: 'assignment-b', agentId: 'marketing-b', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId: 'marketing.research', risk: 'advisory' as const }] }] : []),
    ],
  })
}

function qualifications(agentIds = ['marketing-a', 'marketing-b']) {
  return {
    async snapshot(input: { agentIds: readonly string[]; skillId: string }) {
      assert.equal(input.skillId, 'marketing.research')
      return Object.fromEntries(input.agentIds.map(agentId => [agentId,
        agentIds.includes(agentId)
          ? { qualified: true, evidenceRef: `db://university/qualification/${agentId}/marketing.research` }
          : { qualified: false, evidenceRef: `db://university/qualification/${agentId}/marketing.research` },
      ]))
    },
  }
}

function delegationSpy() {
  const calls: any[] = []
  return {
    calls,
    port: {
      async invoke(input: any) {
        calls.push(input)
        return { ok: true, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'delegated', data: { kind: 'task' } }
      },
    },
  }
}

test('real COS mesh orchestration transfers durable ownership and fences the stale worker', async () => {
  const store = new InMemoryCoordinationStore()
  const calls: any[] = []
  const baseDelegation = {
    async invoke(input: any) {
      calls.push(input)
      if (input.agentId === 'marketing-a') {
        return { ok: false, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'a2a_transport_unavailable', error: 'network unavailable' }
      }
      return { ok: true, agentId: input.agentId, skillId: input.skillId, risk: 'advisory' as const, mode: 'delegated', data: { kind: 'task' } }
    },
  }
  const meshRegistry = registry({ second: true })
  const delegation = createDurableSpecialistMeshDelegationPort({
    registry: meshRegistry,
    delegation: baseDelegation,
    coordination: {
      store,
      environment: 'production',
      policyVersion: 'test-policy-v1',
      softwareVersion: 'test-runtime-v1',
      leaseDurationMs: 60_000,
    },
  })
  const orchestrator = createCOSSpecialistOrchestrator({
    registry: meshRegistry,
    delegation,
    qualifications: qualifications(),
  })

  const result = await orchestrator.orchestrate({
    tenantId,
    environmentId,
    portableId,
    messageId: 'message-1',
    taskId: 'mesh-task-1',
    text: 'Research the market.',
    plan: { familyId: 'marketing', skillId: 'marketing.research' },
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls.map(call => call.agentId), ['marketing-a', 'marketing-b'])
  assert.deepEqual(result.meshAttemptedAgentIds, ['marketing-a', 'marketing-b'])
  assert.equal(calls[0]?.taskId, 'mesh-task-1')

  const scopedTaskId = `${tenantId}:${environmentId}:${portableId}:mesh-task-1`
  const workItemId = `specialist-mesh:${scopedTaskId}`
  const work = await store.getWorkItem(workItemId)
  assert.equal(work?.state, 'completed')
  assert.equal(work?.attempt, 2)
  assert.equal(work?.currentLease?.fencingToken, 2)
  assert.equal(work?.currentLease?.ownerInstanceId, `a2a-specialist:${tenantId}:${environmentId}:${portableId}:marketing-b`)

  const staleWorker = specialistMeshWorkerIdentity({
    tenantId, environmentId, portableId,
    agentId: 'marketing-a', skillId: 'marketing.research', messageId: 'message-1', text: 'Research the market.', taskId: 'mesh-task-1',
  }, 'transport-a')
  await assert.rejects(
    store.assertFence(workItemId, {
      leaseId: `lease-${workItemId}-1`,
      ownerInstanceId: staleWorker.instanceId,
      ownerRuntimeId: staleWorker.runtimeId,
      fencingToken: 1,
    }),
    (error: any) => error?.code === 'stale_owner_rejected',
  )
})

test('write work is not enrolled in automatic durable mesh takeover', async () => {
  const writeRegistry = createInMemoryA2AAgentRegistry({
    agents: [{ agentId: 'writer-a', displayName: 'Writer A', description: 'Buyer writer', transportRef: 'transport-write', enabled: true, advertisedSkillIds: ['sales.crm-write'] }],
    assignments: [{ assignmentId: 'write-a', agentId: 'writer-a', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId: 'sales.crm-write', risk: 'write' }] }],
  })
  const store = new InMemoryCoordinationStore()
  let called = 0
  const delegation = createDurableSpecialistMeshDelegationPort({
    registry: writeRegistry,
    delegation: {
      async invoke(input: any) {
        called += 1
        return { ok: false, agentId: input.agentId, skillId: input.skillId, risk: 'write' as const, mode: 'a2a_approval_required', error: 'approval required' }
      },
    },
    coordination: { store, environment: 'production', policyVersion: 'test-policy-v1', softwareVersion: 'test-runtime-v1' },
  })

  const result = await delegation.invoke({
    tenantId, environmentId, portableId,
    agentId: 'writer-a', skillId: 'sales.crm-write', messageId: 'write-message-1', text: 'Update CRM.', taskId: 'write-task-1',
  })
  assert.equal(result.ok, false)
  assert.equal(called, 1)
  assert.equal(await store.getWorkItem(`specialist-mesh:${tenantId}:${environmentId}:${portableId}:write-task-1`), undefined)
})
