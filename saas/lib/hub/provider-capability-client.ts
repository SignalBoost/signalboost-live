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
