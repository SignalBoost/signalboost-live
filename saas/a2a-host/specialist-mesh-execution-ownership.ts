import type { A2AAgentRegistryPort, A2ADelegationRisk } from './a2a-agent-registry.ts'
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
  SPECIALIST_MESH_WRITE_FAILOVER_SAFE_MODE,
  SPECIALIST_MESH_WRITE_RECONCILED_APPLIED_MODE,
  SpecialistMeshWriteRecoveryError,
  normalizeSpecialistMeshIdempotencyKey,
  normalizeSpecialistMeshWriteReconciliation,
  specialistMeshWriteOperationKey,
  specialistMeshWriteRecoveryEnvelope,
  type SpecialistMeshWriteOwner,
  type SpecialistMeshWriteProviderRequest,
  type SpecialistMeshWriteRecoveryProviderRegistry,
  type SpecialistMeshWriteRecoveryStore,
  type SpecialistMeshWriteRisk,
  type SpecialistMeshWriteScope,
} from './specialist-mesh-write-recovery.ts'
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

export const SPECIALIST_MESH_EXECUTION_OWNERSHIP_VERSION = 'signalboost-specialist-mesh-execution-ownership-v3' as const

export interface SpecialistMeshWriteRecoveryOptions {
  providers: SpecialistMeshWriteRecoveryProviderRegistry
  store: SpecialistMeshWriteRecoveryStore
}

