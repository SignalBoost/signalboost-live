// saas/platform-harness/capabilities/web-knowledge.ts
//
// Shared read-only Web Knowledge Acquisition capability for COS, University students, and specialists.
// Retrieval is evidence acquisition only. It never authorizes durable learning, distillation, training,
// Production mutation, or broader agent authority.

import { randomUUID } from 'node:crypto'
import type { LearningConnectorSearch } from '../../lib/cos-core/layers/learning/connectors.ts'
import {
  createWebTrainingResearchSearch,
  type WebTrainingSearchOptions,
} from '../../lib/cos-core/layers/learning/webTrainingDataLayer.ts'
import { createPortableCapabilityDescriptor } from '../../provider-hub-core/capability-runtime.ts'
import type { GatewayHost, GovernancePolicy } from '../../agent-gateway/types.ts'
import {
  createProductionHarnessRequest,
  runProductionHarnessEnvelope,
} from '../adapters/production.ts'
import type { HarnessCapabilityResolverPort } from './resolver.ts'
import type {
  HarnessCapabilityGrant,
  HarnessEnvironmentClass,
  HarnessManifest,
} from '../core/types.ts'
import type { HarnessEvidenceSink } from '../evidence/durable-evidence.ts'
import { createGovernedHarnessExecutor } from '../runtime/governed-executor.ts'

export const WEB_KNOWLEDGE_RESEARCH_CAPABILITY = 'web.knowledge.research' as const
export const WEB_KNOWLEDGE_RESEARCH_SCOPE = 'web.public.research.read' as const
export const WEB_KNOWLEDGE_PROVIDER_ID = 'native-web-knowledge' as const
export const WEB_KNOWLEDGE_CONNECTION_ID = 'web-knowledge-acquisition-v1' as const

export type WebKnowledgeResearchPurpose =
  | 'live_reference'
  | 'agent_research'
  | 'technical_research'
  | 'university_research'

export type WebKnowledgeResearchResult = Readonly<{
  uri: string
  title: string
  text: string
  observedAt: string
  evidence: readonly string[]
  rightsEvidence: string | null
  purpose: WebKnowledgeResearchPurpose
  durableLearningAuthorized: false
  trainingAuthorized: false
}>

export interface WebKnowledgeResearchPort {
  search(input: {
    query: string
    purpose: WebKnowledgeResearchPurpose
    maxResults?: number
  }): Promise<readonly WebKnowledgeResearchResult[]>
}

export type WebKnowledgeResearchOptions = WebTrainingSearchOptions & Readonly<{
  /** Test/host seam. Production defaults to the existing governed credible-web search. */
  search?: LearningConnectorSearch
}>

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function boundedResults(value: number | undefined): number {
  const candidate = Number(value)
  return Number.isFinite(candidate) ? Math.max(1, Math.min(5, Math.floor(candidate))) : 3
}

export function createWebKnowledgeCapabilityGrant(
  environments: readonly HarnessEnvironmentClass[],
): HarnessCapabilityGrant {
  return Object.freeze({
    id: WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
    environments: Object.freeze([...new Set(environments)]),
    mutating: false,
    risk: 'read',
    scopes: Object.freeze([WEB_KNOWLEDGE_RESEARCH_SCOPE]),
  })
}

/**
 * Native capability discovery for the shared web-research substrate.
 * Discovery can prove availability only; the manifest must already contain the exact read grant.
 */
