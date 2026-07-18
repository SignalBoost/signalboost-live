import { analyzePublicUrl } from '@/lib/enterprise/url-intelligence'
import {
  acquireRefreshLock,
  getIntelligenceSnapshot,
  mergeIntelligence,
  releaseRefreshLock,
  resolveOrganization,
} from '@/lib/enterprise/memory/service'
import { determineEnterpriseMemoryRefreshRequirements } from '@/lib/enterprise/memory/refreshPolicy'
import type { EnterpriseApprovalPackage, EnterpriseIntelligenceRequest, EnterpriseWorkspace } from './types'

function schemaLanguage(value?: string) {
  const code = (value || '').toLowerCase().split(/[-_]/)[0]
  return ({ en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian' } as Record<string, string>)[code] || 'English'
}

function creativeSuggestions(workspace: EnterpriseWorkspace): EnterpriseApprovalPackage['creativeSuggestions'] {
  const common = {
    authority: { id: 'authority', title: 'Authority and proof', description: 'Lead with credibility, evidence, and measurable value.', metadata: ['Trust', 'Proof', 'Value'] },
    education: { id: 'education', title: 'Educational narrative', description: 'Teach the problem and solution before presenting the next step.', metadata: ['Education', 'Clarity', 'CTA'] },
    demonstration: { id: 'demonstration', title: 'Workflow demonstration', description: 'Show the product, service, or creator workflow in action.', metadata: ['Demo', 'Process', 'Outcome'] },
    story: { id: 'story', title: 'Story-led direction', description: 'Use a clear narrative to create relevance and emotional connection.', metadata: ['Story', 'Identity', 'Retention'] },
    commerce: { id: 'commerce', title: 'Offer and conversion', description: 'Connect product benefits to a bounded offer and purchase action.', metadata: ['Offer', 'Benefits', 'Conversion'] },
  }
  if (workspace === 'creator' || workspace === 'podcast') return [common.education, common.story, common.demonstration]
  if (workspace === 'store') return [common.commerce, common.demonstration, common.authority]
  return [common.authority, common.demonstration, common.education]
}

function packageFromIntelligence(
  request: EnterpriseIntelligenceRequest,
  intelligence: Awaited<ReturnType<typeof analyzePublicUrl>>,
): EnterpriseApprovalPackage {
  const audienceConfidence = intelligence.detected.audiences.length
    ? Math.min(...intelligence.detected.audiences.map((item) => item.confidence))
    : 0

  return {
    workspace: request.workspace,
    sourceUrl: intelligence.finalUrl || intelligence.sourceUrl,
    organization: intelligence.organization || intelligence.title || '',
    description: intelligence.description || '',
    sourceType: intelligence.sourceType,
    classification: {
      industry: intelligence.detected.industry.value,
      audiences: intelligence.detected.audiences.map((item) => item.value),
      region: intelligence.detected.region.value,
      language: schemaLanguage(intelligence.metadata.language),
    },
    campaignPlan: {
      goal: intelligence.detected.goal.value,
      tone: intelligence.detected.tone.value,
      platforms: intelligence.detected.platforms.map((item) => item.value),
      format: intelligence.detected.format.value,
      offerType: intelligence.detected.offerType.value,
      ctaStrategy: intelligence.detected.ctaStrategy.value,
    },
    creativeSuggestions: creativeSuggestions(request.workspace),
    confidence: {
      industry: intelligence.detected.industry.confidence,
      audience: audienceConfidence,
      region: intelligence.detected.region.confidence,
      goal: intelligence.detected.goal.confidence,
      tone: intelligence.detected.tone.confidence,
      format: intelligence.detected.format.confidence,
      offerType: intelligence.detected.offerType.confidence,
      ctaStrategy: intelligence.detected.ctaStrategy.confidence,
    },
    requiresConfirmation: intelligence.requiresConfirmation,
    intelligence,
    approvalRequired: true,
  }
}

// Issue #205 Section 1.4 — memory-aware entry point. Consults Enterprise Memory
// before expensive analysis, reuses a valid snapshot, and refreshes only when stale.
export async function buildEnterpriseIntelligence(request: EnterpriseIntelligenceRequest): Promise<EnterpriseApprovalPackage> {
  // Resolve to a canonical organization (dedupes URL variants to one identity).
  let resolved: Awaited<ReturnType<typeof resolveOrganization>> | null = null
  try {
    resolved = await resolveOrganization(request.sourceUrl)
  } catch {
    // Memory unavailable (e.g. migration not yet applied) — fall back to direct analysis.
    const intelligence = await analyzePublicUrl(request.sourceUrl)
    return packageFromIntelligence(request, intelligence)
  }

  const { organization, fingerprint } = resolved
  const snapshot = await getIntelligenceSnapshot(organization.id, request.workspace)
  const requirements = determineEnterpriseMemoryRefreshRequirements(organization, snapshot)

  // Reuse valid intelligence.
  if (!requirements.snapshotStale && snapshot) {
    return snapshot.snapshot as unknown as EnterpriseApprovalPackage
  }

  // Refresh under a per-fingerprint lock so concurrent callers don't double-analyze.
  const jobId = await acquireRefreshLock(fingerprint, organization.id)
  if (!jobId) {
    // Another analysis is running. Prefer returning the last valid snapshot if present.
    if (snapshot) return snapshot.snapshot as unknown as EnterpriseApprovalPackage
    const intelligence = await analyzePublicUrl(request.sourceUrl)
    return packageFromIntelligence(request, intelligence)
  }

  try {
    const intelligence = await analyzePublicUrl(request.sourceUrl)
    const pkg = packageFromIntelligence(request, intelligence)
    await mergeIntelligence({
      organizationId: organization.id,
      workspace: request.workspace,
      snapshot: pkg as unknown as Record<string, unknown>,
      confidence: pkg.confidence,
      organizationPatch: {
        name: pkg.organization,
        industry: pkg.classification.industry,
        profile: { description: pkg.description, sourceType: pkg.sourceType },
        confidence: pkg.confidence.industry || 0,
      },
    })
    await releaseRefreshLock(jobId, 'completed')
    return pkg
  } catch (error) {
    await releaseRefreshLock(jobId, 'failed')
    // A failed refresh must not destroy the last valid snapshot.
    if (snapshot) return snapshot.snapshot as unknown as EnterpriseApprovalPackage
    throw error
  }
}
