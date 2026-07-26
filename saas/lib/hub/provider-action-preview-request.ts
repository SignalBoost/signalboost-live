// saas/lib/hub/provider-action-preview-request.ts
import { buildProviderActionPreview, type ProviderActionPreview } from './provider-action-preview.ts'
import { getProviderExecutionPolicy } from './provider-execution-capability-registry.ts'
import {
  type ProviderExecutionMode,
  type ProviderExecutionPolicy,
} from './provider-execution-modes.ts'
import { getTemplate, validateTemplatePayload } from './provider-templates.ts'

export type ProviderActionPreviewRequest = Readonly<{
  templateId: string
  payload: Record<string, unknown>
  mode?: ProviderExecutionMode
  policy?: ProviderExecutionPolicy
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

  // Dedicated routes may inject a narrower policy. Otherwise the shared preview
  // resolves only capabilities that were explicitly reviewed for this template.
  // Unregistered templates fail safely to Direct API + Direct configuration.
  const policy = request.policy ?? getProviderExecutionPolicy(templateId)
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
    approvalRequired: Boolean(template.requiresConfirm || template.previewBeforeSubmit || mode !== 'direct'),
    expectedVerification: mode === 'direct'
      ? `Verify the ${provider} response and the resulting provider state.`
      : mode === 'cosa_pr'
        ? `Review the staged proposal, merge only after owner approval, then verify the resulting ${provider} state.`
        : `Review and apply the redacted configuration, then verify the resulting ${provider} state.`,
  })

  return Object.freeze({ preview, policy })
}
