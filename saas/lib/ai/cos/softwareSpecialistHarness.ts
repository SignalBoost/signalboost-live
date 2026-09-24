// saas/lib/ai/cos/softwareSpecialistHarness.ts
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
  COS_PRIMARY_SOFTWARE_DELEGATION_CAPABILITY,
  COS_PRIMARY_SOFTWARE_DELEGATION_SCOPE,
} from '../../../platform-harness/adapters/cos-ingress.ts'

export const COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY = COS_PRIMARY_SOFTWARE_DELEGATION_CAPABILITY
const SOFTWARE_SPECIALIST_SCOPE = COS_PRIMARY_SOFTWARE_DELEGATION_SCOPE
const PRODUCTION_ENVIRONMENT_ID = 'signalboost-cloud'
const SOFTWARE_SPECIALIST_PORTABLE_ID = 'cos-software-specialist'

export type CosSoftwareSpecialistHarnessResult<T> =
  | Readonly<{ ok: true; value: T; runId: string }>
  | Readonly<{ ok: false; runId: string; code: string }>

function exactCapabilityResolver(input: {
  tenantId: string
  environmentId: string
}): HarnessCapabilityResolverPort {
  const descriptor = createPortableCapabilityDescriptor({
    capabilityId: COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY,
    providerId: 'native-cos-host',
    connectionId: 'native-cos-software-specialist',
    tenantId: input.tenantId,
    environmentId: input.environmentId,
    risk: 'write',
    availability: 'available',
    requiresApproval: false,
    scopes: [SOFTWARE_SPECIALIST_SCOPE],
  })

  return Object.freeze({
    async resolve(manifest) {
      const exactIdentity =
        manifest.identity.tenantId === input.tenantId
        && manifest.identity.portableId === SOFTWARE_SPECIALIST_PORTABLE_ID
        && manifest.environment.environmentId === input.environmentId
        && manifest.environment.class === 'production'
      const authorized = manifest.capabilities.some(capability =>
        capability.id === COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY
        && capability.environments.includes('production')
        && capability.scopes?.includes(SOFTWARE_SPECIALIST_SCOPE),
      )
      if (!exactIdentity || !authorized) {
        return Object.freeze({
          satisfied: false,
          resolved: Object.freeze({}),
          missing: Object.freeze([COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY]),
          reason: 'harness_software_specialist_exact_scope_required',
        })
      }
      return Object.freeze({
        satisfied: true,
        resolved: Object.freeze({
          [COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY]: descriptor,
        }),
        missing: Object.freeze([]),
      })
    },
  })
}

function softwareDelegationPolicy(): GovernancePolicy {
  return Object.freeze({
    environment: 'production',
    classifier: Object.freeze({
      classify(request) {
        return request.action.kind === 'delegate'
          && request.action.target === COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY
          ? 'reversible_internal'
          : 'unknown'
      },
    }),
    allowlist: Object.freeze([Object.freeze({
      actionKind: 'delegate',
      target: COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY,
      rollback: 'delegation has no direct Production deploy or merge authority; downstream software work remains isolated and independently governed',
    })]),
  })
}

function defaultEvidenceSink(): HarnessEvidenceSink | null {
  const db = cosServiceDb()
  return db ? createSupervisorAuditHarnessEvidenceSink(db as any) : null
}

/**
 * First mandatory Production Harness ingress for COS -> Software Specialist delegation.
 *
 * The Harness governs only the delegation admission. The delegated Builder/repository workload
 * retains its existing isolated job, repository, and owner-authority controls. This adapter does
 * not widen Production authority, mint approvals, or claim that the downstream job has completed.
 */
