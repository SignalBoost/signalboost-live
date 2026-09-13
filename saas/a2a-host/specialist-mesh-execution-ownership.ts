import type { A2AAgentRegistryPort } from './a2a-agent-registry.ts'
import type { A2ADelegationInvocation, A2ADelegationResult, A2AMeshResumeCheckpoint } from './a2a-delegation-runtime.ts'
import { isRecoverableMeshDelegationFailure } from './specialist-mesh-router.ts'
import {
  SpecialistMeshCheckpointError,
  readSpecialistMeshCheckpointSignal,
  type SpecialistMeshCheckpointOwner,
  type SpecialistMeshCheckpointRecord,
  type SpecialistMeshCheckpointScope,
  type SpecialistMeshCheckpointStore,
} from './specialist-mesh-checkpoint.ts'
import {
  assertSpecialistMeshOwnership,
  claimSpecialistMeshTask,
  completeSpecialistMeshTask,
  ensureSpecialistMeshTask,
  registerSpecialistMeshWorker,
  startSpecialistMeshTask,
  verifySpecialistMeshTask,
  type SpecialistMeshWorker,
} from './specialist-mesh-coordination.ts'
import { ownershipIdentity, type CoordinationStore, type Lease, type WorkItem } from '../lib/supervisor/coordination/index.ts'

export const SPECIALIST_MESH_EXECUTION_OWNERSHIP_VERSION = 'signalboost-specialist-mesh-execution-ownership-v2' as const

export interface SpecialistMeshExecutionCoordinationOptions {
  store: CoordinationStore
  environment: WorkItem['environment']
  policyVersion: string
  softwareVersion: string
  leaseDurationMs?: number
  checkpoints?: SpecialistMeshCheckpointStore
  checkpointTtlMs?: number
}

export interface SpecialistMeshDelegationPort {
  invoke(input: A2ADelegationInvocation): Promise<A2ADelegationResult>
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*') throw new Error(`specialist mesh execution ${name} is required`)
  return normalized
}

function coordinationTaskId(input: A2ADelegationInvocation): string {
  const externalTaskId = input.taskId ? required(input.taskId, 'taskId') : `message:${required(input.messageId, 'messageId')}`
  return [
    required(input.tenantId, 'tenantId'),
    required(input.environmentId, 'environmentId'),
    required(input.portableId, 'portableId'),
    externalTaskId,
  ].join(':')
}

function checkpointScope(invocation: A2ADelegationInvocation, meshTaskId: string): SpecialistMeshCheckpointScope {
  return Object.freeze({
    tenantId: required(invocation.tenantId, 'tenantId'),
    environmentId: required(invocation.environmentId, 'environmentId'),
    portableId: required(invocation.portableId, 'portableId'),
    taskId: meshTaskId,
    skillId: required(invocation.skillId, 'skillId'),
    workItemId: `specialist-mesh:${meshTaskId}`,
  })
}

function checkpointOwner(lease: Lease, agentId: string): SpecialistMeshCheckpointOwner {
  return Object.freeze({ ...ownershipIdentity(lease), agentId: required(agentId, 'agentId') })
}

function resumeEnvelope(record: SpecialistMeshCheckpointRecord): A2AMeshResumeCheckpoint {
  return Object.freeze({
    schemaVersion: 'signalboost-specialist-mesh-checkpoint-v1',
    checkpointKey: record.checkpointKey,
    sourceAgentId: record.sourceAgentId,
    sourceFencingToken: record.sourceFencingToken,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    state: record.state,
  })
}

function checkpointFailure(invocation: A2ADelegationInvocation, error: unknown): A2ADelegationResult {
  const code = error instanceof SpecialistMeshCheckpointError ? error.code : 'checkpoint_store_unavailable'
  const message = error instanceof Error ? error.message : 'specialist mesh checkpoint failed'
  return Object.freeze({
    ok: false,
    agentId: invocation.agentId,
    skillId: invocation.skillId,
    risk: 'advisory' as const,
    mode: `a2a_${code}`,
    error: message,
  })
}

export function specialistMeshWorkerIdentity(input: A2ADelegationInvocation, transportRef: string): SpecialistMeshWorker {
  const tenantId = required(input.tenantId, 'tenantId')
  const environmentId = required(input.environmentId, 'environmentId')
  const portableId = required(input.portableId, 'portableId')
  const agentId = required(input.agentId, 'agentId')
  return Object.freeze({
    agentId,
    instanceId: `a2a-specialist:${tenantId}:${environmentId}:${portableId}:${agentId}`,
    runtimeId: `transport:${required(transportRef, 'transportRef')}`,
  })
}

/**
 * Adds durable Supervisor ownership to the real specialist orchestration attempt without changing
 * A2A authority. Registry assignment + qualification remain upstream hard gates; this layer only
 * fences an already-selected advisory worker. Write/consequential work is never auto-replayed here.
 *
 * Advisory checkpoints are host-owned efficiency state only. A specialist can cooperatively yield a
 * bounded checkpoint; a replacement may receive it only after acquiring a newer valid Supervisor fence.
 */
