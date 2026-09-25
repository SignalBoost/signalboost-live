// saas/lib/ai/modelTransportAdapters.ts
import { requireModelCapability, type PlatformModelProfile } from './modelCapabilityRegistry.ts'
import type {
  ModelTransportAdapter,
  ModelTransportHealth,
  PlatformModelMessage,
  PlatformModelRequest,
  PlatformModelResponse,
  PlatformModelToolCall,
} from './modelTransportAdapter.ts'
import {
  configuredModelTransportBindings,
  type PlatformModelTransportBinding,
} from './modelTransportConfig.ts'

type Env = Record<string, string | undefined>
type FetchPort = typeof fetch
type CredentialResolver = (credentialRef: string) => Promise<string | null>

function clean(value: unknown, max = 200_000): string {
  return String(value ?? '').trim().slice(0, max)
}

function positiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

async function credentialFor(binding: PlatformModelTransportBinding, env: Env, resolveCredential?: CredentialResolver): Promise<string> {
  if (binding.credentialEnv) return clean(env[binding.credentialEnv], 8192)
  if (binding.credentialRef && resolveCredential) return clean(await resolveCredential(binding.credentialRef), 8192)
  return ''
}

function bindingEndpoint(binding: PlatformModelTransportBinding): URL {
  const fallback = binding.protocol === 'anthropic_messages'
    ? 'https://api.anthropic.com/v1/messages'
    : binding.protocol === 'google_generate_content'
      ? 'https://generativelanguage.googleapis.com/v1beta/models'
      : ''
  const raw = binding.endpoint || fallback
  if (!raw) throw new Error(`platform_model_transport_endpoint_missing:${binding.profileKey}`)
  const url = new URL(raw)
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) {
    throw new Error(`platform_model_transport_endpoint_invalid:${binding.profileKey}`)
  }
  return url
}

async function readJson(response: Response): Promise<any> {
  const raw = await response.text()
  try { return raw ? JSON.parse(raw) : {} } catch { throw new Error('platform_model_transport_response_invalid_json') }
}

function requestCapabilities(request: PlatformModelRequest): void {
  requireModelCapability(request.profile, 'inference', 'chatCompletion')
  if (request.tools?.length) requireModelCapability(request.profile, 'inference', 'toolCalling')
  if (request.jsonObject === true) requireModelCapability(request.profile, 'inference', 'structuredJson')
}

function systemText(messages: readonly PlatformModelMessage[]): string {
  return messages.filter(message => message.role === 'system').map(message => clean(message.content, 40_000)).filter(Boolean).join('\n\n')
}

function nonSystemMessages(messages: readonly PlatformModelMessage[]): readonly PlatformModelMessage[] {
  return messages.filter(message => message.role !== 'system')
}

function parseArgs(argumentsText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsText || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not_object')
    return parsed as Record<string, unknown>
  } catch {
    throw new Error('platform_model_transport_tool_arguments_invalid')
  }
}