export async function runCosSoftwareSpecialistProductionHarness<T>(input: {
  objective: string
  tenantId: string
  execute: () => Promise<T>
  evidenceSink?: HarnessEvidenceSink
  runId?: string
  parentManifest?: HarnessManifest
}): Promise<CosSoftwareSpecialistHarnessResult<T>> {
  const tenantId = String(input.tenantId || '').trim()
  const objective = String(input.objective || '').trim()
  const runId = String(input.runId || crypto.randomUUID()).trim()
  if (!tenantId || !objective || !runId) {
    return Object.freeze({ ok: false, runId: runId || 'unbound', code: 'harness_software_specialist_identity_required' })
  }

  const evidenceSink = input.evidenceSink ?? defaultEvidenceSink()
  if (!evidenceSink) {
    return Object.freeze({ ok: false, runId, code: 'harness_evidence_sink_unavailable' })
  }

  const request = createProductionHarnessRequest({
    runId,
    objective,
    tenantId,
    portableId: SOFTWARE_SPECIALIST_PORTABLE_ID,
    agentId: 'cos-software-specialist',
    role: 'software_specialist',
    environmentId: PRODUCTION_ENVIRONMENT_ID,
    requestedCapabilities: [COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY],
    limits: {
      maxToolCalls: 1,
      maxConcurrency: 1,
      deadlineMs: 60_000,
    },
    ...(input.parentManifest
      ? {
          parent: {
            runId: input.parentManifest.runId,
            authorityManifestRef: input.parentManifest.authorityManifestRef,
          },
        }
      : {}),
  })

  let value!: T
  let invoked = false
  const host: GatewayHost = Object.freeze({
    execution: Object.freeze({
      async perform(agentRequest) {
        if (
          agentRequest.action.kind !== 'delegate'
          || agentRequest.action.target !== COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY
          || agentRequest.tenantId !== tenantId
        ) {
          return { ok: false, error: 'harness_software_specialist_host_scope_rejected' }
        }
        try {
          value = await input.execute()
          invoked = true
          return { ok: true, result: { delegated: true } }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error
              ? error.message.slice(0, 300)
              : 'software_specialist_delegation_failed',
          }
        }
      },
    }),
  })

  const envelope = await runProductionHarnessEnvelope({
    request,
    authority: Object.freeze({
      manifestRef: `host://cos-software-specialist/${runId}`,
      verified: true,
      verifiedBy: 'host',
      environments: Object.freeze(['production'] as const),
      capabilities: Object.freeze([Object.freeze({
        id: COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY,
        environments: Object.freeze(['production'] as const),
        mutating: true,
        risk: 'write' as const,
        scopes: Object.freeze([SOFTWARE_SPECIALIST_SCOPE]),
      })]),
      limits: Object.freeze({
        maxToolCalls: 1,
        maxConcurrency: 1,
        deadlineMs: 60_000,
      }),
    }),
    capabilities: exactCapabilityResolver({
      tenantId,
      environmentId: PRODUCTION_ENVIRONMENT_ID,
    }),
    executor: createGovernedHarnessExecutor({
      policy: softwareDelegationPolicy(),
      host,
    }),
    worker: Object.freeze({
      async run(context) {
        await context.execute({
          actionId: 'delegate-software-specialist',
          kind: 'delegate',
          capabilityId: COS_SOFTWARE_SPECIALIST_DELEGATION_CAPABILITY,
          params: Object.freeze({
            specialist: 'software',
            operation: 'delegate',
          }),
          compensation: Object.freeze({
            mode: 'delegated' as const,
            reason: 'the Software Specialist runs as its own governed child job; Builder/repository work keeps its own isolated rollback and owner authority',
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
          verifierRef: 'host://cos-software-specialist/delegation-verifier-v1',
          evidenceRefs: Object.freeze([`harness://${runId}/software-delegation`]),
          ...(executed
            ? {}
            : {
                reason: 'software_specialist_delegation_not_executed',
                failureAttribution: 'harness' as const,
              }),
        })
      },
    }),
    evidenceSink,
    ...(input.parentManifest ? { parentManifest: input.parentManifest } : {}),
  })

  if (envelope.accepted === false) {
    return Object.freeze({
      ok: false,
      runId,
      code: envelope.reasons[0] ?? 'software_specialist_harness_rejected',
    })
  }
  if (envelope.completed.evidence.outcomeStatus !== 'success' || !invoked) {
    return Object.freeze({
      ok: false,
      runId,
      code: envelope.completed.evidence.failureCode ?? 'software_specialist_harness_not_verified',
    })
  }

  return Object.freeze({ ok: true, value, runId })
}
