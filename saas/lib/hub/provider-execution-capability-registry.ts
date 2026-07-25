import {
  assertProviderExecutionMode,
  createProviderExecutionPolicy,
  type ProviderExecutionCapability,
  type ProviderExecutionPolicy,
} from './provider-execution-modes'

export type ReviewedProviderExecutionCapability = Readonly<{
  templateId: string
  reviewedAt: string
  reviewer: string
  capabilities: readonly ProviderExecutionCapability[]
}>

const REVIEWED_CAPABILITIES = new Map<string, ReviewedProviderExecutionCapability>()

export function registerReviewedProviderExecutionCapability(
  registration: ReviewedProviderExecutionCapability,
): void {
  const templateId = String(registration.templateId || '').trim()
  const reviewer = String(registration.reviewer || '').trim()
  const reviewedAt = String(registration.reviewedAt || '').trim()

  if (!templateId) throw new Error('provider_capability_template_id_required')
  if (!reviewer) throw new Error('provider_capability_reviewer_required')
  if (!reviewedAt || Number.isNaN(Date.parse(reviewedAt))) {
    throw new Error('provider_capability_reviewed_at_invalid')
  }

  const policy = createProviderExecutionPolicy({ capabilities: registration.capabilities })
  for (const capability of policy.capabilities) {
    if (capability.available) assertProviderExecutionMode(policy, capability.mode)
  }

  REVIEWED_CAPABILITIES.set(templateId, Object.freeze({
    templateId,
    reviewer,
    reviewedAt,
    capabilities: policy.capabilities,
  }))
}

export function getProviderExecutionPolicy(templateId: string): ProviderExecutionPolicy {
  const normalized = String(templateId || '').trim()
  if (!normalized) throw new Error('provider_capability_template_id_required')

  const reviewed = REVIEWED_CAPABILITIES.get(normalized)
  if (!reviewed) return createProviderExecutionPolicy()

  return createProviderExecutionPolicy({ capabilities: reviewed.capabilities })
}

export function getReviewedProviderExecutionCapability(
  templateId: string,
): ReviewedProviderExecutionCapability | null {
  return REVIEWED_CAPABILITIES.get(String(templateId || '').trim()) ?? null
}

export function clearReviewedProviderExecutionCapabilitiesForTests(): void {
  REVIEWED_CAPABILITIES.clear()
}
