// saas/lib/builder/job-harness.ts
//
// Durable Builder execution is asynchronous, so it cannot inherit the browser turn's expiring
// HarnessRun. Every claimed Builder slice receives its own host-verified Production HarnessRun.
// The Harness governs admission, deadline, durable evidence and terminal-state verification while
// the mature Builder controller retains its narrower workspace/repository authority controls.

import { createPortableCapabilityDescriptor } from '../../provider-hub-core/capability-runtime.ts'
import type { GatewayHost, GovernancePolicy } from '../../agent-gateway/types.ts'
import {
  createProductionHarnessRequest,
  runProductionHarnessEnvelope,
} from '../../platform-harness/adapters/production.ts'
import type { HarnessCapabilityResolverPort } from '../../platform-harness/capabilities/resolver.ts'
import { createGovernedHarnessExecutor } from '../../platform-harness/runtime/governed-executor.ts'
import { createSupervisorAuditHarnessEvidenceSink } from '../../platform-harness/evidence/supervisor-audit-sink.ts'
import { cosServiceDb } from '../cos-core/storage/service-db.ts'
import { getBuilderJobForUser } from './job-store.ts'

export const BUILDER_JOB_HARNESS_CAPABILITY = 'agent.builder.job.execute'
const BUILDER_JOB_HARNESS_SCOPE = 'builder.job.execute'
const BUILDER_JOB_HARNESS_DEADLINE_MS = 290_000

function resolver(input: { userId: string; environmentId: string }): HarnessCapabilityResolverPort {
  const descriptor = createPortableCapabilityDescriptor({
    capabilityId: BUILDER_JOB_HARNESS_CAPABILITY,
    providerId: 'native-builder-host',
    connectionId: 'native-builder-job-runtime',
    tenantId: input.userId,
    environmentId: input.environmentId,
    risk: 'write',
    availability: 'available',
    requiresApproval: false,
    scopes: [BUILDER_JOB_HARNESS_SCOPE],
  })
  return Object.freeze({
    async resolve(manifest) {
      const valid = manifest.identity.tenantId === input.userId
        && manifest.identity.agentId === 'cos-builder-job'
        && manifest.environment.environmentId === input.environmentId
        && manifest.environment.class === 'production'
        && manifest.capabilities.some(grant =>
          grant.id === BUILDER_JOB_HARNESS_CAPABILITY
          && grant.mutating
          && grant.scopes?.includes(BUILDER_JOB_HARNESS_SCOPE),
        )
      return valid
        ? Object.freeze({
            satisfied: true,
            resolved: Object.freeze({ [BUILDER_JOB_HARNESS_CAPABILITY]: descriptor }),
            missing: Object.freeze([]),
          })
        : Object.freeze({
            satisfied: false,
            resolved: Object.freeze({}),
            missing: Object.freeze([BUILDER_JOB_HARNESS_CAPABILITY]),
            reason: 'builder_job_harness_scope_invalid',
          })
    },
  })
}

function policy(): GovernancePolicy {
  return Object.freeze({
    environment: 'production',
    classifier: Object.freeze({
      classify(request) {
        return request.action.kind === 'delegate'
          && request.action.target === BUILDER_JOB_HARNESS_CAPABILITY
          ? 'reversible_internal'
          : 'unknown'
      },
    }),
    allowlist: Object.freeze([Object.freeze({
      actionKind: 'delegate',
      target: BUILDER_JOB_HARNESS_CAPABILITY,
      rollback: 'Builder durable execution remains generation-fenced; workspace work is isolated and repository repair retains its dedicated snapshot/merge-watch recovery controls.',
    })]),
  })
}

function infrastructureFailure(error: string | null): boolean {
  return /(?:capacity|network|timeout|runpod|vercel|supabase|storage|infrastructure|provider|worker_lost)/i.test(error || '')
}

