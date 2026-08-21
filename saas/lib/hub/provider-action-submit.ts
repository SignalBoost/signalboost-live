// saas/lib/hub/provider-action-submit.ts
import type { ProviderExecutionMode } from './provider-execution-modes.ts'

const ENGINE_PROVIDERS = new Set([
  'github',
  'openai',
  'elevenlabs',
  'anthropic',
  'gemini',
  'resend',
  'assemblyai',
  'supabase_mkt',
])

// Existing Supabase Insert Row needs the portable engine because that executor
// inspects the selected table and force-routes affiliate_partners to secondary.
const ENGINE_TEMPLATE_IDS = new Set([
  'supabase.insert_row',
])

export type ProviderActionSubmission = Readonly<{
  mode: ProviderExecutionMode
  endpoint: string | null
  body: Readonly<Record<string, unknown>>
  executesProviderMutation: boolean
  requiresOwnerApproval: boolean
  productLabel: string
}>

const PRODUCT_LABELS: Record<ProviderExecutionMode, string> = {
  direct: 'Direct API',
  cosa_pr: 'Governed AI infrastructure PR',
  browser_agent: 'Browser Agent assistance',
  manual: 'Direct configuration',
}

function directEndpoint(templateId: string): string {
  if (ENGINE_TEMPLATE_IDS.has(templateId)) return '/api/hub/action/engine'
  const provider = String(templateId || '').split('.')[0].toLowerCase()
  return ENGINE_PROVIDERS.has(provider) ? '/api/hub/action/engine' : '/api/hub/action'
}

export function planProviderActionSubmission(input: {
  templateId: string
  payload: Record<string, unknown>
  mode: ProviderExecutionMode
  browserAdapterId?: string
  approvedOrigin?: string
}): ProviderActionSubmission {
  const templateId = String(input.templateId || '').trim()
  if (!templateId) throw new Error('template_id_required')
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    throw new Error('provider_payload_required')
  }

  if (input.mode === 'direct') {
    return Object.freeze({
      mode: input.mode,
      endpoint: directEndpoint(templateId),
      body: Object.freeze({ templateId, payload: input.payload }),
      executesProviderMutation: true,
      requiresOwnerApproval: true,
      productLabel: PRODUCT_LABELS[input.mode],
    })
  }

  if (input.mode === 'cosa_pr') {
    return Object.freeze({
      mode: input.mode,
      endpoint: '/api/hub/action/cosa-pr',
      body: Object.freeze({ templateId, payload: input.payload }),
      executesProviderMutation: false,
      requiresOwnerApproval: true,
      productLabel: PRODUCT_LABELS[input.mode],
    })
  }

  if (input.mode === 'browser_agent') {
    const browserAdapterId = String(input.browserAdapterId || '').trim()
    const approvedOrigin = String(input.approvedOrigin || '').trim()
    if (!browserAdapterId) throw new Error('browser_adapter_required')
    if (!approvedOrigin) throw new Error('browser_approved_origin_required')

    return Object.freeze({
      mode: input.mode,
      endpoint: '/api/hub/action/browser-agent/dry-run',
      body: Object.freeze({ templateId, payload: input.payload, browserAdapterId, approvedOrigin }),
      executesProviderMutation: false,
      requiresOwnerApproval: true,
      productLabel: PRODUCT_LABELS[input.mode],
    })
  }

  return Object.freeze({
    mode: input.mode,
    endpoint: null,
    body: Object.freeze({ templateId, payload: input.payload }),
    executesProviderMutation: false,
    requiresOwnerApproval: false,
    productLabel: PRODUCT_LABELS[input.mode],
  })
}