export function createNativeWebKnowledgeCapabilityResolver(input: {
  tenantId: string
  environmentId: string
  portableId?: string
}): HarnessCapabilityResolverPort {
  const tenantId = clean(input.tenantId, 240)
  const environmentId = clean(input.environmentId, 240)
  const portableId = clean(input.portableId, 240)
  const descriptor = createPortableCapabilityDescriptor({
    capabilityId: WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
    providerId: WEB_KNOWLEDGE_PROVIDER_ID,
    connectionId: WEB_KNOWLEDGE_CONNECTION_ID,
    tenantId,
    environmentId,
    risk: 'read',
    availability: 'available',
    requiresApproval: false,
    scopes: [WEB_KNOWLEDGE_RESEARCH_SCOPE],
    metadata: {
      retrievalOnly: true,
      durableLearningAuthorized: false,
      trainingAuthorized: false,
    },
  })

  return Object.freeze({
    async resolve(manifest) {
      const exactIdentity = manifest.identity.tenantId === tenantId
        && manifest.environment.environmentId === environmentId
        && (!portableId || manifest.identity.portableId === portableId)
      const grant = manifest.capabilities.find(capability =>
        capability.id === WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
      )
      const authorized = Boolean(
        grant
        && grant.mutating === false
        && (grant.risk ?? 'read') === 'read'
        && grant.environments.includes(manifest.environment.class)
        && grant.scopes?.includes(WEB_KNOWLEDGE_RESEARCH_SCOPE),
      )

      if (!exactIdentity || !authorized) {
        return Object.freeze({
          satisfied: false,
          resolved: Object.freeze({}),
          missing: Object.freeze([WEB_KNOWLEDGE_RESEARCH_CAPABILITY]),
          reason: 'harness_web_knowledge_exact_read_scope_required',
        })
      }

      return Object.freeze({
        satisfied: true,
        resolved: Object.freeze({
          [WEB_KNOWLEDGE_RESEARCH_CAPABILITY]: descriptor,
        }),
        missing: Object.freeze([]),
      })
    },
  })
}

/**
 * Shared research substrate. The existing credible-web implementation supplies bounded discovery,
 * SSRF protection, source credibility screening, page-size/time limits, PDF/text extraction and
 * source provenance. This wrapper deliberately strips any implication that retrieval itself grants
 * durable-learning or training rights.
 */
export function createWebKnowledgeResearchPort(
  options: WebKnowledgeResearchOptions = {},
): WebKnowledgeResearchPort {
  const search = options.search ?? createWebTrainingResearchSearch(options)
  return Object.freeze({
    async search(input) {
      const query = clean(input.query, 1_500)
      if (!query) return Object.freeze([])
      const purpose = input.purpose
      const rows = await search(query, boundedResults(input.maxResults))
      return Object.freeze(rows.map(row => Object.freeze({
        uri: clean(row.uri, 2_000),
        title: clean(row.title || row.uri, 300),
        text: String(row.text || '').trim(),
        observedAt: clean(row.observedAt, 80) || new Date().toISOString(),
        evidence: Object.freeze([
          ...(row.evidence ?? []).map(item => clean(item, 500)).filter(Boolean),
          'web_knowledge_acquisition=research_only_v1',
          `research_purpose=${purpose}`,
          'durable_learning_authorized=false',
          'training_authorized=false',
        ]),
        rightsEvidence: clean(row.license, 1_000) || null,
        purpose,
        durableLearningAuthorized: false as const,
        trainingAuthorized: false as const,
      })).filter(row => Boolean(row.uri && row.text)))
    },
  })
}

function researchPolicy(): GovernancePolicy {
  return Object.freeze({
    environment: 'production',
    classifier: Object.freeze({
      classify(request) {
        return request.action.kind === 'read'
          && request.action.target === WEB_KNOWLEDGE_RESEARCH_CAPABILITY
          ? 'reversible_internal'
          : 'unknown'
      },
    }),
    allowlist: Object.freeze([Object.freeze({
      actionKind: 'read',
      target: WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
      rollback: 'read-only external research has no Production mutation to roll back',
    })]),
  })
}

export type WebKnowledgeHarnessResult =
  | Readonly<{ ok: true; runId: string; results: readonly WebKnowledgeResearchResult[] }>
  | Readonly<{ ok: false; runId: string; code: string }>

/**
 * Canonical Production execution path for agents that use Web Knowledge Acquisition.
 * A parent HarnessRun may delegate this read only when the parent already contains the same grant.
 */