export function createDurableSpecialistMeshDelegationPort(input: {
  registry: A2AAgentRegistryPort
  delegation: SpecialistMeshDelegationPort
  coordination: SpecialistMeshExecutionCoordinationOptions
}): SpecialistMeshDelegationPort {
  return Object.freeze({
    async invoke(invocation: A2ADelegationInvocation): Promise<A2ADelegationResult> {
      const snapshot = await input.registry.snapshot()
      const agent = snapshot.agents.find(item => item.enabled && item.agentId === invocation.agentId)
      const assignment = snapshot.assignments.find(item =>
        item.enabled && item.agentId === invocation.agentId &&
        item.tenantId === invocation.tenantId && item.environmentId === invocation.environmentId &&
        item.portableId === invocation.portableId,
      )
      const skill = assignment?.allowedSkills.find(item => item.skillId === invocation.skillId)

      // Coordination/checkpoint state never creates authority. Invalid/unresolved and non-advisory work
      // stays on the canonical governed delegation path, which owns deny/approval semantics.
      if (!agent || !assignment || !skill || skill.risk !== 'advisory') {
        return input.delegation.invoke(invocation)
      }

      const meshTaskId = coordinationTaskId(invocation)
      const workItemId = `specialist-mesh:${meshTaskId}`
      const worker = specialistMeshWorkerIdentity(invocation, agent.transportRef)
      const executionId = invocation.traceId || invocation.messageId

      await ensureSpecialistMeshTask(input.coordination.store, {
        taskId: meshTaskId,
        tenantId: invocation.tenantId,
        environment: input.coordination.environment,
        policyVersion: input.coordination.policyVersion,
      })
      await registerSpecialistMeshWorker(input.coordination.store, worker, {
        softwareVersion: input.coordination.softwareVersion,
      })
      const lease = await claimSpecialistMeshTask(input.coordination.store, {
        taskId: meshTaskId,
        worker,
        eligibleAgentIds: [invocation.agentId],
        leaseDurationMs: input.coordination.leaseDurationMs,
      })
      await startSpecialistMeshTask(input.coordination.store, meshTaskId, lease, executionId)

      const scope = checkpointScope(invocation, meshTaskId)
      const owner = checkpointOwner(lease, invocation.agentId)
      let delegatedInvocation = invocation
      if (input.coordination.checkpoints) {
        try {
          await assertSpecialistMeshOwnership(input.coordination.store, meshTaskId, lease)
          const prior = await input.coordination.checkpoints.load({ ...scope, owner })
          if (prior) delegatedInvocation = Object.freeze({ ...invocation, meshResume: resumeEnvelope(prior) })
        } catch (error) {
          await input.coordination.store.transitionWorkItem({
            workItemId, from: 'processing', to: 'failed', owner: ownershipIdentity(lease), executionId,
          })
          return checkpointFailure(invocation, error)
        }
      }

      const result = await input.delegation.invoke(delegatedInvocation)
      await assertSpecialistMeshOwnership(input.coordination.store, meshTaskId, lease)

      let checkpointSignal
      try {
        checkpointSignal = readSpecialistMeshCheckpointSignal(result.data)
      } catch (error) {
        await input.coordination.store.transitionWorkItem({
          workItemId, from: 'processing', to: 'failed', owner: ownershipIdentity(lease), executionId,
        })
        return checkpointFailure(invocation, error)
      }

      if (checkpointSignal?.handoff) {
        if (!input.coordination.checkpoints) {
          await input.coordination.store.transitionWorkItem({
            workItemId, from: 'processing', to: 'failed', owner: ownershipIdentity(lease), executionId,
          })
          return Object.freeze({
            ok: false,
            agentId: invocation.agentId,
            skillId: invocation.skillId,
            risk: 'advisory' as const,
            mode: 'a2a_checkpoint_store_unavailable',
            error: 'specialist requested checkpoint handoff but no host checkpoint store is configured',
          })
        }
        try {
          await assertSpecialistMeshOwnership(input.coordination.store, meshTaskId, lease)
          await input.coordination.checkpoints.save({
            ...scope,
            owner,
            state: checkpointSignal.state,
            ttlMs: checkpointSignal.ttlMs ?? input.coordination.checkpointTtlMs,
          })
          await input.coordination.store.releaseLease(ownershipIdentity(lease))
        } catch (error) {
          await input.coordination.store.transitionWorkItem({
            workItemId, from: 'processing', to: 'failed', owner: ownershipIdentity(lease), executionId,
          }).catch(() => undefined)
          return checkpointFailure(invocation, error)
        }
        return Object.freeze({
          ok: false,
          agentId: invocation.agentId,
          skillId: invocation.skillId,
          risk: 'advisory' as const,
          data: result.data,
          mode: 'a2a_checkpoint_handoff',
          error: 'specialist yielded a bounded checkpoint for the next eligible worker',
        })
      }

      if (result.ok) {
        if (input.coordination.checkpoints) {
          await input.coordination.checkpoints.clear({ ...scope, owner }).catch(() => undefined)
        }
        await verifySpecialistMeshTask(input.coordination.store, meshTaskId, lease, executionId)
        await completeSpecialistMeshTask(input.coordination.store, meshTaskId, lease, executionId)
        return result
      }

      if (isRecoverableMeshDelegationFailure(result.mode)) {
        if (checkpointSignal && input.coordination.checkpoints) {
          try {
            await assertSpecialistMeshOwnership(input.coordination.store, meshTaskId, lease)
            await input.coordination.checkpoints.save({
              ...scope,
              owner,
              state: checkpointSignal.state,
              ttlMs: checkpointSignal.ttlMs ?? input.coordination.checkpointTtlMs,
            })
          } catch (error) {
            await input.coordination.store.transitionWorkItem({
              workItemId, from: 'processing', to: 'failed', owner: ownershipIdentity(lease), executionId,
            }).catch(() => undefined)
            return checkpointFailure(invocation, error)
          }
        }
        await input.coordination.store.releaseLease(ownershipIdentity(lease))
        return result
      }

      await input.coordination.store.transitionWorkItem({
        workItemId,
        from: 'processing',
        to: 'failed',
        owner: ownershipIdentity(lease),
        executionId,
      })
      return result
    },
  })
}