export interface SpecialistMeshExecutionCoordinationOptions {
  store: CoordinationStore
  environment: WorkItem['environment']
  policyVersion: string
  softwareVersion: string
  leaseDurationMs?: number
  checkpoints?: SpecialistMeshCheckpointStore
  checkpointTtlMs?: number
  writeRecovery?: SpecialistMeshWriteRecoveryOptions
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

function writeScope(invocation: A2ADelegationInvocation, meshTaskId: string, risk: SpecialistMeshWriteRisk): SpecialistMeshWriteScope {
  return Object.freeze({
    tenantId: required(invocation.tenantId, 'tenantId'),
    environmentId: required(invocation.environmentId, 'environmentId'),
    portableId: required(invocation.portableId, 'portableId'),
    taskId: meshTaskId,
    skillId: required(invocation.skillId, 'skillId'),
    workItemId: `specialist-mesh:${meshTaskId}`,
    risk,
  })
}

function writeOwner(lease: Lease, agentId: string): SpecialistMeshWriteOwner {
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

function writeRecoveryFailure(invocation: A2ADelegationInvocation, risk: SpecialistMeshWriteRisk, error: unknown): A2ADelegationResult {
  const code = error instanceof SpecialistMeshWriteRecoveryError ? error.code : 'write_recovery_unavailable'
  const message = error instanceof Error ? error.message : 'specialist mesh write recovery failed'
  return Object.freeze({
    ok: false,
    agentId: invocation.agentId,
    skillId: invocation.skillId,
    risk,
    mode: `a2a_${code}`,
    error: message,
  })
}

async function failOwnedWork(store: CoordinationStore, input: {
  workItemId: string
  lease: Lease
  executionId: string
}): Promise<void> {
  await store.transitionWorkItem({
    workItemId: input.workItemId,
    from: 'processing',
    to: 'failed',
    owner: ownershipIdentity(input.lease),
    executionId: input.executionId,
  }).catch(() => undefined)
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
 * Adds durable Supervisor ownership to real specialist orchestration without changing A2A authority.
 * Advisory tasks support bounded checkpoint/resume. Write/consequential tasks enter the durable mesh
 * only when an exact provider recovery adapter exists and approval is already present. Automatic
 * non-advisory takeover is emitted only after that provider durably proves `not_applied`.
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

      // Coordination state never creates authority. Invalid/unresolved work stays on the canonical
      // governed delegation path, which owns deny/approval semantics.
      if (!agent || !assignment || !skill) return input.delegation.invoke(invocation)

      const meshTaskId = coordinationTaskId(invocation)
      const workItemId = `specialist-mesh:${meshTaskId}`
      const worker = specialistMeshWorkerIdentity(invocation, agent.transportRef)
      const executionId = invocation.traceId || invocation.messageId

      if (skill.risk !== 'advisory') {
        const risk = skill.risk as SpecialistMeshWriteRisk
        // Never create recovery semantics around an unapproved mutation. The canonical runtime blocks it.
        if (!invocation.approval || !input.coordination.writeRecovery) return input.delegation.invoke(invocation)

        const scope = writeScope(invocation, meshTaskId, risk)
        const operationKey = specialistMeshWriteOperationKey(scope)
        const providerRequest: SpecialistMeshWriteProviderRequest = Object.freeze({
          ...scope,
          operationKey,
          agentId: invocation.agentId,
          transportRef: agent.transportRef,
        })

        let provider
        try {
          provider = input.coordination.writeRecovery.providers.resolve(providerRequest)
        } catch (error) {
          return writeRecoveryFailure(invocation, risk, error)
        }
        // No exact provider contract means no automatic write takeover; preserve legacy single-attempt behavior.
        if (!provider) return input.delegation.invoke(invocation)

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
        const owner = writeOwner(lease, invocation.agentId)

        let idempotencyKey: string
        try {
          await assertSpecialistMeshOwnership(input.coordination.store, meshTaskId, lease)
          idempotencyKey = normalizeSpecialistMeshIdempotencyKey(await provider.idempotencyKey(providerRequest))
          await input.coordination.writeRecovery.store.prepare({
            ...scope,
            owner,
            operationKey,
            providerId: provider.providerId,
            idempotencyKey,
          })
        } catch (error) {
          await failOwnedWork(input.coordination.store, { workItemId, lease, executionId })
          return writeRecoveryFailure(invocation, risk, error)
        }

        const delegatedInvocation = Object.freeze({
          ...invocation,
          meshWriteRecovery: specialistMeshWriteRecoveryEnvelope({
            operationKey,
            providerId: provider.providerId,
            idempotencyKey,
          }),
        })
        const result = await input.delegation.invoke(delegatedInvocation)
        await assertSpecialistMeshOwnership(input.coordination.store, meshTaskId, lease)

        const mustReconcile = result.ok || isRecoverableMeshDelegationFailure(result.mode)
        if (!mustReconcile) {
          await failOwnedWork(input.coordination.store, { workItemId, lease, executionId })
          return result
        }

        let reconciliation
        try {
          reconciliation = normalizeSpecialistMeshWriteReconciliation(await provider.reconcile({
            ...providerRequest,
            idempotencyKey,
            result,
          }))
          await assertSpecialistMeshOwnership(input.coordination.store, meshTaskId, lease)
          await input.coordination.writeRecovery.store.record({
            ...scope,
            owner,
            operationKey,
            providerId: provider.providerId,
            idempotencyKey,
            outcome: reconciliation.outcome,
            evidenceRef: reconciliation.evidenceRef,
            providerOperationRef: reconciliation.providerOperationRef,
          })
        } catch (error) {
          // Reconciliation failure is itself ambiguous. Never release the lease for another writer.
          await failOwnedWork(input.coordination.store, { workItemId, lease, executionId })
          return writeRecoveryFailure(invocation, risk, error)
        }

        if (reconciliation.outcome === 'applied') {
          await verifySpecialistMeshTask(input.coordination.store, meshTaskId, lease, executionId)
          await completeSpecialistMeshTask(input.coordination.store, meshTaskId, lease, executionId)
          if (result.ok) return result
          return Object.freeze({
            ok: true,
            agentId: invocation.agentId,
            skillId: invocation.skillId,
            risk,
            mode: SPECIALIST_MESH_WRITE_RECONCILED_APPLIED_MODE,
            data: reconciliation.data ?? Object.freeze({
              signalboostWriteRecovery: Object.freeze({
                providerId: provider.providerId,
                evidenceRef: reconciliation.evidenceRef,
                ...(reconciliation.providerOperationRef ? { providerOperationRef: reconciliation.providerOperationRef } : {}),
              }),
            }),
          })
        }

        if (reconciliation.outcome === 'not_applied') {
          if (result.ok) {
            await failOwnedWork(input.coordination.store, { workItemId, lease, executionId })
            return Object.freeze({
              ok: false,
              agentId: invocation.agentId,
              skillId: invocation.skillId,
              risk,
              mode: 'a2a_write_reconciliation_conflict',
              error: 'specialist reported success but provider proof says the side effect was not applied',
            })
          }
          await input.coordination.store.releaseLease(ownershipIdentity(lease))
          return Object.freeze({
            ...result,
            mode: SPECIALIST_MESH_WRITE_FAILOVER_SAFE_MODE,
            error: 'provider reconciliation proved the prior side effect was not applied; next eligible specialist may take over',
          })
        }

        await failOwnedWork(input.coordination.store, { workItemId, lease, executionId })
        return Object.freeze({
          ok: false,
          agentId: invocation.agentId,
          skillId: invocation.skillId,
          risk,
          mode: 'a2a_write_outcome_ambiguous',
          error: 'provider reconciliation could not prove whether the side effect was applied; automatic takeover is blocked',
        })
      }

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
