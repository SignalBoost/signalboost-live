import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createA2ADelegationRuntime } from '../a2a-host/a2a-delegation-runtime.ts'
import { createCOSSpecialistOrchestrator } from '../a2a-host/cos-specialist-orchestrator.ts'
import { createDurableSpecialistMeshDelegationPort } from '../a2a-host/specialist-mesh-execution-ownership.ts'
import {
  createInMemorySpecialistMeshWriteRecoveryStore,
  createSpecialistMeshWriteRecoveryProviderRegistry,
  SPECIALIST_MESH_WRITE_RECONCILED_APPLIED_MODE,
} from '../a2a-host/specialist-mesh-write-recovery.ts'
import { InMemoryCoordinationStore } from '../lib/supervisor/coordination/index.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-marketing'
const skillId = 'marketing.publish'

function meshRegistry() {
  return createInMemoryA2AAgentRegistry({
    agents: [
      { agentId: 'publisher-a', displayName: 'Publisher A', description: 'Buyer specialist', transportRef: 'provider-a-transport', enabled: true, advertisedSkillIds: [skillId] },
      { agentId: 'publisher-b', displayName: 'Publisher B', description: 'Buyer specialist', transportRef: 'provider-b-transport', enabled: true, advertisedSkillIds: [skillId] },
    ],
    assignments: [
      { assignmentId: 'assignment-a', agentId: 'publisher-a', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId, risk: 'write' }] },
      { assignmentId: 'assignment-b', agentId: 'publisher-b', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId, risk: 'write' }] },
    ],
  })
}

const qualifications = {
  async snapshot(input: { agentIds: readonly string[] }) {
    return Object.fromEntries(input.agentIds.map(agentId => [agentId, {
      qualified: true,
      evidenceRef: `db://qualification/${agentId}/${skillId}`,
    }]))
  },
}

const approval = Object.freeze({
  approvalId: 'approval-write-1',
  approvedBy: 'owner-1',
  approvedAt: '2026-09-13T05:30:00.000Z',
})

function providerRegistry(outcomes: Record<string, 'applied' | 'not_applied' | 'unknown'>) {
  return createSpecialistMeshWriteRecoveryProviderRegistry([
    {
      providerId: 'provider-a',
      matches(input) { return input.transportRef === 'provider-a-transport' },
      idempotencyKey(input) { return `provider-a:${input.operationKey}` },
      async reconcile(input) {
        const outcome = outcomes['provider-a'] ?? 'unknown'
        return {
          outcome,
          evidenceRef: `db://provider-a/reconciliation/${encodeURIComponent(input.operationKey)}/${outcome}`,
          providerOperationRef: `provider-a-op:${input.operationKey}`,
          ...(outcome === 'applied' ? { data: { kind: 'task', text: 'provider A already applied the write' } } : {}),
        } as const
      },
    },
    {
      providerId: 'provider-b',
      matches(input) { return input.transportRef === 'provider-b-transport' },
      idempotencyKey(input) { return `provider-b:${input.operationKey}` },
      async reconcile(input) {
        const outcome = outcomes['provider-b'] ?? 'unknown'
        return {
          outcome,
          evidenceRef: `db://provider-b/reconciliation/${encodeURIComponent(input.operationKey)}/${outcome}`,
          providerOperationRef: `provider-b-op:${input.operationKey}`,
          ...(outcome === 'applied' ? { data: { kind: 'task', text: 'provider B applied the write' } } : {}),
        } as const
      },
    },
  ])
}

test('provider registry preserves class prototype methods', async () => {
  class PrototypeProvider {
    readonly providerId = 'prototype-provider'
    matches(input: any) { return input.transportRef === 'prototype-transport' }
    idempotencyKey(input: any) { return `prototype:${input.operationKey}` }
    async reconcile(input: any) {
      return {
        outcome: 'not_applied' as const,
        evidenceRef: `db://prototype/${encodeURIComponent(input.operationKey)}/not-applied`,
      }
    }
  }

  const registry = createSpecialistMeshWriteRecoveryProviderRegistry([new PrototypeProvider()])
  const request = {
    tenantId,
    environmentId,
    portableId,
    taskId: 'task-prototype-provider',
    skillId,
    workItemId: 'specialist-mesh:task-prototype-provider',
    risk: 'write' as const,
    operationKey: 'operation-prototype-provider',
    agentId: 'publisher-a',
    transportRef: 'prototype-transport',
  }
  const provider = registry.resolve(request)
  assert.ok(provider)
  const idempotencyKey = await provider.idempotencyKey(request)
  assert.equal(idempotencyKey, 'prototype:operation-prototype-provider')
  const reconciliation = await provider.reconcile({
    ...request,
    idempotencyKey,
    result: { ok: false, agentId: 'publisher-a', skillId, risk: 'write', mode: 'a2a_transport_unavailable', error: 'timeout' },
  })
  assert.equal(reconciliation.outcome, 'not_applied')
})