export async function runWebKnowledgeResearchProductionHarness(input: {
  query: string
  purpose: WebKnowledgeResearchPurpose
  tenantId: string
  portableId: string
  agentId: string
  role: string
  evidenceSink: HarnessEvidenceSink
  parentManifest?: HarnessManifest
  environmentId?: string
  runId?: string
  maxResults?: number
  research?: WebKnowledgeResearchPort
}): Promise<WebKnowledgeHarnessResult> {
  const query = clean(input.query, 1_500)
  const tenantId = clean(input.tenantId, 240)
  const portableId = clean(input.portableId, 240)
  const agentId = clean(input.agentId, 240)
  const role = clean(input.role, 160)
  const environmentId = clean(input.environmentId, 240) || 'itmounts-production'
  const runId = clean(input.runId, 160) || `web-research-${randomUUID()}`
  if (!query || !tenantId || !portableId || !agentId || !role) {
    return Object.freeze({ ok: false, runId, code: 'web_knowledge_identity_or_query_required' })
  }

  const request = createProductionHarnessRequest({
    runId,
    objective: `Research public web evidence for: ${query}`,
    tenantId,
    portableId,
    agentId,
    role,
    environmentId,
    requestedCapabilities: [WEB_KNOWLEDGE_RESEARCH_CAPABILITY],
    limits: { maxToolCalls: 1, maxConcurrency: 1, deadlineMs: 45_000, maxCostUsd: 0 },
    ...(input.parentManifest ? {
      parent: {
        runId: input.parentManifest.runId,
        authorityManifestRef: input.parentManifest.authorityManifestRef,
      },
    } : {}),
  })

  const research = input.research ?? createWebKnowledgeResearchPort()
  let results: readonly WebKnowledgeResearchResult[] = Object.freeze([])
  let invoked = false

  const host: GatewayHost = Object.freeze({
    execution: Object.freeze({
      async perform(agentRequest, control) {
        if (
          agentRequest.action.kind !== 'read'
          || agentRequest.action.target !== WEB_KNOWLEDGE_RESEARCH_CAPABILITY
          || agentRequest.tenantId !== tenantId
        ) {
          return { ok: false, error: 'web_knowledge_host_scope_rejected' }
        }
        if (control?.signal?.aborted) return { ok: false, error: 'web_knowledge_research_aborted' }
        try {
          results = await research.search({
            query,
            purpose: input.purpose,
            maxResults: input.maxResults,
          })
          if (control?.signal?.aborted) return { ok: false, error: 'web_knowledge_research_aborted' }
          invoked = true
          return {
            ok: true,
            result: { sourceCount: results.length },
            evidenceRefs: results.map(row => row.uri).slice(0, 5),
          }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message.slice(0, 300) : 'web_knowledge_research_failed',
          }
        }
      },
    }),
  })

  const grant = createWebKnowledgeCapabilityGrant(['production'])
  const envelope = await runProductionHarnessEnvelope({
    request,
    authority: Object.freeze({
      manifestRef: `host://web-knowledge/${runId}`,
      verified: true,
      verifiedBy: 'host',
      environments: Object.freeze(['production'] as const),
      capabilities: Object.freeze([grant]),
      limits: Object.freeze({ maxToolCalls: 1, maxConcurrency: 1, deadlineMs: 45_000, maxCostUsd: 0 }),
    }),
    capabilities: createNativeWebKnowledgeCapabilityResolver({ tenantId, environmentId, portableId }),
    executor: createGovernedHarnessExecutor({ policy: researchPolicy(), host }),
    worker: Object.freeze({
      async run(context) {
        await context.execute({
          actionId: 'web-knowledge-research',
          kind: 'read',
          capabilityId: WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
          params: Object.freeze({ purpose: input.purpose }),
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
          verifierRef: 'host://web-knowledge/research-verifier-v1',
          evidenceRefs: Object.freeze(results.map(row => row.uri).slice(0, 5)),
          ...(executed ? {} : {
            reason: 'web_knowledge_research_not_executed',
            failureAttribution: 'harness' as const,
          }),
        })
      },
    }),
    evidenceSink: input.evidenceSink,
    ...(input.parentManifest ? { parentManifest: input.parentManifest } : {}),
  })

  if (envelope.accepted === false) {
    return Object.freeze({
      ok: false,
      runId,
      code: envelope.reasons[0] ?? 'web_knowledge_harness_rejected',
    })
  }
  if (envelope.completed.evidence.outcomeStatus !== 'success' || !invoked) {
    return Object.freeze({
      ok: false,
      runId,
      code: envelope.completed.evidence.failureCode ?? 'web_knowledge_harness_not_verified',
    })
  }

  return Object.freeze({ ok: true, runId, results })
}
