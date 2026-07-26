// saas/lib/enterprise/memory/service.ts
// Issue #205 Section 1.8 — the one authoritative Enterprise Memory boundary.
// Pages, API routes, and campaign components must go through these functions;
// none of them may query or mutate the enterprise_* tables directly.
//
// Access is service-role only, behind the existing admin guard. Single operator
// tenant, so isolation = trusted server-side writes (matches repo convention).

import { getAdminSupabase } from '@/utils/supabase/server'
import { canonicalDomainOf, createUrlFingerprint, normalizeUrl } from './urlCanonical.ts'

type Admin = ReturnType<typeof getAdminSupabase>

// ── Refresh policy (Section 1.6) ─────────────────────────────────────────────
const DAY = 24 * 60 * 60 * 1000
export const REFRESH_POLICY = {
  companyProfileMs: 30 * DAY,
  intelligenceSnapshotMs: 14 * DAY,
  repositoryMs: DAY,
  audienceMs: 30 * DAY,
} as const

export type MemoryStatus = 'fresh' | 'stale' | 'refreshing' | 'failed' | 'invalidated' | 'partial'

export type OrganizationMemory = {
  id: string
  canonicalDomain: string
  name: string
  aliases: string[]
  industry: string
  profile: Record<string, unknown>
  confidence: number
  sourceType: string
  status: MemoryStatus
  profileRefreshedAt: string
}

export type IntelligenceSnapshot = {
  organizationId: string
  workspace: string
  snapshot: Record<string, unknown>
  confidence: Record<string, number>
  schemaVersion: number
  status: MemoryStatus
  analyzedAt: string
  expiresAt: string | null
}

export type RefreshRequirements = {
  organizationStale: boolean
  snapshotStale: boolean
  reason: string
}

function mapOrg(row: any): OrganizationMemory {
  return {
    id: row.id,
    canonicalDomain: row.canonical_domain,
    name: row.name || '',
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    industry: row.industry || '',
    profile: row.profile || {},
    confidence: Number(row.confidence) || 0,
    sourceType: row.source_type || 'website',
    status: (row.status || 'fresh') as MemoryStatus,
    profileRefreshedAt: row.profile_refreshed_at,
  }
}

function mapSnapshot(row: any): IntelligenceSnapshot {
  return {
    organizationId: row.organization_id,
    workspace: row.workspace,
    snapshot: row.snapshot || {},
    confidence: row.confidence || {},
    schemaVersion: row.schema_version || 1,
    status: (row.status || 'fresh') as MemoryStatus,
    analyzedAt: row.analyzed_at,
    expiresAt: row.expires_at || null,
  }
}

// resolveOrganization(): canonical URL + fingerprint -> stable org identity.
// Atomic upsert on canonical_domain guarantees concurrent callers converge on one row.
export async function resolveOrganization(
  sourceUrl: string,
  sourceType = 'website',
): Promise<{ organization: OrganizationMemory; fingerprint: string; canonicalUrl: string }> {
  const { canonicalUrl } = normalizeUrl(sourceUrl)
  const canonicalDomain = canonicalDomainOf(sourceUrl)
  const fingerprint = createUrlFingerprint(sourceUrl)
  const admin: Admin = getAdminSupabase()

  // Upsert the org by canonical_domain (unique). ignoreDuplicates keeps the first winner
  // under concurrency; we then read the authoritative row.
  await admin
    .from('enterprise_organizations')
    .upsert({ canonical_domain: canonicalDomain, source_type: sourceType }, { onConflict: 'canonical_domain', ignoreDuplicates: true })

  const { data: orgRow, error: orgErr } = await admin
    .from('enterprise_organizations')
    .select('*')
    .eq('canonical_domain', canonicalDomain)
    .single()
  if (orgErr || !orgRow) throw new Error(orgErr?.message || 'Failed to resolve organization.')

  // Record the fingerprint -> org mapping (alias/source URL preservation).
  await admin
    .from('enterprise_url_fingerprints')
    .upsert({
      fingerprint,
      organization_id: orgRow.id,
      source_url: sourceUrl.slice(0, 2048),
      canonical_url: canonicalUrl,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'fingerprint' })

  return { organization: mapOrg(orgRow), fingerprint, canonicalUrl }
}

