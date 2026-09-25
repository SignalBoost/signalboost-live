// saas/lib/ai/modelTransportAdapter.ts
import type { ModelTransportProtocol, PlatformModelProfile } from './modelCapabilityRegistry.ts'

export type PlatformModelMessage = Readonly<{
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  toolCallId?: string | null
  toolCalls?: readonly PlatformModelToolCall[]
}>

export type PlatformModelTool = Readonly<{
  name: string
  description?: string
  parameters: Readonly<Record<string, unknown>>
}>

export type PlatformModelRequest = Readonly<{
  profile: PlatformModelProfile
  messages: readonly PlatformModelMessage[]
  maxOutputTokens?: number
  temperature?: number
  jsonObject?: boolean
  tools?: readonly PlatformModelTool[]
  toolChoice?: 'auto' | 'none' | Readonly<{ name: string }>
  timeoutMs?: number
}>

export type PlatformModelToolCall = Readonly<{
  id: string
  name: string
  arguments: string
}>

export type PlatformModelResponse = Readonly<{
  text: string | null
  toolCalls: readonly PlatformModelToolCall[]
  finishReason: string | null
  provider: string
  model: string
  inputTokens: number | null
  outputTokens: number | null
  requestId: string | null
}>

export type ModelTransportHealth = Readonly<{
  ok: boolean
  provider: string
  model: string | null
  error: string | null
}>

/**
 * Stable platform boundary between product logic and vendor/provider wire formats.
 * Implementations translate this canonical request into one protocol only.
 * Credentials are runtime configuration and must never live in a model profile.
 */
export interface ModelTransportAdapter {
  readonly id: string
  readonly protocol: ModelTransportProtocol
  supports(profile: PlatformModelProfile): boolean
  health(profile: PlatformModelProfile): Promise<ModelTransportHealth>
  chat(request: PlatformModelRequest): Promise<PlatformModelResponse>
}

export function requireTransportForProfile(
  profile: PlatformModelProfile,
  adapters: readonly ModelTransportAdapter[],
): ModelTransportAdapter {
  for (const protocol of profile.transportProtocols) {
    const adapter = adapters.find(candidate => candidate.protocol === protocol && candidate.supports(profile))
    if (adapter) return adapter
  }
  throw new Error(`platform_model_transport_unavailable:${profile.key}`)
}
