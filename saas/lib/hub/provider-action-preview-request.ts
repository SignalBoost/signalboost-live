import { buildProviderActionPreview, type ProviderActionPreview } from './provider-action-preview'
import {
  createProviderExecutionPolicy,
  type ProviderExecutionMode,
  type ProviderExecutionPolicy,
} from './provider-execution-modes'
import { getTemplate, validateTemplatePayload } from './provider-templates'

export type ProviderActionPreviewRequest = Readonly<{
  templateId: string
  payload: Record<string, unknown>
  mode?: ProviderExecutionMode
}>

export type ProviderActionPreviewResult = Readonly<{
  preview: ProviderActionPreview
  policy: ProviderExecutionPolicy
}>

export function buildProviderActionPreviewFromRequest(
  request: ProviderActionPreviewRequest,
): ProviderActionPreviewResult {
  const templateId = String(request.templateId || '').trim()
  if (!templateId) throw new Error('template_id_required')

  const template = getTemplate(templateId)
  if (!template) throw new Error('provider_template_not_found')

  if (!request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)) {
    throw new Error('provider_payload_required')
  }

  const validation = validateTemplatePayload(templateId, request.payload)
  if (!validation.ok) throw new Error('provider_payload_invalid')

  // Legacy templates currently expose only implemented paths: authenticated direct
  // execution plus a non-executing direct-configuration fallback. COSA PR and
  // Browser Agent remain hidden until a template-specific capability is reviewed.
  const policy = createProviderExecutionPolicy()
  const mode = request.mode ?? policy.preferredMode
  const provider = String(template.api.service || templateId.split('.')[0]).toLowerCase()
  const target = `${template.api.method} ${template.api.endpoint}`

  const preview = buildProviderActionPreview({
    templateId,
    provider,
    target,
    payload: request.payload,
    mode,
    policy,
    approvalRequired: Boolean(template.requiresConfirm || template.previewBeforeSubmit),
    expectedVerification: mode === 'direct'
      ? `Verify the ${provider} response and the resulting provider state.`
      : `Review and apply the redacted configuration, then verify the resulting ${provider} state.`,
  })

  return Object.freeze({ preview, policy })
}
