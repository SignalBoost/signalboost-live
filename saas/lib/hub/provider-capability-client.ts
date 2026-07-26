// saas/lib/hub/provider-capability-client.ts
import type {
  ProviderCapabilityResponse,
  ProviderCapabilityReview,
  ReviewedProviderCapabilitySnapshot,
} from './provider-action-client.ts'
import type { ProviderExecutionMode } from './provider-execution-modes.ts'

export type ProviderCapabilityRouteItem = Readonly<{
  mode: ProviderExecutionMode
  available: boolean
  reason?: string
  endpoint?: string | null
  browserAdapterId?: string | null
  approvedOrigin?: string | null
}>

export type ProviderCapabilityRouteResponse = Readonly<{
  ok: boolean
  error?: string
  preferredMode?: ProviderExecutionMode
  capabilities?: readonly ProviderCapabilityRouteItem[]
  review?: ProviderCapabilityReview | null
}>

export function normalizeProviderCapabilityResponse(
  response: ProviderCapabilityRouteResponse,
): ProviderCapabilityResponse {
  if (!response.ok) {
    return Object.freeze({
      ok: false,
      error: response.error || 'provider_capabilities_unavailable',
      availableModes: Object.freeze([]),
      browserAdapterId: null,
      approvedOrigins: Object.freeze([]),
      reviewedCapabilities: Object.freeze([]),
      review: null,
    })
  }

  const reviewedCapabilities = Object.freeze(
    (response.capabilities || [])
      .filter(capability => capability.available)
      .map(capability => Object.freeze({ ...capability, available: true as const })) as readonly ReviewedProviderCapabilitySnapshot[],
  )
  const availableModes = Object.freeze(reviewedCapabilities.map(capability => capability.mode))
  const browser = reviewedCapabilities.find(capability => capability.mode === 'browser_agent')
  const browserAdapterId = String(browser?.browserAdapterId || '').trim() || null
  const approvedOrigin = String(browser?.approvedOrigin || '').trim()
  const approvedOrigins = Object.freeze(approvedOrigin ? [approvedOrigin] : [])
  const preferredMode = response.preferredMode && availableModes.includes(response.preferredMode)
    ? response.preferredMode
    : availableModes[0]
  const review = response.review
    ? Object.freeze({ reviewer: response.review.reviewer, reviewedAt: response.review.reviewedAt })
    : null

  return Object.freeze({
    ok: availableModes.length > 0,
    error: availableModes.length > 0 ? undefined : 'provider_execution_mode_unavailable',
    preferredMode,
    availableModes,
    browserAdapterId,
    approvedOrigins,
    reviewedCapabilities,
    review,
  })
}

export async function discoverReviewedProviderCapabilities(
  templateId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ProviderCapabilityResponse> {
  const normalizedTemplateId = String(templateId || '').trim()
  if (!normalizedTemplateId) {
    return normalizeProviderCapabilityResponse({ ok: false, error: 'template_id_required' })
  }

  try {
    const response = await fetcher('/api/hub/action/capabilities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId: normalizedTemplateId }),
      signal,
    })
    const data = await response.json() as ProviderCapabilityRouteResponse

    if (!response.ok) {
      return normalizeProviderCapabilityResponse({
        ok: false,
        error: data?.error || 'provider_capabilities_unavailable',
      })
    }

    return normalizeProviderCapabilityResponse(data)
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error
    return normalizeProviderCapabilityResponse({ ok: false, error: 'provider_capabilities_unavailable' })
  }
}
