import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createInMemoryA2AAgentRegistry } from '../a2a-host/a2a-agent-registry.ts'
import { createA2ADelegationRuntime } from '../a2a-host/a2a-delegation-runtime.ts'
import { createCOSSpecialistOrchestrator } from '../a2a-host/cos-specialist-orchestrator.ts'
import {
  createInMemorySpecialistMeshCheckpointStore,
  normalizeSpecialistMeshCheckpointState,
} from '../a2a-host/specialist-mesh-checkpoint.ts'
import { createDurableSpecialistMeshDelegationPort } from '../a2a-host/specialist-mesh-execution-ownership.ts'
import { InMemoryCoordinationStore } from '../lib/supervisor/coordination/index.ts'

const tenantId = 'tenant-a'
const environmentId = 'prod'
const portableId = 'portable-marketing'
const skillId = 'marketing.research'

function meshRegistry() {
  return createInMemoryA2AAgentRegistry({
    agents: [
      { agentId: 'marketing-a', displayName: 'Marketing A', description: 'Buyer specialist', transportRef: 'transport-a', enabled: true, advertisedSkillIds: [skillId] },
      { agentId: 'marketing-b', displayName: 'Marketing B', description: 'Buyer specialist', transportRef: 'transport-b', enabled: true, advertisedSkillIds: [skillId] },
    ],
    assignments: [
      { assignmentId: 'assignment-a', agentId: 'marketing-a', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId, risk: 'advisory' }] },
      { assignmentId: 'assignment-b', agentId: 'marketing-b', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId, risk: 'advisory' }] },
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

test('qualified advisory specialist can yield a bounded checkpoint and the next fenced owner resumes it', async () => {
  const registry = meshRegistry()
  const coordinationStore = new InMemoryCoordinationStore()
  const checkpoints = createInMemorySpecialistMeshCheckpointStore()
  const calls: any[] = []

  const delegation = createDurableSpecialistMeshDelegationPort({
    registry,
    coordination: {
      store: coordinationStore,
      checkpoints,
      environment: 'production',
      policyVersion: 'test-policy-v1',
      softwareVersion: 'test-runtime-v1',
      leaseDurationMs: 60_000,
    },
    delegation: {
      async invoke(input: any) {
        calls.push(input)
        if (input.agentId === 'marketing-a') {
          assert.equal(input.meshResume, undefined)
          return {
            ok: true,
            agentId: input.agentId,
            skillId: input.skillId,
            risk: 'advisory' as const,
            mode: 'delegated',
            data: {
              signalboostMeshCheckpoint: {
                version: '1',
                state: { completedSteps: ['market-size'], cursor: 1 },
              },
              signalboostMeshHandoff: true,
            },
          }
        }
        assert.equal(input.meshResume?.schemaVersion, 'signalboost-specialist-mesh-checkpoint-v1')
        assert.equal(input.meshResume?.sourceAgentId, 'marketing-a')
        assert.equal(input.meshResume?.sourceFencingToken, 1)
        assert.deepEqual(input.meshResume?.state, { completedSteps: ['market-size'], cursor: 1 })
        return {
          ok: true,
          agentId: input.agentId,
          skillId: input.skillId,
          risk: 'advisory' as const,
          mode: 'delegated',
          data: { kind: 'task', text: 'completed from checkpoint' },
        }
      },
    },
  })

  const orchestrator = createCOSSpecialistOrchestrator({ registry, delegation, qualifications })
  const result = await orchestrator.orchestrate({
    tenantId,
    environmentId,
    portableId,
    messageId: 'message-checkpoint-1',
    taskId: 'task-checkpoint-1',
    text: 'Research the market in bounded stages.',
    plan: { familyId: 'marketing', skillId },
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls.map(call => call.agentId), ['marketing-a', 'marketing-b'])
  assert.deepEqual(result.meshAttemptedAgentIds, ['marketing-a', 'marketing-b'])
  const scopedTaskId = `${tenantId}:${environmentId}:${portableId}:task-checkpoint-1`
  const work = await coordinationStore.getWorkItem(`specialist-mesh:${scopedTaskId}`)
  assert.equal(work?.state, 'completed')
  assert.equal(work?.attempt, 2)
  assert.equal(work?.currentLease?.fencingToken, 2)
})

test('delegation runtime places host-owned mesh resume state in A2A message metadata without changing authority', async () => {
  const registry = createInMemoryA2AAgentRegistry({
    agents: [{ agentId: 'marketing-a', displayName: 'Marketing A', description: 'Buyer specialist', transportRef: 'transport-a', enabled: true, advertisedSkillIds: [skillId] }],
    assignments: [{ assignmentId: 'assignment-a', agentId: 'marketing-a', tenantId, environmentId, portableId, enabled: true, allowedSkills: [{ skillId, risk: 'advisory' }] }],
  })
  let capturedMetadata: any
  const runtime = createA2ADelegationRuntime({
    registry,
    transportFactory: {
      create() {
        return {
          async send(input: any) {
            capturedMetadata = input.request?.params?.message?.metadata
            return {
              jsonrpc: '2.0',
              id: input.request.id,
              result: { kind: 'task', id: 'task-remote-1', status: { state: 'completed' } },
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
    agentId: 'marketing-a',
    skillId,
    messageId: 'message-resume-metadata',
    text: 'Continue the research.',
    meshResume: {
      schemaVersion: 'signalboost-specialist-mesh-checkpoint-v1',
      checkpointKey: 'checkpoint-1',
      sourceAgentId: 'marketing-b',
      sourceFencingToken: 3,
      createdAt: '2026-09-13T00:00:00.000Z',
      expiresAt: '2026-09-13T00:15:00.000Z',
      state: { cursor: 4 },
    },
  })

  assert.equal(result.ok, true)
  assert.equal(capturedMetadata.signalboostSkillId, skillId)
  assert.equal(capturedMetadata.signalboostRisk, 'advisory')
  const meshResume = JSON.parse(capturedMetadata.signalboostMeshResume)
  assert.equal(meshResume.checkpointKey, 'checkpoint-1')
  assert.deepEqual(meshResume.state, { cursor: 4 })
})

test('checkpoint state is bounded and rejects credential-shaped keys', () => {
  assert.throws(
    () => normalizeSpecialistMeshCheckpointState({ apiToken: 'not-allowed' }),
    (error: any) => error?.code === 'checkpoint_state_unsafe',
  )
  assert.throws(
    () => normalizeSpecialistMeshCheckpointState({ text: 'x'.repeat(70_000) }),
    (error: any) => error?.code === 'checkpoint_state_too_large',
  )
})

test('production checkpoint RPCs lock the exact Supervisor lease before fence validation and mutation', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260913004500_specialist_mesh_advisory_checkpoints.sql', import.meta.url),
    'utf8',
  )
  const names = [
    'a2a_specialist_mesh_checkpoint_save',
    'a2a_specialist_mesh_checkpoint_load',
    'a2a_specialist_mesh_checkpoint_clear',
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