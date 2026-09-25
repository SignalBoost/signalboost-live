// saas/lib/ai/modelTransportPlugin.ts
import type { PlatformModelProfile, ModelTransportProtocol } from './modelCapabilityRegistry.ts'
import type {
  ModelTransportAdapter,
  ModelTransportHealth,
  PlatformModelRequest,
  PlatformModelResponse,
} from './modelTransportAdapter.ts'

export type HostInjectedModelTransportProtocol = Extract<
  ModelTransportProtocol,
  'native_sdk' | 'local_runtime' | 'custom_http'
>

export interface HostInjectedModelTransportDriver {
  readonly id: string
  readonly protocol: HostInjectedModelTransportProtocol
  supports(profile: PlatformModelProfile): boolean
  health(profile: PlatformModelProfile): Promise<ModelTransportHealth>
  invoke(request: PlatformModelRequest): Promise<PlatformModelResponse>
}

function required(value: unknown, code: string, max: number): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized.length > max) throw new Error(code)
  return normalized
}

function normalizedResponse(
  profile: PlatformModelProfile,
  protocol: HostInjectedModelTransportProtocol,
  response: PlatformModelResponse,
): PlatformModelResponse {
  const provider = required(response.provider, 'platform_model_plugin_provider_invalid', 120)
  const model = required(response.model, 'platform_model_plugin_model_invalid', 240)
  if (model !== profile.providerModelId && model !== profile.modelId) {
    throw new Error('platform_model_plugin_response_model_mismatch')
  }
  if (!Array.isArray(response.toolCalls) || response.toolCalls.length > 64) {
    throw new Error('platform_model_plugin_tool_calls_invalid')
  }
  for (const call of response.toolCalls) {
    required(call.id, 'platform_model_plugin_tool_call_id_invalid', 240)
    required(call.name, 'platform_model_plugin_tool_call_name_invalid', 128)
    if (typeof call.arguments !== 'string' || call.arguments.length > 128_000) {
      throw new Error('platform_model_plugin_tool_call_arguments_invalid')
    }
  }
  if (response.text !== null && (typeof response.text !== 'string' || response.text.length > 2_000_000)) {
    throw new Error('platform_model_plugin_text_invalid')
  }
  const safeCount = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
  return Object.freeze({
    text: response.text,
    toolCalls: Object.freeze(response.toolCalls.map(call => Object.freeze({ ...call }))),
    finishReason: response.finishReason ? required(response.finishReason, 'platform_model_plugin_finish_reason_invalid', 120) : null,
    provider,
    model,
    inputTokens: safeCount(response.inputTokens),
    outputTokens: safeCount(response.outputTokens),
    requestId: response.requestId ? required(response.requestId, 'platform_model_plugin_request_id_invalid', 240) : null,
  })
}

/**
 * Buyer-facing plug-in boundary for transports iTMounts cannot safely guess.
 * The driver owns its SDK/wire format; iTMounts still owns model capability checks,
 * routing authority, certification, spend governance and response normalization.
 */
export function createHostInjectedModelTransportAdapter(driver: HostInjectedModelTransportDriver): ModelTransportAdapter {
  const id = required(driver.id, 'platform_model_plugin_id_invalid', 160)
  if (!['native_sdk','local_runtime','custom_http'].includes(driver.protocol)) {
    throw new Error('platform_model_plugin_protocol_invalid')
  }
  return Object.freeze({
    id,
    protocol: driver.protocol,
    supports(profile) {
      return profile.transportProtocols.includes(driver.protocol) && driver.supports(profile)
    },
    async health(profile) {
      if (!profile.transportProtocols.includes(driver.protocol) || !driver.supports(profile)) {
        return Object.freeze({ ok:false, provider:id, model:profile.providerModelId, error:'profile_not_supported' })
      }
      const health = await driver.health(profile)
      return Object.freeze({
        ok: Boolean(health.ok),
        provider: required(health.provider, 'platform_model_plugin_health_provider_invalid', 120),
        model: health.model ? required(health.model, 'platform_model_plugin_health_model_invalid', 240) : null,
        error: health.error ? required(health.error, 'platform_model_plugin_health_error_invalid', 240) : null,
      })
    },
    async chat(request) {
      if (!request.profile.transportProtocols.includes(driver.protocol) || !driver.supports(request.profile)) {
        throw new Error('platform_model_plugin_profile_not_supported')
      }
      return normalizedResponse(request.profile, driver.protocol, await driver.invoke(request))
    },
  })
}

export type ModelTransportConformanceCheck = Readonly<{
  id: 'supports' | 'health' | 'chat' | 'json' | 'tool'
  status: 'passed' | 'failed' | 'not_applicable'
  error: string | null
}>

export async function runModelTransportPluginConformance(input: {
  profile: PlatformModelProfile
  adapter: ModelTransportAdapter
}): Promise<readonly ModelTransportConformanceCheck[]> {
  const checks: ModelTransportConformanceCheck[] = []
  const push = (id: ModelTransportConformanceCheck['id'], status: ModelTransportConformanceCheck['status'], error: unknown = null) =>
    checks.push(Object.freeze({ id, status, error: error ? String(error instanceof Error ? error.message : error).slice(0,240) : null }))

  if (!input.adapter.supports(input.profile)) {
    push('supports','failed','profile_not_supported')
    return Object.freeze(checks)
  }
  push('supports','passed')

  try {
    const health = await input.adapter.health(input.profile)
    if (!health.ok) throw new Error(health.error || 'health_failed')
    push('health','passed')
  } catch (error) {
    push('health','failed',error)
    return Object.freeze(checks)
  }

  try {
    const response = await input.adapter.chat({
      profile:input.profile,
      messages:[{ role:'user', content:'Reply exactly ITMOUNTS_PLUGIN_OK.' }],
      maxOutputTokens:32, temperature:0, timeoutMs:30_000,
    })
    if (!String(response.text || '').includes('ITMOUNTS_PLUGIN_OK')) throw new Error('chat_marker_missing')
    push('chat','passed')
  } catch (error) { push('chat','failed',error) }

  if (input.profile.inference.structuredJson === 'validated') {
    try {
      const response = await input.adapter.chat({
        profile:input.profile,
        messages:[{ role:'user', content:'Return JSON with ok=true.' }],
        jsonObject:true,
        jsonSchema:{ type:'object', properties:{ ok:{ type:'boolean' } }, required:['ok'], additionalProperties:false },
        maxOutputTokens:64, temperature:0, timeoutMs:30_000,
      })
      const parsed = JSON.parse(String(response.text || ''))
      if (parsed?.ok !== true) throw new Error('json_marker_missing')
      push('json','passed')
    } catch (error) { push('json','failed',error) }
  } else push('json','not_applicable')

  if (input.profile.inference.toolCalling === 'validated') {
    try {
      const response = await input.adapter.chat({
        profile:input.profile,
        messages:[{ role:'user', content:'Call itmounts_plugin_echo with token ok.' }],
        tools:[{ name:'itmounts_plugin_echo', parameters:{ type:'object', properties:{ token:{ type:'string' } }, required:['token'], additionalProperties:false } }],
        toolChoice:{ name:'itmounts_plugin_echo' },
        maxOutputTokens:64, temperature:0, timeoutMs:30_000,
      })
      const call=response.toolCalls.find(item=>item.name==='itmounts_plugin_echo')
      if(!call) throw new Error('tool_call_missing')
      push('tool','passed')
    } catch (error) { push('tool','failed',error) }
  } else push('tool','not_applicable')

  return Object.freeze(checks)
}