export async function runBuilderJobProductionHarness(input: {
  jobId: string
  userId: string
  execute: (signal?: AbortSignal) => Promise<void>
}): Promise<{ ok: boolean; runId: string; code?: string }> {
  const jobId = String(input.jobId || '').trim()
  const userId = String(input.userId || '').trim()
  const runId = `builder-job-${jobId}-${crypto.randomUUID()}`
  if (!jobId || !userId) return { ok: false, runId, code: 'builder_job_harness_identity_required' }

  const db = cosServiceDb()
  if (!db) return { ok: false, runId, code: 'harness_evidence_sink_unavailable' }
  const environmentId = 'signalboost-builder-production'
  const limits = Object.freeze({
    maxToolCalls: 1,
    maxConcurrency: 1,
    deadlineMs: BUILDER_JOB_HARNESS_DEADLINE_MS,
  })
  const request = createProductionHarnessRequest({
    runId,
    objective: `Execute one bounded durable Builder job slice for job ${jobId}.`,
    tenantId: userId,
    portableId: 'cos-builder',
    agentId: 'cos-builder-job',
    role: 'builder',
    environmentId,
    requestedCapabilities: [BUILDER_JOB_HARNESS_CAPABILITY],
    limits,
  })

  let invoked = false
  const host: GatewayHost = Object.freeze({
    execution: Object.freeze({
      async perform(agentRequest, control) {
        if (
          agentRequest.action.kind !== 'delegate'
          || agentRequest.action.target !== BUILDER_JOB_HARNESS_CAPABILITY
          || agentRequest.tenantId !== userId
          || String(agentRequest.action.params?.jobId || '') !== jobId
        ) return { ok: false, error: 'builder_job_harness_host_scope_rejected' }
        if (control?.signal?.aborted) return { ok: false, error: 'builder_job_harness_aborted' }
        try {
          invoked = true
          await input.execute(control?.signal)
          return {
            ok: true,
            result: { jobId },
            evidenceRefs: [`builder-job://${jobId}/execution-returned`],
          }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message.slice(0, 300) : 'builder_job_execution_failed',
          }
        }
      },
    }),
  })

  const envelope = await runProductionHarnessEnvelope({
    request,
    authority: Object.freeze({
      manifestRef: `host://builder-job/${jobId}`,
      verified: true,
      verifiedBy: 'host',
      environments: Object.freeze(['production'] as const),
      capabilities: Object.freeze([Object.freeze({
        id: BUILDER_JOB_HARNESS_CAPABILITY,
        environments: Object.freeze(['production'] as const),
        mutating: true,
        risk: 'write' as const,
        scopes: Object.freeze([BUILDER_JOB_HARNESS_SCOPE]),
      })]),
      limits,
    }),
    capabilities: resolver({ userId, environmentId }),
    executor: createGovernedHarnessExecutor({ policy: policy(), host }),
    worker: Object.freeze({
      async run(context) {
        await context.execute({
          actionId: 'execute-builder-job-slice',
          kind: 'delegate',
          capabilityId: BUILDER_JOB_HARNESS_CAPABILITY,
          params: Object.freeze({ jobId }),
          compensation: Object.freeze({
            mode: 'delegated' as const,
            reason: 'the durable Builder controller owns generation fencing, isolated workspace checkpoints, and repository-specific snapshot/merge-watch recovery',
          }),
        })
      },
    }),
    verifier: Object.freeze({
      async verify() {
        if (!invoked) return Object.freeze({
          verified: false,
          verifierRef: 'host://builder-job/terminal-state-verifier-v1',
          evidenceRefs: Object.freeze([]),
          reason: 'builder_job_not_invoked',
          failureAttribution: 'harness' as const,
        })
        const job = await getBuilderJobForUser(jobId, userId).catch(() => null)
        if (!job) return Object.freeze({
          verified: false,
          verifierRef: 'host://builder-job/terminal-state-verifier-v1',
          evidenceRefs: Object.freeze([]),
          reason: 'builder_job_terminal_state_unavailable',
          failureAttribution: 'harness' as const,
        })
        const evidenceRefs = Object.freeze([
          `builder-job://${job.id}/status/${job.status}/generation/${job.claimGeneration}`,
        ])
        if (job.status === 'succeeded' || job.status === 'paused') return Object.freeze({
          verified: true,
          verifierRef: 'host://builder-job/terminal-state-verifier-v1',
          evidenceRefs,
        })
        if (job.status === 'failed') return Object.freeze({
          verified: false,
          verifierRef: 'host://builder-job/terminal-state-verifier-v1',
          evidenceRefs,
          reason: job.error || 'builder_job_failed',
          failureAttribution: infrastructureFailure(job.error) ? 'infrastructure' as const : 'competency' as const,
        })
        return Object.freeze({
          verified: false,
          verifierRef: 'host://builder-job/terminal-state-verifier-v1',
          evidenceRefs,
          reason: `builder_job_non_terminal:${job.status}`,
          failureAttribution: 'harness' as const,
        })
      },
    }),
    evidenceSink: createSupervisorAuditHarnessEvidenceSink(db as any),
  })

  if (envelope.accepted === false) {
    return { ok: false, runId, code: envelope.reasons[0] || 'builder_job_harness_rejected' }
  }
  const evidence = envelope.completed.evidence
  return evidence.outcomeStatus === 'success'
    ? { ok: true, runId }
    : { ok: false, runId, code: evidence.failureCode || 'builder_job_harness_not_verified' }
}
