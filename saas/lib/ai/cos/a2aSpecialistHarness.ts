// saas/lib/ai/cos/a2aSpecialistHarness.ts
import { AsyncLocalStorage } from 'node:async_hooks'
import {
  createProductionHarnessRequest,
  runProductionHarnessEnvelope,
} from '../../../platform-harness/adapters/production.ts'
import type { HarnessCapabilityResolverPort } from '../../../platform-harness/capabilities/resolver.ts'
import type { HarnessEvidenceSink } from '../../../platform-harness/evidence/durable-evidence.ts'
import { createGovernedHarnessExecutor } from '../../../platform-harness/runtime/governed-executor.ts'
import { createSupervisorAuditHarnessEvidenceSink } from '../../../platform-harness/evidence/supervisor-audit-sink.ts'
import { createPortableCapabilityDescriptor } from '../../../provider-hub-core/capability-runtime.ts'
import { cosServiceDb } from '../../cos-core/storage/service-db.ts'
import type { GatewayHost, GovernancePolicy } from '../../../agent-gateway/types.ts'
import type { HarnessManifest } from '../../../platform-harness/core/types.ts'
import {
  COS_PRIMARY_A2A_SPECIALIST_DELEGATION_CAPABILITY,
  COS_PRIMARY_A2A_SPECIALIST_DELEGATION_SCOPE,
  createCosProductionIngressManifest,
  currentCosHarnessIngress,
} from '../../../platform-harness/adapters/cos-ingress.ts'

export const COS_A2A_SPECIALIST_DELEGATION_CAPABILITY = COS_PRIMARY_A2A_SPECIALIST_DELEGATION_CAPABILITY
export const COS_A2A_SPECIALIST_AGENT_ID = 'cos-a2a-specialist'
const A2A_SPECIALIST_SCOPE = COS_PRIMARY_A2A_SPECIALIST_DELEGATION_SCOPE
const A2A_SPECIALIST_DEADLINE_MS = 285_000

export type CosA2ASpecialistHarnessScope = Readonly<{
  tenantId: string
  environmentId: string
  portableId: string
}>

export type CosA2ASpecialistHarnessContext = Readonly<{
  runId: string
  parentRunId: string
  tenantId: string
  environmentId: string
  portableId: string
  enteredAt: number
}>

export type CosA2ASpecialistHarnessResult<T> =
  | Readonly<{ ok: true; value: T; runId: string }>
  | Readonly<{ ok: false; runId: string; code: string }>

const a2aSpecialistIngressScope = new AsyncLocalStorage<CosA2ASpecialistHarnessContext>()

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function exactScope(scope: CosA2ASpecialistHarnessScope | null | undefined): CosA2ASpecialistHarnessScope | null {
  const tenantId = clean(scope?.tenantId, 240)
  const environmentId = clean(scope?.environmentId, 240)
  const portableId = clean(scope?.portableId, 240)
  if (!tenantId || !environmentId || !portableId) return null
  if ([tenantId, environmentId, portableId].includes('*')) return null
  return Object.freeze({ tenantId, environmentId, portableId })
}

function exactCapabilityResolver(scope: CosA2ASpecialistHarnessScope): HarnessCapabilityResolverPort {
  const descriptor = createPortableCapabilityDescriptor({
    capabilityId: COS_A2A_SPECIALIST_DELEGATION_CAPABILITY,
    providerId: 'native-cos-host',
    connectionId: 'native-cos-a2a-specialist',
    tenantId: scope.tenantId,
    environmentId: scope.environmentId,
    risk: 'write',
    availability: 'available',
    requiresApproval: false,
    scopes: [A2A_SPECIALIST_SCOPE],
  })

  return Object.freeze({
    async resolve(manifest) {
      const exactIdentity =
        manifest.identity.tenantId === scope.tenantId
        && manifest.identity.portableId === scope.portableId
        && manifest.identity.agentId === COS_A2A_SPECIALIST_AGENT_ID
        && manifest.environment.environmentId === scope.environmentId
        && manifest.environment.class === 'production'
      const authorized = manifest.capabilities.some(capability =>
        capability.id === COS_A2A_SPECIALIST_DELEGATION_CAPABILITY
        && capability.environments.includes('production')
        && capability.scopes?.includes(A2A_SPECIALIST_SCOPE),
      )
      if (!exactIdentity || !authorized) {
        return Object.freeze({
          satisfied: false,
          resolved: Object.freeze({}),
          missing: Object.freeze([COS_A2A_SPECIALIST_DELEGATION_CAPABILITY]),
          reason: 'harness_a2a_specialist_exact_scope_required',
        })
      }
      return Object.freeze({
        satisfied: true,
        resolved: Object.freeze({
          [COS_A2A_SPECIALIST_DELEGATION_CAPABILITY]: descriptor,
        }),
        missing: Object.freeze([]),
      })
    },
  })
}

