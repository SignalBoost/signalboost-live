import { getAdminSupabase } from '@/utils/supabase/server'
import {
  rankEnterpriseMemoryCandidates,
  type EnterpriseMemoryCandidate,
  type RankedEnterpriseMemory,
} from './retrievalRanking'

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
  return Math.min(1, Math.max(0, numeric))
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? structuredClone(value as Record<string, unknown>)
    : {}
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
    const id = text(row.id) || `${text(row.organization_id)}:${text(row.workspace)}`
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
    const id = text(row.id) || `${text(row.repo_owner)}/${text(row.repo_name)}`
    if (!id) continue
    candidates.push({
      id,
      kind: 'repository',
      confidence: number01(row.intelligence_confidence),
      occurredAt: text(row.analyzed_at) || text(row.last_repository_update) || null,
      taskTags: tags(row.repo_owner, row.repo_name, row.primary_languages, row.frameworks, row.topics),
      payload: {
        owner: text(row.repo_owner),
        name: text(row.repo_name),
        defaultBranch: text(row.default_branch),
        primaryLanguages: Array.isArray(row.primary_languages) ? structuredClone(row.primary_languages) : [],
        frameworks: Array.isArray(row.frameworks) ? structuredClone(row.frameworks) : [],
        productDescriptions: Array.isArray(row.product_descriptions) ? structuredClone(row.product_descriptions) : [],
        lastAnalyzedCommitSha: text(row.last_analyzed_commit_sha),
      },
    })
  }

  for (const row of rows.campaigns || []) {
    const id = text(row.campaign_id) || text(row.id)
    if (!id) continue
    const performance = object(row.performance_data)
    candidates.push({
      id,
      kind: 'campaign',
      workspace: text(row.workspace) || null,
      confidence: confidenceFromRecord(row.confidence),
      approved: text(row.approval_decision) === 'approved',
      performanceScore: number01(performance.score ?? performance.performanceScore),
      occurredAt: text(row.approved_at) || text(row.updated_at) || text(row.created_at) || null,
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
  }

  for (const row of rows.approvals || []) {
    const id = text(row.id) || `${text(row.campaign_id)}:${text(row.created_at)}`
    if (!id) continue
    candidates.push({
      id,
      kind: 'approval',
      approved: text(row.decision) === 'approved',
      occurredAt: text(row.created_at) || null,
      taskTags: tags(row.campaign_id, row.decision),
      payload: {
        campaignId: text(row.campaign_id),
        decision: text(row.decision),
        approvedVersion: object(row.approved_version),
        evidence: text(row.evidence),
      },
    })
  }

  for (const row of rows.confidence || []) {
    const id = text(row.id) || `${text(row.workspace)}:${text(row.created_at)}`
    if (!id) continue
    candidates.push({
      id,
      kind: 'confidence',
      workspace: text(row.workspace) || null,
      confidence: confidenceFromRecord(row.confidence),
      occurredAt: text(row.created_at) || null,
      taskTags: tags(row.workspace),
      payload: { confidence: object(row.confidence) },
    })
  }

  return candidates
}

export async function retrieveEnterpriseMemoryContext(args: {
  organizationId: string
  workspace: string
  taskTags?: readonly string[]
  limit?: number
}): Promise<EnterpriseMemoryContext | null> {
  const organizationId = args.organizationId.trim()
  if (!organizationId) return null
  const admin = getAdminSupabase()

  const [organizationResult, intelligenceResult, repositoriesResult, campaignsResult, approvalsResult, confidenceResult] = await Promise.all([
    admin.from('enterprise_organizations').select('*').eq('id', organizationId).maybeSingle(),
    admin.from('enterprise_intelligence_snapshots').select('*').eq('organization_id', organizationId).order('analyzed_at', { ascending: false }).limit(10),
    admin.from('enterprise_repository_snapshots').select('*').eq('organization_id', organizationId).order('analyzed_at', { ascending: false }).limit(10),
    admin.from('enterprise_campaign_memory').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }).limit(30),
    admin.from('enterprise_approval_history').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(30),
    admin.from('enterprise_confidence_history').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(20),
  ])

  const candidates = createEnterpriseMemoryCandidates({
    organization: organizationResult.data || null,
    intelligence: Array.isArray(intelligenceResult.data) ? intelligenceResult.data : [],
    repositories: Array.isArray(repositoriesResult.data) ? repositoriesResult.data : [],
    campaigns: Array.isArray(campaignsResult.data) ? campaignsResult.data : [],
    approvals: Array.isArray(approvalsResult.data) ? approvalsResult.data : [],
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