export async function getOrganizationMemory(organizationId: string): Promise<OrganizationMemory | null> {
  const admin = getAdminSupabase()
  const { data } = await admin.from('enterprise_organizations').select('*').eq('id', organizationId).single()
  return data ? mapOrg(data) : null
}

export async function getIntelligenceSnapshot(organizationId: string, workspace: string): Promise<IntelligenceSnapshot | null> {
  const admin = getAdminSupabase()
  const { data } = await admin
    .from('enterprise_intelligence_snapshots')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('workspace', workspace)
    .single()
  return data ? mapSnapshot(data) : null
}

export async function getRepositoryMemory(organizationId: string, owner: string, name: string) {
  const admin = getAdminSupabase()
  const { data } = await admin
    .from('enterprise_repository_snapshots')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('repo_owner', owner)
    .eq('repo_name', name)
    .single()
  return data || null
}

// determineRefreshRequirements(): decide reuse vs refresh WITHOUT discarding valid data.
export function determineRefreshRequirements(
  organization: OrganizationMemory,
  snapshot: IntelligenceSnapshot | null,
  now = Date.now(),
): RefreshRequirements {
  if (organization.status === 'invalidated') {
    return { organizationStale: true, snapshotStale: true, reason: 'organization invalidated' }
  }
  if (!snapshot) {
    return { organizationStale: false, snapshotStale: true, reason: 'no snapshot for workspace' }
  }
  if (snapshot.status === 'invalidated' || snapshot.status === 'failed') {
    return { organizationStale: false, snapshotStale: true, reason: `snapshot ${snapshot.status}` }
  }
  const analyzedMs = new Date(snapshot.analyzedAt).getTime()
  const expired = snapshot.expiresAt ? new Date(snapshot.expiresAt).getTime() <= now : false
  const tooOld = Number.isFinite(analyzedMs) && now - analyzedMs > REFRESH_POLICY.intelligenceSnapshotMs
  if (expired || tooOld) {
    return { organizationStale: false, snapshotStale: true, reason: expired ? 'snapshot expired' : 'snapshot past max age' }
  }
  const profileMs = new Date(organization.profileRefreshedAt).getTime()
  const profileStale = Number.isFinite(profileMs) && now - profileMs > REFRESH_POLICY.companyProfileMs
  return { organizationStale: profileStale, snapshotStale: false, reason: profileStale ? 'profile past max age' : 'fresh' }
}

// mergeIntelligence(): partial reuse — write only the fields that changed, keep the rest.
export async function mergeIntelligence(args: {
  organizationId: string
  workspace: string
  snapshot: Record<string, unknown>
  confidence: Record<string, number>
  organizationPatch?: { name?: string; industry?: string; profile?: Record<string, unknown>; confidence?: number; aliases?: string[] }
  schemaVersion?: number
  expiresAt?: string | null
}): Promise<void> {
  const admin = getAdminSupabase()
  const nowIso = new Date().toISOString()

  await admin
    .from('enterprise_intelligence_snapshots')
    .upsert({
      organization_id: args.organizationId,
      workspace: args.workspace,
      snapshot: args.snapshot,
      confidence: args.confidence,
      schema_version: args.schemaVersion || 1,
      status: 'fresh',
      analyzed_at: nowIso,
      expires_at: args.expiresAt ?? new Date(Date.now() + REFRESH_POLICY.intelligenceSnapshotMs).toISOString(),
    }, { onConflict: 'organization_id,workspace' })

  if (args.organizationPatch) {
    const patch: Record<string, unknown> = { updated_at: nowIso, status: 'fresh' }
    if (args.organizationPatch.name !== undefined) patch.name = args.organizationPatch.name
    if (args.organizationPatch.industry !== undefined) patch.industry = args.organizationPatch.industry
    if (args.organizationPatch.profile !== undefined) { patch.profile = args.organizationPatch.profile; patch.profile_refreshed_at = nowIso }
    if (args.organizationPatch.confidence !== undefined) patch.confidence = args.organizationPatch.confidence
    if (args.organizationPatch.aliases !== undefined) patch.aliases = args.organizationPatch.aliases
    await admin.from('enterprise_organizations').update(patch).eq('id', args.organizationId)
  }

  await admin.from('enterprise_confidence_history').insert({
    organization_id: args.organizationId,
    workspace: args.workspace,
    confidence: args.confidence,
  })
}