function writeMesh(input: {
  outcomes: Record<string, 'applied' | 'not_applied' | 'unknown'>
  delegate: (invocation: any) => Promise<any>
  providers?: ReturnType<typeof providerRegistry>
}) {
  const registry = meshRegistry()
  const coordinationStore = new InMemoryCoordinationStore()
  const recoveryStore = createInMemorySpecialistMeshWriteRecoveryStore()
  const delegation = createDurableSpecialistMeshDelegationPort({
    registry,
    coordination: {
      store: coordinationStore,
      environment: 'production',
      policyVersion: 'test-policy-v1',
      softwareVersion: 'test-runtime-v1',
      writeRecovery: {
        providers: input.providers ?? providerRegistry(input.outcomes),
        store: recoveryStore,
      },
    },
    delegation: { invoke: input.delegate },
  })
  return {
    coordinationStore,
    orchestrator: createCOSSpecialistOrchestrator({ registry, delegation, qualifications }),
  }
}

async function orchestrate(orchestrator: ReturnType<typeof createCOSSpecialistOrchestrator>, taskId: string) {
  return orchestrator.orchestrate({
    tenantId,
    environmentId,
    portableId,
    messageId: `message-${taskId}`,
    taskId,
    text: 'Publish the approved organic content.',
    approval,
    plan: { familyId: 'marketing', skillId },
  })
}

test('write timeout fails over only after provider proves not_applied, then completes with durable applied proof', async () => {
  const calls: any[] = []
  const mesh = writeMesh({
    outcomes: { 'provider-a': 'not_applied', 'provider-b': 'applied' },
    async delegate(invocation) {
      calls.push(invocation)
      assert.equal(invocation.meshWriteRecovery?.schemaVersion, 'signalboost-specialist-mesh-write-recovery-v1')
      if (invocation.agentId === 'publisher-a') {
        return { ok: false, agentId: invocation.agentId, skillId, risk: 'write', mode: 'a2a_transport_unavailable', error: 'a2a_http_timeout' }
      }
      return { ok: true, agentId: invocation.agentId, skillId, risk: 'write', mode: 'delegated', data: { kind: 'task', id: 'published-1' } }
    },
  })

  const result = await orchestrate(mesh.orchestrator, 'task-write-failover-1')
  assert.equal(result.ok, true)
  assert.deepEqual(calls.map(call => call.agentId), ['publisher-a', 'publisher-b'])
  assert.deepEqual(result.meshAttemptedAgentIds, ['publisher-a', 'publisher-b'])
  assert.equal(calls[0].meshWriteRecovery.providerId, 'provider-a')
  assert.equal(calls[1].meshWriteRecovery.providerId, 'provider-b')

  const scopedTaskId = `${tenantId}:${environmentId}:${portableId}:task-write-failover-1`
  const work = await mesh.coordinationStore.getWorkItem(`specialist-mesh:${scopedTaskId}`)
  assert.equal(work?.state, 'completed')
  assert.equal(work?.attempt, 2)
  assert.equal(work?.currentLease?.fencingToken, 2)
})

test('provider proof that the timed-out write was applied completes recovery without replay', async () => {
  const calls: any[] = []
  const mesh = writeMesh({
    outcomes: { 'provider-a': 'applied', 'provider-b': 'applied' },
    async delegate(invocation) {
      calls.push(invocation)
      return { ok: false, agentId: invocation.agentId, skillId, risk: 'write', mode: 'a2a_transport_unavailable', error: 'a2a_http_timeout' }
    },
  })

  const result = await orchestrate(mesh.orchestrator, 'task-write-applied-1')
  assert.equal(result.ok, true)
  assert.equal(result.mode, SPECIALIST_MESH_WRITE_RECONCILED_APPLIED_MODE)
  assert.deepEqual(calls.map(call => call.agentId), ['publisher-a'])
  assert.deepEqual(result.meshAttemptedAgentIds, ['publisher-a'])
})