async function configuredHealth(profile: PlatformModelProfile, binding: PlatformModelTransportBinding, env: Env, resolveCredential?: CredentialResolver): Promise<ModelTransportHealth> {
  const credentialRequired = binding.protocol === 'anthropic_messages' || binding.protocol === 'google_generate_content' || Boolean(binding.credentialEnv || binding.credentialRef)
  const credential = await credentialFor(binding, env, resolveCredential)
  if (credentialRequired && !credential) {
    return Object.freeze({ ok: false, provider: binding.provider, model: profile.providerModelId, error: 'credential_missing' })
  }
  try {
    bindingEndpoint(binding)
    return Object.freeze({ ok: true, provider: binding.provider, model: profile.providerModelId, error: null })
  } catch (error) {
    return Object.freeze({
      ok: false,
      provider: binding.provider,
      model: profile.providerModelId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function responseBase(args: {
  text: string | null
  toolCalls?: readonly PlatformModelToolCall[]
  finishReason?: unknown
  provider: string
  model: string
  inputTokens?: unknown
  outputTokens?: unknown
  requestId?: unknown
}): PlatformModelResponse {
  const intOrNull = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
  return Object.freeze({
    text: args.text,
    toolCalls: Object.freeze([...(args.toolCalls || [])]),
    finishReason: clean(args.finishReason, 120) || null,
    provider: args.provider,
    model: args.model,
    inputTokens: intOrNull(args.inputTokens),
    outputTokens: intOrNull(args.outputTokens),
    requestId: clean(args.requestId, 240) || null,
  })
}

function openAiMessages(messages: readonly PlatformModelMessage[]): any[] {
  return messages.map(message => {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls.map(call => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      }
    }
    if (message.role === 'tool') {
      if (!message.toolCallId) throw new Error('platform_model_transport_tool_result_id_missing')
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content || '' }
    }
    return { role: message.role, content: message.content || '' }
  })
}

function createOpenAiCompatibleAdapter(binding: PlatformModelTransportBinding, env: Env, fetchImpl: FetchPort, resolveCredential?: CredentialResolver): ModelTransportAdapter {
  return Object.freeze({
    id: `builtin:${binding.profileKey}:openai_compatible`,
    protocol: 'openai_compatible' as const,
    supports: profile => profile.key === binding.profileKey && profile.transportProtocols.includes('openai_compatible'),
    health: async profile => configuredHealth(profile, binding, env, resolveCredential),
    async chat(request) {
      requestCapabilities(request)
      if (!request.profile.transportProtocols.includes('openai_compatible')) throw new Error('platform_model_transport_profile_mismatch')
      const endpoint = bindingEndpoint(binding)
      const credential = await credentialFor(binding, env, resolveCredential)
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        },
        signal: AbortSignal.timeout(positiveInt(request.timeoutMs, binding.timeoutMs, 1_000, 300_000)),
        body: JSON.stringify({
          model: request.profile.providerModelId,
          max_tokens: positiveInt(request.maxOutputTokens, 2048, 1, 65_536),
          temperature: request.temperature ?? 0.2,
          ...(request.jsonObject ? { response_format: request.jsonSchema
            ? { type: 'json_schema', json_schema: { name: 'itmounts_output', schema: request.jsonSchema, strict: true } }
            : { type: 'json_object' } } : {}),
          ...(request.tools?.length ? {
            tools: request.tools.map(tool => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.parameters },
            })),
            tool_choice: request.toolChoice === 'none'
              ? 'none'
              : request.toolChoice && request.toolChoice !== 'auto'
                ? { type: 'function', function: { name: request.toolChoice.name } }
                : 'auto',
          } : {}),
          messages: openAiMessages(request.messages),
        }),
      })
      const payload = await readJson(response)
      if (!response.ok) throw new Error(`platform_model_transport_http_${response.status}:${binding.provider}`)
      const choice = payload?.choices?.[0]
      const toolCalls: PlatformModelToolCall[] = Array.isArray(choice?.message?.tool_calls)
        ? choice.message.tool_calls.flatMap((call: any) => {
            const id = clean(call?.id, 240)
            const name = clean(call?.function?.name, 128)
            const argumentsText = typeof call?.function?.arguments === 'string' ? call.function.arguments : ''
            return id && name ? [Object.freeze({ id, name, arguments: argumentsText })] : []
          })
        : []
      return responseBase({
        text: typeof choice?.message?.content === 'string' && choice.message.content.length ? choice.message.content : null,
        toolCalls,
        finishReason: choice?.finish_reason,
        provider: binding.provider,
        model: request.profile.providerModelId,
        inputTokens: payload?.usage?.prompt_tokens,
        outputTokens: payload?.usage?.completion_tokens,
        requestId: response.headers.get('x-request-id') || payload?.id,
      })
    },
  })
}

function anthropicMessages(messages: readonly PlatformModelMessage[]): any[] {
  return nonSystemMessages(messages).map(message => {
    if (message.role === 'tool') {
      if (!message.toolCallId) throw new Error('platform_model_transport_tool_result_id_missing')
      return { role: 'user', content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content || '' }] }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: [
          ...(message.content ? [{ type: 'text', text: message.content }] : []),
          ...message.toolCalls.map(call => ({ type: 'tool_use', id: call.id, name: call.name, input: parseArgs(call.arguments) })),
        ],
      }
    }
    return { role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content || '' }
  })
}