function a2aDelegationPolicy(): GovernancePolicy {
  return Object.freeze({
    environment: 'production',
    classifier: Object.freeze({
      classify(request) {
        return request.action.kind === 'delegate'
          && request.action.target === COS_A2A_SPECIALIST_DELEGATION_CAPABILITY
          ? 'reversible_internal'
          : 'unknown'
      },
    }),
    allowlist: Object.freeze([Object.freeze({
      actionKind: 'delegate',
      target: COS_A2A_SPECIALIST_DELEGATION_CAPABILITY,
      rollback: 'delegation admission grants no downstream authority; the A2A runtime keeps its own qualification, approval, checkpoint and write-recovery controls',
    })]),
  })
}

function defaultEvidenceSink(): HarnessEvidenceSink | null {
  const db = cosServiceDb()
  return db ? createSupervisorAuditHarnessEvidenceSink(db as any) : null
}

/** The active A2A specialist HarnessRun, or null outside its ingress scope. */
export function currentCosA2ASpecialistHarnessIngress(): CosA2ASpecialistHarnessContext | null {
  return a2aSpecialistIngressScope.getStore() ?? null
}

/**
 * Fail closed when A2A specialist orchestration is attempted without the mandatory Production HarnessRun.
 */
export function requireCosA2ASpecialistHarnessIngress(): CosA2ASpecialistHarnessContext {
  const context = a2aSpecialistIngressScope.getStore()
  if (!context) throw new Error('a2a_specialist_harness_ingress_required')
  return context
}

/**
 * Mandatory Production Harness ingress for COS -> A2A specialist delegation.
 *
 * The run is always a governed child of a COS parent run: it may not add a capability, widen
 * scope/risk/mutation, escape the parent tenant/profile/environment class, or loosen a hard limit.
 *
 * The Harness governs delegation admission under the exact tenant/environment/portable scope.
 * The delegated specialist mesh keeps its own qualification, approval, checkpoint and
 * write-recovery controls. This adapter does not mint approvals or widen downstream authority.
 */
