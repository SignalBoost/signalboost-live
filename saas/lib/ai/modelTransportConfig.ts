// saas/lib/ai/modelTransportConfig.ts
import type { ModelTransportProtocol } from './modelCapabilityRegistry.ts'

export type PlatformModelTransportBinding = Readonly<{
  profileKey: string
  protocol: ModelTransportProtocol
  provider: string
  endpoint: string | null
  credentialEnv: string | null
  credentialRef: string | null
  apiVersion: string | null
  timeoutMs: number
  maxCallCostUsd: number
}>

const KEY = /^[a-z0-9][a-z0-9._-]{1,119}$/
const PROVIDER = /^[a-z0-9][a-z0-9._-]{0,79}$/
const ENV_NAME = /^[A-Z][A-Z0-9_]{1,127}$/
const CREDENTIAL_REF = /^model-vault:[0-9a-f-]{36}$/
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
    const credentialRefRaw = String(row.credentialRef || '').trim()
    const credentialRef = credentialRefRaw || null
    const apiVersion = String(row.apiVersion || '').trim().slice(0, 80) || null
    if (!KEY.test(profileKey) || !PROTOCOLS.includes(protocol) || !PROVIDER.test(provider)) {
      throw new Error('platform_model_transport_binding_identity_invalid')
    }
    if (credentialEnv && !ENV_NAME.test(credentialEnv)) throw new Error('platform_model_transport_credential_env_invalid')
    if (credentialRef && !CREDENTIAL_REF.test(credentialRef)) throw new Error('platform_model_transport_credential_ref_invalid')
    if (credentialEnv && credentialRef) throw new Error('platform_model_transport_credential_source_ambiguous')
    const endpoint = optionalHttpsEndpoint(row.endpoint)
    if (protocol === 'openai_compatible' && !endpoint) throw new Error('platform_model_transport_endpoint_required')
    const identity = `${profileKey}:${protocol}`
    if (identities.has(identity)) throw new Error('platform_model_transport_binding_duplicate')
    identities.add(identity)
    const maxCallCostUsdRaw = Number(row.maxCallCostUsd ?? 0)
    if (!Number.isFinite(maxCallCostUsdRaw) || maxCallCostUsdRaw < 0 || maxCallCostUsdRaw > 10_000) throw new Error('platform_model_transport_cost_ceiling_invalid')
    out.push(Object.freeze({
      profileKey, protocol, provider, endpoint, credentialEnv, credentialRef, apiVersion,
      timeoutMs: boundedTimeout(row.timeoutMs), maxCallCostUsd: maxCallCostUsdRaw,
    }))
  }
  return Object.freeze(out)
}

export function configuredModelTransportBindings(env: Record<string, string | undefined> = process.env): readonly PlatformModelTransportBinding[] {
  return parseModelTransportBindings(env.ITMOUNTS_MODEL_TRANSPORTS_JSON)
}