function createAnthropicAdapter(binding: PlatformModelTransportBinding, env: Env, fetchImpl: FetchPort, resolveCredential?: CredentialResolver): ModelTransportAdapter {
  return Object.freeze({
    id: `builtin:${binding.profileKey}:anthropic_messages`,
    protocol: 'anthropic_messages' as const,
    supports: profile => profile.key === binding.profileKey && profile.transportProtocols.includes('anthropic_messages'),
    health: async profile => configuredHealth(profile, binding, env, resolveCredential),
    async chat(request) {
      requestCapabilities(request)
      if (!request.profile.transportProtocols.includes('anthropic_messages')) throw new Error('platform_model_transport_profile_mismatch')
      const credential = await credentialFor(binding, env, resolveCredential)
      if (!credential) throw new Error('platform_model_transport_credential_missing')
      if (request.jsonObject && !request.jsonSchema) throw new Error('platform_model_transport_json_schema_required:anthropic_messages')
      if (request.jsonSchema && request.jsonSchema.additionalProperties !== false) throw new Error('platform_model_transport_json_schema_additional_properties_must_be_false:anthropic_messages')
      const response = await fetchImpl(bindingEndpoint(binding), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': credential,
          'anthropic-version': binding.apiVersion || '2023-06-01',
        },
        signal: AbortSignal.timeout(positiveInt(request.timeoutMs, binding.timeoutMs, 1_000, 300_000)),
        body: JSON.stringify({
          model: request.profile.providerModelId,
          max_tokens: positiveInt(request.maxOutputTokens, 2048, 1, 65_536),
          temperature: request.temperature ?? 0.2,
          ...(systemText(request.messages) ? { system: systemText(request.messages) } : {}),
          ...(request.jsonObject ? {
            output_config: { format: { type: 'json_schema', schema: request.jsonSchema } },
          } : {}),
          ...(request.tools?.length ? {
            tools: request.tools.map(tool => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.parameters,
            })),
            tool_choice: request.toolChoice === 'none'
              ? { type: 'none' }
              : request.toolChoice && request.toolChoice !== 'auto'
                ? { type: 'tool', name: request.toolChoice.name }
                : { type: 'auto' },
          } : {}),
          messages: anthropicMessages(request.messages),
        }),
      })
      const payload = await readJson(response)
      if (!response.ok) throw new Error(`platform_model_transport_http_${response.status}:${binding.provider}`)
      const blocks = Array.isArray(payload?.content) ? payload.content : []
      const text = blocks.filter((block: any) => block?.type === 'text').map((block: any) => clean(block.text)).filter(Boolean).join('\n') || null
      const toolCalls: PlatformModelToolCall[] = blocks.flatMap((block: any) => {
        if (block?.type !== 'tool_use') return []
        const id = clean(block.id, 240)
        const name = clean(block.name, 128)
        return id && name ? [Object.freeze({ id, name, arguments: JSON.stringify(block.input || {}) })] : []
      })
      return responseBase({
        text,
        toolCalls,
        finishReason: payload?.stop_reason,
        provider: binding.provider,
        model: request.profile.providerModelId,
        inputTokens: payload?.usage?.input_tokens,
        outputTokens: payload?.usage?.output_tokens,
        requestId: response.headers.get('request-id') || response.headers.get('x-request-id'),
      })
    },
  })
}

function syntheticGeminiId(name: string, index: number): string {
  return `synthetic:${name || 'tool'}:${index}`
}

function geminiContents(messages: readonly PlatformModelMessage[]): any[] {
  return nonSystemMessages(messages).map(message => {
    if (message.role === 'tool') {
      if (!message.toolCallId) throw new Error('platform_model_transport_tool_result_id_missing')
      const synthetic = message.toolCallId.startsWith('synthetic:')
      const name = clean(message.toolName, 128)
      if (!name) throw new Error('platform_model_transport_tool_result_name_missing:google_generate_content')
      return {
        role: 'user',
        parts: [{
          functionResponse: {
            ...(synthetic ? {} : { id: message.toolCallId }),
            name,
            response: { result: message.content || '' },
          },
        }],
      }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'model',
        parts: [
          ...(message.content ? [{ text: message.content }] : []),
          ...message.toolCalls.map(call => ({
            functionCall: {
              ...(call.id.startsWith('synthetic:') ? {} : { id: call.id }),
              name: call.name,
              args: parseArgs(call.arguments),
            },
          })),
        ],
      }
    }
    return { role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content || '' }] }
  })
}