export async function runCosA2ASpecialistProductionHarness<T>(input: {
  objective: string
  scope: CosA2ASpecialistHarnessScope
  execute: () => Promise<T>
  evidenceSink?: HarnessEvidenceSink
  runId?: string
  parentManifest?: HarnessManifest
}): Promise<CosA2ASpecialistHarnessResult<T>> {
  const runId = clean(input.runId, 160) || `cos-a2a-${crypto.randomUUID()}`
  const objective = clean(input.objective, 4_000)
  const scope = exactScope(input.scope)
  if (!scope || !objective) {
    return Object.freeze({ ok: false, runId, code: 'harness_a2a_specialist_identity_required' })
  }

  // Every A2A delegation is a child of a COS parent run. Use the caller's parent, else the active
  // COS ingress run, else establish a bounded COS parent granting only this delegation capability.
  let parentManifest: HarnessManifest
  try {
    parentManifest = input.parentManifest
      ?? currentCosHarnessIngress()?.manifest
      ?? createCosProductionIngressManifest({
        objective,
        tenantId: scope.tenantId,
        requestedCapabilities: [COS_A2A_SPECIALIST_DELEGATION_CAPABILITY],
      })
  } catch {
    return Object.freeze({ ok: false, runId, code: 'harness_a2a_specialist_parent_unavailable' })
  }

  const evidenceSink = input.evidenceSink ?? defaultEvidenceSink()
  if (!evidenceSink) {
    return Object.freeze({ ok: false, runId, code: 'harness_evidence_sink_unavailable' })
  }

  const limits = Object.freeze({
    maxToolCalls: 1,
    maxConcurrency: 1,
    deadlineMs: A2A_SPECIALIST_DEADLINE_MS,
  })

  const request = createProductionHarnessRequest({
    runId,
    objective,
    tenantId: scope.tenantId,
    portableId: scope.portableId,
    agentId: COS_A2A_SPECIALIST_AGENT_ID,
    role: 'a2a_specialist_delegation',
    environmentId: scope.environmentId,
    requestedCapabilities: [COS_A2A_SPECIALIST_DELEGATION_CAPABILITY],
    limits,
    parent: {
      runId: parentManifest.runId,
      authorityManifestRef: parentManifest.authorityManifestRef,
    },
  })

  let value!: T
  let invoked = false
  const host: GatewayHost = Object.freeze({
    execution: Object.freeze({
      async perform(agentRequest) {
        if (
          agentRequest.action.kind !== 'delegate'
          || agentRequest.action.target !== COS_A2A_SPECIALIST_DELEGATION_CAPABILITY
          || agentRequest.tenantId !== scope.tenantId
        ) {
          return { ok: false, error: 'harness_a2a_specialist_host_scope_rejected' }
        }
        try {
          value = await a2aSpecialistIngressScope.run(
            Object.freeze({ runId, parentRunId: parentManifest.runId, ...scope, enteredAt: Date.now() }),
            input.execute,
          )
          invoked = true
          return { ok: true, result: { delegated: true } }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error
              ? error.message.slice(0, 300)
              : 'a2a_specialist_delegation_failed',
          }
        }
      },
    }),
  })

  const envelope = await runProductionHarnessEnvelope({
    request,
    authority: Object.freeze({
      manifestRef: `host://cos-a2a-specialist/${runId}`,
      verified: true,
      verifiedBy: 'host',
      environments: Object.freeze(['production'] as const),
      capabilities: Object.freeze([Object.freeze({
        id: COS_A2A_SPECIALIST_DELEGATION_CAPABILITY,
        environments: Object.freeze(['production'] as const),
        mutating: true,
        risk: 'write' as const,
        scopes: Object.freeze([A2A_SPECIALIST_SCOPE]),
      })]),
      limits,
    }),
    capabilities: exactCapabilityResolver(scope),
    executor: createGovernedHarnessExecutor({
      policy: a2aDelegationPolicy(),
      host,
    }),
    worker: Object.freeze({
      async run(context) {
        await context.execute({
          actionId: 'delegate-a2a-specialist',
          kind: 'delegate',
          capabilityId: COS_A2A_SPECIALIST_DELEGATION_CAPABILITY,
          params: Object.freeze({
            specialist: 'a2a',
            operation: 'delegate',
          }),
          compensation: Object.freeze({
            mode: 'delegated' as const,
            reason: 'the A2A specialist runs as a governed child run; the mesh keeps its own checkpoint and write-recovery controls',
          }),
        })
      },
    }),
    verifier: Object.freeze({
      async verify(verificationInput) {
        const executed = verificationInput.actionResults.length === 1
          && verificationInput.actionResults[0]?.status === 'executed'
          && invoked
        return Object.freeze({
          verified: executed,
          verifierRef: 'host://cos-a2a-specialist/delegation-verifier-v1',
          evidenceRefs: Object.freeze([`harness://${runId}/a2a-specialist-delegation`]),
          ...(executed
            ? {}
            : {
                reason: 'a2a_specialist_delegation_not_executed',
                failureAttribution: 'harness' as const,
              }),
        })
      },
    }),
    evidenceSink,
    parentManifest,
  })

  if (envelope.accepted === false) {
    return Object.freeze({
      ok: false,
      runId,
      code: envelope.reasons[0] ?? 'a2a_specialist_harness_rejected',
    })
  }
  if (envelope.completed.evidence.outcomeStatus !== 'success' || !invoked) {
    return Object.freeze({
      ok: false,
      runId,
      code: envelope.completed.evidence.failureCode ?? 'a2a_specialist_harness_not_verified',
    })
  }

  return Object.freeze({ ok: true, value, runId })
}
