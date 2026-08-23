import {
  rankEnterpriseMemoryCandidates,
  type EnterpriseMemoryCandidate,
  type RankedEnterpriseMemory,
} from './retrievalRanking.ts'
import { deriveStrategyProfile, type CampaignOutcomeRow } from '../../ai/cos/strategyProfile.ts'
import { isStrategyProfileRequest, strategyProfileEvidenceBlock } from '../../ai/cos/strategyProfileRequest.ts'

export type EnterpriseMemoryContext = {
  source: 'enterprise_memory'
  organizationId: string
  generatedAt: string
  memories: RankedEnterpriseMemory[]
}

type MemoryRows = {
  organization?: Record<string, unknown> | null
  intelligence?: readonly Record<string, unknown>[]
  repositories?: readonly Record<string, unknown>[]
  campaigns?: readonly Record<string, unknown>[]
  approvals?: readonly Record<string, unknown>[]
  confidence?: readonly Record<string, unknown>[]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  if (numeric > 5 && numeric <= 100) return numeric / 100
  return Math.min(1, Math.max(0, numeric))
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? structuredClone(value) : []
}

function tags(...values: unknown[]): string[] {
  return [...new Set(values.flatMap(value => {
    if (Array.isArray(value)) return value.map(text)
    return text(value).split(/[\s,;/|]+/)
  }).map(value => value.toLowerCase()).filter(Boolean))].slice(0, 24)
}

function confidenceFromRecord(value: unknown): number {
  const record = object(value)
  const scores = Object.values(record).map(number01).filter(score => score > 0)
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
}

function compositeIdentity(separator: string, ...parts: unknown[]): string {
  const cleaned = parts.map(text)
  return cleaned.every(Boolean) ? cleaned.join(separator) : ''
}

export function createEnterpriseMemoryCandidates(rows: MemoryRows): EnterpriseMemoryCandidate[] {
  const candidates: EnterpriseMemoryCandidate[] = []
  const organization = rows.organization
  if (organization && text(organization.id)) {
    candidates.push({
      id: text(organization.id),
      kind: 'organization',
      confidence: number01(organization.confidence),
      occurredAt: text(organization.profile_refreshed_at) || text(organization.updated_at) || null,
      taskTags: tags(organization.industry, organization.name, organization.aliases),
      payload: {
        name: text(organization.name),
        industry: text(organization.industry),
        profile: object(organization.profile),
        canonicalDomain: text(organization.canonical_domain),
      },
    })
  }

  for (const row of rows.intelligence || []) {
    const id = text(row.id) || compositeIdentity(':', row.organization_id, row.workspace)
    if (!id) continue
    const snapshot = object(row.snapshot)
    candidates.push({
      id,
      kind: 'intelligence',
      workspace: text(row.workspace) || null,
      confidence: confidenceFromRecord(row.confidence),
      occurredAt: text(row.analyzed_at) || text(row.updated_at) || null,
      taskTags: tags(row.workspace, snapshot.classification, snapshot.campaignPlan),
      payload: { snapshot, schemaVersion: Number(row.schema_version) || 1 },
    })
  }

  for (const row of rows.repositories || []) {
    const owner = text(row.repo_owner)
    const name = text(row.repo_name)
    const id = text(row.id) || compositeIdentity('/', owner, name)
    if (!id) continue
    const snapshot = object(row.snapshot)
    const topLanguages = array(row.primary_languages)
    const topFrameworks = array(row.frameworks)
    const topProducts = array(row.product_descriptions)
    candidates.push({
      id,
      kind: 'repository',
      confidence: number01(row.confidence ?? row.intelligence_confidence),
      occurredAt: text(row.analyzed_at) || text(row.last_repository_update) || null,
      taskTags: tags(owner, name, row.primary_languages, row.frameworks, row.topics, snapshot.primaryLanguages, snapshot.primary_languages, snapshot.frameworks, snapshot.topics),
      payload: {
        owner,
        name,
        defaultBranch: text(row.default_branch) || text(snapshot.defaultBranch) || text(snapshot.default_branch),
        primaryLanguages: topLanguages.length ? topLanguages : array(snapshot.primaryLanguages ?? snapshot.primary_languages),
        frameworks: topFrameworks.length ? topFrameworks : array(snapshot.frameworks),
        productDescriptions: topProducts.length ? topProducts : array(snapshot.productDescriptions ?? snapshot.product_descriptions),
        lastAnalyzedCommitSha: text(row.commit_sha) || text(row.last_analyzed_commit_sha) || text(snapshot.lastAnalyzedCommitSha),
      },
    })
  }

  for (const row of rows.campaigns || []) {
    const id = text(row.campaign_id) || text(row.id)
    if (!id) continue
    const performance = object(row.performance ?? row.performance_data)
    const approvalDecision = text(row.approval_decision)
    const occurredAt = text(row.approved_at) || text(row.updated_at) || text(row.created_at) || null
    candidates.push({
      id,
      kind: 'campaign',
      workspace: text(row.workspace) || null,
      confidence: confidenceFromRecord(row.confidence),
      approved: approvalDecision === 'approved',
      performanceScore: number01(performance.score ?? performance.performanceScore),
      occurredAt,
      taskTags: tags(row.workspace, row.objective, row.selected_audience, row.selected_product, row.channel, row.cta),
      payload: {
        campaignId: id,
        objective: text(row.objective),
        audience: text(row.selected_audience),
        product: text(row.selected_product),
        channel: text(row.channel),
        cta: text(row.cta),
        creative: text(row.creative),
        executionStatus: text(row.execution_status),
      },
    })

    if (approvalDecision) {
      candidates.push({
        id: `${id}:approval`,
        kind: 'approval',
        approved: approvalDecision === 'approved',
        occurredAt,
        taskTags: tags(id, approvalDecision, row.workspace),
        payload: {
          campaignId: id,
          decision: approvalDecision,
          approvedVersion: object(row.approved_version),
          evidence: text(row.approval_evidence),
        },
      })
    }
  }

  for (const row of rows.approvals || []) {
    const campaignId = text(row.campaign_id)
    const createdAt = text(row.created_at) || text(row.recorded_at)
    const id = text(row.id) || compositeIdentity(':', campaignId, createdAt)
    if (!id) continue
    candidates.push({
      id,
      kind: 'approval',
      approved: text(row.decision) === 'approved',
      occurredAt: createdAt || null,
      taskTags: tags(campaignId, row.decision),
      payload: {
        campaignId,
        decision: text(row.decision),
        approvedVersion: object(row.approved_version),
        evidence: text(row.evidence),
      },
    })
  }

  for (const row of rows.confidence || []) {
    const workspace = text(row.workspace)
    const occurredAt = text(row.recorded_at) || text(row.created_at)
    const id = text(row.id) || compositeIdentity(':', workspace, occurredAt)
    if (!id) continue
    candidates.push({
      id,
      kind: 'confidence',
      workspace: workspace || null,
      confidence: confidenceFromRecord(row.confidence),
      occurredAt: occurredAt || null,
      taskTags: tags(workspace),
      payload: { confidence: object(row.confidence) },
    })
  }

  return candidates
}

