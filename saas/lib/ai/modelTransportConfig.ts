// saas/lib/ai/modelTransportConfig.ts
import type { ModelTransportProtocol } from './modelCapabilityRegistry.ts'

export type PlatformModelTransportBinding = Readonly<{
  profileKey: string
  protocol: ModelTransportProtocol
  provider: string
  endpoint: string | null
  credentialEnv: string | null
  apiVersion: string | null
  timeoutMs: number
}>

const KEY = /^[a-z0-9][a-z0-9._-]{1,119}$/
const PROVIDER = /^[a-z0-9][a-z0-9._-]{0,79}$/
const ENV_NAME = /^[A-Z][A-Z0-9_]{1,127}$/
const PROTOCOLS: readonly ModelTransportProtocol[] = Object.freeze([
  'openai_compatible', 'anthropic_messages', 'google_generate_content',
  'native_sdk', 'local_runtime', 'custom_http',
])

function optionalHttpsEndpoint(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const url = new URL(text)
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash) {
    throw new Error('platform_model_transport_endpoint_invalid')
  }
  return url.toString().replace(/\/$/, '')
}

function boundedTimeout(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 120_000
  return Math.max(1_000, Math.min(300_000, Math.floor(parsed)))
}

export function parseModelTransportBindings(rawJson: string | undefined): readonly PlatformModelTransportBinding[] {
  const text = String(rawJson || '').trim()
  if (!text) return Object.freeze([])
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { throw new Error('platform_model_transport_registry_json_invalid') }
  if (!Array.isArray(parsed) || parsed.length > 64) throw new Error('platform_model_transport_registry_shape_invalid')
  const out: PlatformModelTransportBinding[] = []
  const identities = new Set<string>()
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('platform_model_transport_binding_invalid')
    const row = item as Record<string, unknown>
    const profileKey = String(row.profileKey || '').trim().toLowerCase()
    const protocol = String(row.protocol || '') as ModelTransportProtocol
    const provider = String(row.provider || '').trim().toLowerCase()
    const credentialEnvRaw = String(row.credentialEnv || '').trim()
    const credentialEnv = credentialEnvRaw || null
    const apiVersion = String(row.apiVersion || '').trim().slice(0, 80) || null
    if (!KEY.test(profileKey) || !PROTOCOLS.includes(protocol) || !PROVIDER.test(provider)) {
      throw new Error('platform_model_transport_binding_identity_invalid')
    }
    if (credentialEnv && !ENV_NAME.test(credentialEnv)) throw new Error('platform_model_transport_credential_env_invalid')
    const endpoint = optionalHttpsEndpoint(row.endpoint)
    if (protocol === 'openai_compatible' && !endpoint) throw new Error('platform_model_transport_endpoint_required')
    const identity = `${profileKey}:${protocol}`
    if (identities.has(identity)) throw new Error('platform_model_transport_binding_duplicate')
    identities.add(identity)
    out.push(Object.freeze({
      profileKey, protocol, provider, endpoint, credentialEnv, apiVersion, timeoutMs: boundedTimeout(row.timeoutMs),
    }))
  }
  return Object.freeze(out)
}

export function configuredModelTransportBindings(env: NodeJS.ProcessEnv = process.env): readonly PlatformModelTransportBinding[] {
  return parseModelTransportBindings(env.ITMOUNTS_MODEL_TRANSPORTS_JSON)
}