function createGoogleAdapter(binding: PlatformModelTransportBinding, env: Env, fetchImpl: FetchPort, resolveCredential?: CredentialResolver): ModelTransportAdapter {
  return Object.freeze({
    id: `builtin:${binding.profileKey}:google_generate_content`,
    protocol: 'google_generate_content' as const,
    supports: profile => profile.key === binding.profileKey && profile.transportProtocols.includes('google_generate_content'),
    health: async profile => configuredHealth(profile, binding, env, resolveCredential),
    async chat(request) {
      requestCapabilities(request)
      if (!request.profile.transportProtocols.includes('google_generate_content')) throw new Error('platform_model_transport_profile_mismatch')
      const credential = await credentialFor(binding, env, resolveCredential)
      if (!credential) throw new Error('platform_model_transport_credential_missing')
      const endpoint = bindingEndpoint(binding)
      endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${encodeURIComponent(request.profile.providerModelId)}:generateContent`
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': credential },
        signal: AbortSignal.timeout(positiveInt(request.timeoutMs, binding.timeoutMs, 1_000, 300_000)),
        body: JSON.stringify({
          ...(systemText(request.messages) ? { systemInstruction: { parts: [{ text: systemText(request.messages) }] } } : {}),
          contents: geminiContents(request.messages),
          ...(request.tools?.length ? {
            tools: [{ functionDeclarations: request.tools.map(tool => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            })) }],
            ...(request.toolChoice === 'none' ? { toolConfig: { functionCallingConfig: { mode: 'NONE' } } }
              : request.toolChoice && request.toolChoice !== 'auto'
                ? { toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [request.toolChoice.name] } } }
                : {}),
          } : {}),
          generationConfig: {
            maxOutputTokens: positiveInt(request.maxOutputTokens, 2048, 1, 65_536),
            temperature: request.temperature ?? 0.2,
            ...(request.jsonObject ? { responseMimeType: 'application/json', ...(request.jsonSchema ? { responseSchema: request.jsonSchema } : {}) } : {}),
          },
        }),
      })
      const payload = await readJson(response)
      if (!response.ok) throw new Error(`platform_model_transport_http_${response.status}:${binding.provider}`)
      const candidate = payload?.candidates?.[0]
      const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
      const text = parts.filter((part: any) => typeof part?.text === 'string' && part?.thought !== true).map((part: any) => part.text).join('\n') || null
      const toolCalls: PlatformModelToolCall[] = parts.flatMap((part: any, index: number) => {
        const call = part?.functionCall
        if (!call?.name) return []
        const name = clean(call.name, 128)
        const id = clean(call.id, 240) || syntheticGeminiId(name, index)
        return name ? [Object.freeze({ id, name, arguments: JSON.stringify(call.args || {}) })] : []
      })
      return responseBase({
        text,
        toolCalls,
        finishReason: candidate?.finishReason,
        provider: binding.provider,
        model: request.profile.providerModelId,
        inputTokens: payload?.usageMetadata?.promptTokenCount,
        outputTokens: payload?.usageMetadata?.candidatesTokenCount,
        requestId: response.headers.get('x-goog-request-id') || response.headers.get('x-request-id'),
      })
    },
  })
}

export function createBuiltinModelTransportAdapters(input: {
  profiles: readonly PlatformModelProfile[]
  bindings?: readonly PlatformModelTransportBinding[]
  env?: Env
  fetchImpl?: FetchPort
  resolveCredential?: CredentialResolver
}): readonly ModelTransportAdapter[] {
  const env = input.env || process.env
  const fetchImpl = input.fetchImpl || fetch
  const bindings = input.bindings || configuredModelTransportBindings(env)
  const profiles = new Map(input.profiles.map(profile => [profile.key, profile]))
  const adapters: ModelTransportAdapter[] = []
  for (const binding of bindings) {
    const profile = profiles.get(binding.profileKey)
    if (!profile || !profile.transportProtocols.includes(binding.protocol)) continue
    if (binding.protocol === 'openai_compatible') adapters.push(createOpenAiCompatibleAdapter(binding, env, fetchImpl, input.resolveCredential))
    else if (binding.protocol === 'anthropic_messages') adapters.push(createAnthropicAdapter(binding, env, fetchImpl, input.resolveCredential))
    else if (binding.protocol === 'google_generate_content') adapters.push(createGoogleAdapter(binding, env, fetchImpl, input.resolveCredential))
    // native_sdk, local_runtime and custom_http require an injected host adapter by design.
  }
  return Object.freeze(adapters)
}