test('unknown provider outcome fails closed and never reaches the next writer', async () => {
  const calls: any[] = []
  const mesh = writeMesh({
    outcomes: { 'provider-a': 'unknown', 'provider-b': 'applied' },
    async delegate(invocation) {
      calls.push(invocation)
      return { ok: false, agentId: invocation.agentId, skillId, risk: 'write', mode: 'a2a_transport_unavailable', error: 'a2a_http_timeout' }
    },
  })

  const result = await orchestrate(mesh.orchestrator, 'task-write-unknown-1')
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'a2a_write_outcome_ambiguous')
  assert.deepEqual(calls.map(call => call.agentId), ['publisher-a'])
  assert.deepEqual(result.meshAttemptedAgentIds, ['publisher-a'])
})

test('missing provider contract preserves single-attempt write behavior', async () => {
  const calls: any[] = []
  const providers = createSpecialistMeshWriteRecoveryProviderRegistry([])
  const mesh = writeMesh({
    outcomes: {},
    providers,
    async delegate(invocation) {
      calls.push(invocation)
      assert.equal(invocation.meshWriteRecovery, undefined)
      return { ok: false, agentId: invocation.agentId, skillId, risk: 'write', mode: 'a2a_transport_unavailable', error: 'a2a_http_timeout' }
    },
  })

  const result = await orchestrate(mesh.orchestrator, 'task-write-no-contract-1')
  assert.equal(result.ok, false)
  assert.equal(result.mode, 'a2a_transport_unavailable')
  assert.deepEqual(calls.map(call => call.agentId), ['publisher-a'])
})

test('delegation runtime transports the host idempotency envelope only for approved non-advisory work', async () => {
  const registry = createInMemoryA2AAgentRegistry({
    agents: [{ agentId: 'publisher-a', displayName: 'Publisher A', description: 'Buyer specialist', transportRef: 'provider-a-transport', enabled: true, advertisedSkillIds: [skillId] }],
    assignments: [{ assignmentId: 'assignment-a', agentId: 'publisher-a', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId, risk: 'write' }] }],
  })
  let metadata: any
  const runtime = createA2ADelegationRuntime({
    registry,
    transportFactory: {
      create() {
        return {
          async send(input: any) {
            metadata = input.request.params.message.metadata
            return {
              jsonrpc: '2.0',
              id: input.request.id,
              result: { kind: 'task', id: 'remote-write-1', status: { state: 'completed' } },
            }
          },
        }
      },
    },
  })

  const result = await runtime.invoke({
    tenantId,
    environmentId,
    portableId,
    agentId: 'publisher-a',
    skillId,
    messageId: 'message-runtime-write-1',
    text: 'Publish approved content.',
    approval,
    meshWriteRecovery: {
      schemaVersion: 'signalboost-specialist-mesh-write-recovery-v1',
      operationKey: 'operation-1',
      providerId: 'provider-a',
      idempotencyKey: 'idem-operation-1',
    },
  })

  assert.equal(result.ok, true)
  const envelope = JSON.parse(metadata.signalboostMeshWriteRecovery)
  assert.equal(envelope.operationKey, 'operation-1')
  assert.equal(envelope.providerId, 'provider-a')
  assert.equal(envelope.idempotencyKey, 'idem-operation-1')
})

test('production write recovery RPCs lock the exact Supervisor lease before fence validation and proof mutation', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260913061500_specialist_mesh_write_recovery.sql', import.meta.url),
    'utf8',
  )
  const names = [
    'a2a_specialist_mesh_write_recovery_prepare',
    'a2a_specialist_mesh_write_recovery_record',
  ]

  for (const name of names) {
    const marker = `create or replace function public.${name}(`
    const start = sql.indexOf(marker)
    assert.ok(start >= 0, `${name} must exist`)
    const next = sql.indexOf('create or replace function public.', start + marker.length)
    const body = sql.slice(start, next >= 0 ? next : sql.length)
    const leaseTable = body.indexOf('from public.supervisor_leases')
    const exactWork = body.indexOf('work_item_id = p_work_item_id', leaseTable)
    const exactLease = body.indexOf('lease_id = p_lease_id', exactWork)
    const rowLock = body.indexOf('for update;', exactLease)
    const fence = body.indexOf('public.supervisor_assert_fence', rowLock)

    assert.ok(leaseTable >= 0, `${name} must use the canonical Supervisor lease table`)
    assert.ok(exactWork > leaseTable, `${name} must lock the exact work-item lease`)
    assert.ok(exactLease > exactWork, `${name} must lock the exact lease id`)
    assert.ok(rowLock > exactLease, `${name} must hold FOR UPDATE before validating the fence`)
    assert.ok(fence > rowLock, `${name} must validate the fence only after the lease row is locked`)
  }
})
