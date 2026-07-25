import { planProviderActionSubmission, type ProviderActionSubmission } from './provider-action-submit'
import type { ProviderExecutionMode } from './provider-execution-modes'

export type ProviderCapabilityResponse = Readonly<{
  ok: boolean
  error?: string
  preferredMode?: ProviderExecutionMode
  availableModes?: readonly ProviderExecutionMode[]
  browserAdapterId?: string | null
  approvedOrigins?: readonly string[]
}>

export type ProviderActionClientRequest = Readonly<{
  templateId: string
  payload: Record<string, unknown>
  mode: ProviderExecutionMode
  capabilities: ProviderCapabilityResponse
}>

export type ProviderActionClientPlan = ProviderActionSubmission & Readonly<{
  approvedOrigin?: string
}>

export function chooseReviewedProviderMode(
  requested: ProviderExecutionMode,
  capabilities: ProviderCapabilityResponse,
): ProviderExecutionMode {
  if (!capabilities.ok) throw new Error(capabilities.error || 'provider_capabilities_unavailable')

  const available = [...(capabilities.availableModes || [])]
  if (available.length === 0) throw new Error('provider_execution_mode_unavailable')
  if (available.includes(requested)) return requested
  if (capabilities.preferredMode && available.includes(capabilities.preferredMode)) {
    return capabilities.preferredMode
  }
  return available[0]
}

export function buildProviderActionClientPlan(
  request: ProviderActionClientRequest,
): ProviderActionClientPlan {
  const mode = chooseReviewedProviderMode(request.mode, request.capabilities)
  const approvedOrigin = mode === 'browser_agent'
    ? String(request.capabilities.approvedOrigins?.[0] || '').trim()
    : undefined
  const browserAdapterId = mode === 'browser_agent'
    ? String(request.capabilities.browserAdapterId || '').trim()
    : undefined

  const plan = planProviderActionSubmission({
    templateId: request.templateId,
    payload: request.payload,
    mode,
    browserAdapterId,
    approvedOrigin,
  })

  return Object.freeze({ ...plan, approvedOrigin })
}

export async function submitProviderActionClientPlan(
  plan: ProviderActionClientPlan,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  if (!plan.endpoint) {
    return Object.freeze({
      ok: true,
      mode: plan.mode,
      productLabel: plan.productLabel,
      executesProviderMutation: false,
      message: 'No automated provider request is sent for Direct configuration.',
      data: plan.body,
    })
  }

  const response = await fetcher(plan.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(plan.body),
  })
  const data = await response.json()
  if (!response.ok) {
    const message = data?.error || 'provider_action_submission_failed'
    throw new Error(message)
  }
  return data
}
