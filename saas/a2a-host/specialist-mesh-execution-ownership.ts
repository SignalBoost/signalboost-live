import type { A2AAgentRegistryPort } from './a2a-agent-registry.ts'
import type { A2ADelegationInvocation, A2ADelegationResult } from './a2a-delegation-runtime.ts'
import { isRecoverableMeshDelegationFailure } from './specialist-mesh-router.ts'
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
import { ownershipIdentity, type CoordinationStore, type WorkItem } from '../lib/supervisor/coordination/index.ts'

export const SPECIALIST_MESH_EXECUTION_OWNERSHIP_VERSION = 'signalboost-specialist-mesh-execution-ownership-v1' as const

export interface SpecialistMeshExecutionCoordinationOptions {
  store: CoordinationStore
  environment: WorkItem['environment']
  policyVersion: string
  softwareVersion: string
  leaseDurationMs?: number
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

      // Coordination never creates authority. Invalid/unresolved and non-advisory work stays on the
      // canonical governed delegation path, which remains responsible for deny/approval semantics.
      if (!agent || !assignment || !skill || skill.risk !== 'advisory') {
        return input.delegation.invoke(invocation)
      }

      const meshTaskId = coordinationTaskId(invocation)
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

      const result = await input.delegation.invoke(invocation)
      await assertSpecialistMeshOwnership(input.coordination.store, meshTaskId, lease)

      if (result.ok) {
        await verifySpecialistMeshTask(input.coordination.store, meshTaskId, lease, executionId)
        await completeSpecialistMeshTask(input.coordination.store, meshTaskId, lease, executionId)
        return result
      }

      if (isRecoverableMeshDelegationFailure(result.mode)) {
        await input.coordination.store.releaseLease(ownershipIdentity(lease))
        return result
      }

      await input.coordination.store.transitionWorkItem({
        workItemId: `specialist-mesh:${meshTaskId}`,
        from: 'processing',
        to: 'failed',
        owner: ownershipIdentity(lease),
        executionId,
      })
      return result
    },
  })
}