export async function retrieveEnterpriseMemoryContext(args: {
  organizationId: string
  workspace?: string
  taskTags?: readonly string[]
  limit?: number
}): Promise<EnterpriseMemoryContext | null> {
  const organizationId = args.organizationId.trim()
  if (!organizationId) return null
  const { getAdminSupabase } = await import('../../../utils/supabase/server.ts')
  const admin = getAdminSupabase()

  // Strategy-profile questions are a special live evidence read, not ordinary durable memory.
  // The answer path already calls this retriever before cache lookup. Returning this one scoped
  // memory makes semantic cache ineligible, while the freshly generated evidence changes the exact
  // cache fingerprint on every request. This preserves the current COS core/cache hygiene code.
  const strategyProfileRequested = isStrategyProfileRequest((args.taskTags || []).join(' '))
  if (strategyProfileRequested) {
    const generatedAt = new Date().toISOString()
    const campaignsResult = await admin.from('enterprise_campaign_memory')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(2000)

    const evidence = campaignsResult.error
      ? [
          'CURRENT STRATEGY PROFILE — REQUESTED BUT UNAVAILABLE.',
          `Reason: ${campaignsResult.error.message}`,
          'Say plainly that the live profile could not be read, and do not substitute invented weights or heuristics.',
        ].join('\n')
      : strategyProfileEvidenceBlock(deriveStrategyProfile(
          (Array.isArray(campaignsResult.data) ? campaignsResult.data : []) as CampaignOutcomeRow[],
        ))

    const memories = rankEnterpriseMemoryCandidates([{
      id: `derived-strategy-profile:${organizationId}:${generatedAt}`,
      kind: 'intelligence',
      workspace: args.workspace || null,
      confidence: 1,
      performanceScore: 1,
      occurredAt: generatedAt,
      taskTags: [...(args.taskTags || []), 'strategy', 'profile', 'weights', 'heuristics'],
      payload: {
        strategyProfileEvidence: evidence,
        readLive: true,
        derivedFrom: 'enterprise_campaign_memory',
      },
    }], {
      workspace: args.workspace,
      taskTags: args.taskTags,
      limit: 1,
    })

    return memories.length ? {
      source: 'enterprise_memory',
      organizationId,
      generatedAt,
      memories,
    } : null
  }

  const [organizationResult, intelligenceResult, repositoriesResult, campaignsResult, confidenceResult] = await Promise.all([
    admin.from('enterprise_organizations').select('*').eq('id', organizationId).maybeSingle(),
    admin.from('enterprise_intelligence_snapshots').select('*').eq('organization_id', organizationId).order('analyzed_at', { ascending: false }).limit(10),
    admin.from('enterprise_repository_snapshots').select('*').eq('organization_id', organizationId).order('analyzed_at', { ascending: false }).limit(10),
    admin.from('enterprise_campaign_memory').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(30),
    admin.from('enterprise_confidence_history').select('*').eq('organization_id', organizationId).order('recorded_at', { ascending: false }).limit(20),
  ])

  const candidates = createEnterpriseMemoryCandidates({
    organization: organizationResult.data || null,
    intelligence: Array.isArray(intelligenceResult.data) ? intelligenceResult.data : [],
    repositories: Array.isArray(repositoriesResult.data) ? repositoriesResult.data : [],
    campaigns: Array.isArray(campaignsResult.data) ? campaignsResult.data : [],
    confidence: Array.isArray(confidenceResult.data) ? confidenceResult.data : [],
  })

  const memories = rankEnterpriseMemoryCandidates(candidates, {
    workspace: args.workspace,
    taskTags: args.taskTags,
    limit: args.limit ?? 8,
  })
  if (!memories.length) return null

  return {
    source: 'enterprise_memory',
    organizationId,
    generatedAt: new Date().toISOString(),
    memories,
  }
}
