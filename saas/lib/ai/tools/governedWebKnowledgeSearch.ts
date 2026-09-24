// saas/lib/ai/tools/governedWebKnowledgeSearch.ts
//
// Bridge the existing COS live-search seam to the platform-wide Web Knowledge Harness capability.
// When the active COS parent run carries the exact read grant, retrieval MUST execute through that
// child HarnessRun. When no such grant exists, callers may continue through their legacy adapter.

import {
  WEB_KNOWLEDGE_RESEARCH_CAPABILITY,
  createWebKnowledgeResearchPort,
  runWebKnowledgeResearchProductionHarness,
  type WebKnowledgeResearchPort,
} from '@/platform-harness/capabilities/web-knowledge'
import { currentCosHarnessIngress } from '@/platform-harness/adapters/cos-ingress'
import { createSupervisorAuditHarnessEvidenceSink } from '@/platform-harness/evidence/supervisor-audit-sink'
import type { HarnessEvidenceSink } from '@/platform-harness/evidence/durable-evidence'
import { cosServiceDb } from '@/lib/cos-core/storage/service-db'

export type GovernedWebSearchResult = Readonly<{
  title: string
  url: string
  snippet: string
}>

export type GovernedWebSearchDecision =
  | Readonly<{ handled: false; results: readonly [] }>
  | Readonly<{ handled: true; ok: true; results: readonly GovernedWebSearchResult[] }>
  | Readonly<{ handled: true; ok: false; results: readonly []; error: string }>

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function activeParentHasWebKnowledgeGrant(): boolean {
  const parent = currentCosHarnessIngress()?.manifest
  return Boolean(parent?.capabilities.some(capability =>
    capability.id === WEB_KNOWLEDGE_RESEARCH_CAPABILITY
    && capability.mutating === false
    && (capability.risk ?? 'read') === 'read',
  ))
}

function defaultEvidenceSink(): HarnessEvidenceSink | null {
  const db = cosServiceDb()
  return db ? createSupervisorAuditHarnessEvidenceSink(db as any) : null
}

/**
 * Returns handled=false when this turn did not authorize Web Knowledge.
 * Returns handled=true on an authorized turn even when research fails, so callers cannot silently
 * bypass the Harness through a legacy direct-search adapter.
 */
export async function searchThroughGovernedWebKnowledge(input: {
  query: string
  count: number
  research?: WebKnowledgeResearchPort
  evidenceSink?: HarnessEvidenceSink
}): Promise<GovernedWebSearchDecision> {
  if (!activeParentHasWebKnowledgeGrant()) {
    return Object.freeze({ handled: false, results: Object.freeze([]) })
  }

  const parent = currentCosHarnessIngress()?.manifest
  if (!parent) {
    return Object.freeze({
      handled: true,
      ok: false,
      results: Object.freeze([]),
      error: 'web_knowledge_parent_harness_missing',
    })
  }

  const evidenceSink = input.evidenceSink ?? defaultEvidenceSink()
  if (!evidenceSink) {
    return Object.freeze({
      handled: true,
      ok: false,
      results: Object.freeze([]),
      error: 'web_knowledge_evidence_sink_unavailable',
    })
  }

  const query = clean(input.query, 1_500)
  if (!query) {
    return Object.freeze({
      handled: true,
      ok: false,
      results: Object.freeze([]),
      error: 'web_knowledge_query_required',
    })
  }

  const research = input.research ?? createWebKnowledgeResearchPort()
  const outcome = await runWebKnowledgeResearchProductionHarness({
    query,
    purpose: 'agent_research',
    tenantId: parent.identity.tenantId || 'itmounts',
    portableId: 'cos-web-knowledge-research',
    agentId: parent.identity.agentId,
    role: parent.identity.role,
    environmentId: parent.environment.environmentId,
    parentManifest: parent,
    evidenceSink,
    research,
    maxResults: Math.max(1, Math.min(5, Math.floor(Number(input.count) || 3))),
  })

  if (!outcome.ok) {
    return Object.freeze({
      handled: true,
      ok: false,
      results: Object.freeze([]),
      error: outcome.code,
    })
  }

  const results = Object.freeze(outcome.results.map(row => Object.freeze({
    title: clean(row.title, 200) || row.uri,
    url: clean(row.uri, 2_000),
    snippet: clean(row.text, 400),
  })).filter(row => Boolean(row.url && row.snippet)))

  return Object.freeze({ handled: true, ok: true, results })
}
