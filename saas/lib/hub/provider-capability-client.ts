import type { ProviderCapabilityResponse } from './provider-action-client'
import type { ProviderExecutionMode } from './provider-execution-modes'

export type ProviderCapabilityRouteItem = Readonly<{
  mode: ProviderExecutionMode
  available: boolean
  browserAdapterId?: string | null
  approvedOrigin?: string | null
}>

export type ProviderCapabilityRouteResponse = Readonly<{
  ok: boolean
  error?: string
  preferredMode?: ProviderExecutionMode
  capabilities?: readonly ProviderCapabilityRouteItem[]
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
    })
  }

  const reviewed = (response.capabilities || []).filter(capability => capability.available)
  const availableModes = Object.freeze(reviewed.map(capability => capability.mode))
  const browser = reviewed.find(capability => capability.mode === 'browser_agent')
  const browserAdapterId = String(browser?.browserAdapterId || '').trim() || null
  const approvedOrigin = String(browser?.approvedOrigin || '').trim()
  const approvedOrigins = Object.freeze(approvedOrigin ? [approvedOrigin] : [])
  const preferredMode = response.preferredMode && availableModes.includes(response.preferredMode)
    ? response.preferredMode
    : availableModes[0]

  return Object.freeze({
    ok: availableModes.length > 0,
    error: availableModes.length > 0 ? undefined : 'provider_execution_mode_unavailable',
    preferredMode,
    availableModes,
    browserAdapterId,
    approvedOrigins,
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