export async function recordConfidence(organizationId: string, workspace: string, confidence: Record<string, number>) {
  const admin = getAdminSupabase()
  await admin.from('enterprise_confidence_history').insert({ organization_id: organizationId, workspace, confidence })
}

// recordApproval() / recordCampaignOutcome(): immutable campaign + approval history.
export async function recordCampaignOutcome(args: {
  organizationId: string
  campaignId: string
  workspace?: string
  objective?: string
  selectedAudience?: string
  selectedProduct?: string
  suggestions?: unknown[]
  confidence?: Record<string, number>
  humanEdits?: Record<string, unknown>
  rejectedSuggestions?: unknown[]
  channel?: string
  cta?: string
  creative?: string
  contentHash?: string
  executionStatus?: string
}): Promise<void> {
  const admin = getAdminSupabase()
  await admin.from('enterprise_campaign_memory').upsert({
    organization_id: args.organizationId,
    campaign_id: args.campaignId,
    workspace: args.workspace || '',
    objective: args.objective || '',
    selected_audience: args.selectedAudience || '',
    selected_product: args.selectedProduct || '',
    suggestions: args.suggestions || [],
    confidence: args.confidence || {},
    human_edits: args.humanEdits || {},
    rejected_suggestions: args.rejectedSuggestions || [],
    channel: args.channel || '',
    cta: args.cta || '',
    creative: args.creative || '',
    content_hash: args.contentHash || '',
    execution_status: args.executionStatus || 'draft',
  }, { onConflict: 'organization_id,campaign_id' })
}

export async function recordApproval(args: {
  organizationId: string
  campaignId: string
  decision: 'approved' | 'rejected'
  approvedVersion?: Record<string, unknown>
  contentHash?: string
  approvalEvidence?: string
}): Promise<void> {
  const admin = getAdminSupabase()
  await admin.from('enterprise_approval_history').insert({
    organization_id: args.organizationId,
    campaign_id: args.campaignId,
    decision: args.decision,
    approved_version: args.approvedVersion ?? null,
    content_hash: args.contentHash || '',
    evidence: args.approvalEvidence || '',
  })

  await admin.from('enterprise_campaign_memory').update({
    approval_decision: args.decision,
    approved_version: args.approvedVersion ?? null,
    content_hash: args.contentHash || '',
    approval_evidence: args.approvalEvidence || '',
    approved_at: new Date().toISOString(),
  }).eq('organization_id', args.organizationId).eq('campaign_id', args.campaignId)
}

export async function invalidateMemory(organizationId: string): Promise<void> {
  const admin = getAdminSupabase()
  const nowIso = new Date().toISOString()
  await admin.from('enterprise_organizations').update({ status: 'invalidated', updated_at: nowIso }).eq('id', organizationId)
  await admin.from('enterprise_intelligence_snapshots').update({ status: 'invalidated' }).eq('organization_id', organizationId)
}

// ── Concurrency (Section 1.7): one running analysis per fingerprint ───────────
// acquireRefreshLock returns false if another analysis for the same fingerprint is
// already running (the unique partial index rejects the second insert).
export async function acquireRefreshLock(fingerprint: string, organizationId: string | null): Promise<string | null> {
  const admin = getAdminSupabase()
  const { data, error } = await admin
    .from('enterprise_memory_refresh_jobs')
    .insert({ fingerprint, organization_id: organizationId, status: 'running' })
    .select('id')
    .single()
  if (error || !data) return null
  return data.id
}

export async function releaseRefreshLock(jobId: string, status: 'completed' | 'failed'): Promise<void> {
  const admin = getAdminSupabase()
  await admin
    .from('enterprise_memory_refresh_jobs')
    .update({ status, finished_at: new Date().toISOString() })
    .eq('id', jobId)
}
