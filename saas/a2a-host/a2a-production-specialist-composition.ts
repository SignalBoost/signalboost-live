import {
  createInMemoryA2AAgentRegistry,
  normalizeA2AAgentRegistrySnapshot,
  type A2AAgentRegistryPort,
  type A2AAgentRegistrySnapshot,
  type A2ATransportFactory,
} from './a2a-agent-registry.ts'
import {
  createA2AHttpJsonRpcTransportFactory,
  fetchA2AAgentCard,
  type A2AResolvedHttpConnection,
} from './a2a-http-jsonrpc-transport.ts'
import {
  dryRunBuyerA2AOnboarding,
  validateBuyerA2AOnboardingManifest,
  type BuyerA2AOnboardingManifest,
} from './a2a-buyer-manifest.ts'

export const A2A_PRODUCTION_SPECIALIST_COMPOSITION_VERSION = 'signalboost-a2a-production-specialist-composition-v1' as const
export const A2A_PRODUCTION_SPECIALIST_BINDINGS_ENV = 'SIGNALBOOST_A2A_PRODUCTION_SPECIALIST_BINDINGS_JSON' as const

export type ProductionSpecialistBindingDescriptor = Readonly<{
  manifest: BuyerA2AOnboardingManifest
  agentCardUrlEnv: string
  transportEndpointEnv: string
  agentCardHeadersEnv?: string
  transportHeadersEnv?: string
}>

export type ProductionSpecialistComposition = Readonly<{
  version: typeof A2A_PRODUCTION_SPECIALIST_COMPOSITION_VERSION
  registry: A2AAgentRegistryPort
  transportFactory: A2ATransportFactory
  agentIds: readonly string[]
  bindingCount: number
}>

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>
type Environment = Readonly<Record<string, string | undefined>>

type ResolvedBinding = Readonly<{
  descriptor: ProductionSpecialistBindingDescriptor
  agentCardUrl: string
  agentCardHeaders?: Readonly<Record<string, string>>
  transportConnection: A2AResolvedHttpConnection
}>

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function required(value: unknown, code: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(code)
  if (normalized === '*') throw new Error(`${code}_wildcard_rejected`)
  return normalized
}

function envName(value: unknown, field: string): string {
  const name = required(value, `a2a_production_specialist_${field}_required`)
  if (!/^[A-Z][A-Z0-9_]{0,127}$/.test(name)) throw new Error(`a2a_production_specialist_${field}_invalid`)
  return name
}

function optionalEnvName(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined
  return envName(value, field)
}

function readEnvironmentValue(env: Environment, name: string): string {
  const value = String(env[name] ?? '').trim()
  if (!value) throw new Error(`a2a_production_specialist_environment_value_missing:${name}`)
  return value
}

function endpoint(value: string, allowInsecureLoopbackForTests: boolean, kind: 'agent_card' | 'transport'): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`a2a_production_specialist_${kind}_url_invalid`) }
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1'
  if (url.protocol !== 'https:' && !(allowInsecureLoopbackForTests && loopback && url.protocol === 'http:')) {
    throw new Error(`a2a_production_specialist_${kind}_url_must_be_https`)
  }
  if (url.username || url.password) throw new Error(`a2a_production_specialist_${kind}_embedded_credentials_rejected`)
  return url.toString()
}

function headers(value: string | undefined, field: string): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return undefined
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch { throw new Error(`a2a_production_specialist_${field}_invalid_json`) }
  if (!plain(parsed)) throw new Error(`a2a_production_specialist_${field}_invalid`)
  const output: Record<string, string> = {}
  for (const [rawName, rawValue] of Object.entries(parsed)) {
    const name = rawName.trim().toLowerCase()
    if (!name || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) throw new Error(`a2a_production_specialist_${field}_name_invalid`)
    if (name === 'host' || name === 'content-length') throw new Error(`a2a_production_specialist_${field}_forbidden_header`)
    if (typeof rawValue !== 'string' || !rawValue.trim() || /[\r\n]/.test(rawValue)) {
      throw new Error(`a2a_production_specialist_${field}_value_invalid`)
    }
    output[name] = rawValue
  }
  return Object.freeze(output)
}

function descriptor(value: unknown, index: number): ProductionSpecialistBindingDescriptor {
  if (!plain(value)) throw new Error(`a2a_production_specialist_binding_invalid:${index}`)
  const allowed = new Set(['manifest', 'agentCardUrlEnv', 'transportEndpointEnv', 'agentCardHeadersEnv', 'transportHeadersEnv'])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`a2a_production_specialist_binding_unknown_field:${index}:${key}`)
  }
  const manifest = validateBuyerA2AOnboardingManifest(value.manifest)
  return Object.freeze({
    manifest,
    agentCardUrlEnv: envName(value.agentCardUrlEnv, 'agent_card_url_env'),
    transportEndpointEnv: envName(value.transportEndpointEnv, 'transport_endpoint_env'),
    ...(optionalEnvName(value.agentCardHeadersEnv, 'agent_card_headers_env') ? { agentCardHeadersEnv: optionalEnvName(value.agentCardHeadersEnv, 'agent_card_headers_env') } : {}),
    ...(optionalEnvName(value.transportHeadersEnv, 'transport_headers_env') ? { transportHeadersEnv: optionalEnvName(value.transportHeadersEnv, 'transport_headers_env') } : {}),
  })
}

export function parseProductionSpecialistBindingDescriptors(value: unknown): readonly ProductionSpecialistBindingDescriptor[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('a2a_production_specialist_bindings_required')
  const bindings = value.map(descriptor)
  const agentIds = new Set<string>()
  const assignmentIds = new Set<string>()
  const transportRefs = new Set<string>()
  const endpointEnvNames = new Set<string>()
  for (const binding of bindings) {
    const { manifest } = binding
    if (agentIds.has(manifest.agentId)) throw new Error('a2a_production_specialist_duplicate_agent')
    if (assignmentIds.has(manifest.assignmentId)) throw new Error('a2a_production_specialist_duplicate_assignment')
    if (transportRefs.has(manifest.transportRef)) throw new Error('a2a_production_specialist_duplicate_transport_ref')
    if (endpointEnvNames.has(binding.transportEndpointEnv)) throw new Error('a2a_production_specialist_duplicate_transport_endpoint_env')
    agentIds.add(manifest.agentId)
    assignmentIds.add(manifest.assignmentId)
    transportRefs.add(manifest.transportRef)
    endpointEnvNames.add(binding.transportEndpointEnv)
  }
  return Object.freeze(bindings)
}

export function loadProductionSpecialistBindingDescriptors(
  env: Environment = process.env,
  configEnvName = A2A_PRODUCTION_SPECIALIST_BINDINGS_ENV,
): readonly ProductionSpecialistBindingDescriptor[] {
  const source = readEnvironmentValue(env, configEnvName)
  let parsed: unknown
  try { parsed = JSON.parse(source) } catch { throw new Error('a2a_production_specialist_bindings_invalid_json') }
  return parseProductionSpecialistBindingDescriptors(parsed)
}

function resolveBindings(
  descriptors: readonly ProductionSpecialistBindingDescriptor[],
  env: Environment,
  allowInsecureLoopbackForTests: boolean,
): readonly ResolvedBinding[] {
  const transportEndpoints = new Set<string>()
  const agentCardUrls = new Set<string>()
  const authorizations = new Set<string>()

  return Object.freeze(descriptors.map(item => {
    const agentCardUrl = endpoint(readEnvironmentValue(env, item.agentCardUrlEnv), allowInsecureLoopbackForTests, 'agent_card')
    const transportEndpoint = endpoint(readEnvironmentValue(env, item.transportEndpointEnv), allowInsecureLoopbackForTests, 'transport')
    if (agentCardUrls.has(agentCardUrl)) throw new Error('a2a_production_specialist_duplicate_agent_card_endpoint')
    if (transportEndpoints.has(transportEndpoint)) throw new Error('a2a_production_specialist_duplicate_transport_endpoint')

    const agentCardHeaders = headers(item.agentCardHeadersEnv ? readEnvironmentValue(env, item.agentCardHeadersEnv) : undefined, 'agent_card_headers')
    const transportHeaders = headers(item.transportHeadersEnv ? readEnvironmentValue(env, item.transportHeadersEnv) : undefined, 'transport_headers')
    const authorization = transportHeaders?.authorization?.trim()
    if (authorization) {
      if (authorizations.has(authorization)) throw new Error('a2a_production_specialist_duplicate_transport_authorization')
      authorizations.add(authorization)
    }

    agentCardUrls.add(agentCardUrl)
    transportEndpoints.add(transportEndpoint)
    return Object.freeze({
      descriptor: item,
      agentCardUrl,
      ...(agentCardHeaders ? { agentCardHeaders } : {}),
      transportConnection: Object.freeze({
        endpoint: transportEndpoint,
        ...(transportHeaders ? { headers: transportHeaders } : {}),
      }),
    })
  }))
}

/**
 * Compose buyer-owned Production specialists from secret-backed environment bindings.
 * Endpoints and credentials remain closure-only and never enter registry snapshots.
 * Agent Cards are fetched and health-checked before a binding becomes active.
 */
export async function composeProductionBuyerSpecialists(options: {
  env?: Environment
  bindings?: unknown
  fetchImpl?: FetchLike
  allowInsecureLoopbackForTests?: boolean
} = {}): Promise<ProductionSpecialistComposition> {
  const env = options.env ?? process.env
  const descriptors = options.bindings === undefined
    ? loadProductionSpecialistBindingDescriptors(env)
    : parseProductionSpecialistBindingDescriptors(options.bindings)
  const allowInsecureLoopbackForTests = options.allowInsecureLoopbackForTests === true
  const resolved = resolveBindings(descriptors, env, allowInsecureLoopbackForTests)

  const agents: A2AAgentRegistrySnapshot['agents'][number][] = []
  const assignments: A2AAgentRegistrySnapshot['assignments'][number][] = []
  for (const binding of resolved) {
    const fetchCard = () => fetchA2AAgentCard({
      url: binding.agentCardUrl,
      headers: binding.agentCardHeaders,
      fetchImpl: options.fetchImpl,
      allowInsecureLoopbackForTests,
    })
    const agentCard = await fetchCard()
    const plan = await dryRunBuyerA2AOnboarding({
      manifest: binding.descriptor.manifest,
      agentCard,
      fetchAgentCardForHealth: fetchCard,
    })
    agents.push(plan.agent)
    assignments.push(plan.assignment)
  }

  const snapshot = normalizeA2AAgentRegistrySnapshot({ agents, assignments })
  const bindingByTransportRef = new Map(resolved.map(binding => [binding.descriptor.manifest.transportRef, binding] as const))
  const transportFactory = createA2AHttpJsonRpcTransportFactory({
    fetchImpl: options.fetchImpl,
    allowInsecureLoopbackForTests,
    connectionResolver: Object.freeze({
      resolve(input) {
        const binding = bindingByTransportRef.get(input.transportRef)
        if (!binding || binding.descriptor.manifest.agentId !== input.agentId) throw new Error('a2a_production_specialist_binding_not_found')
        const manifest = binding.descriptor.manifest
        if (
          input.scope.tenantId !== manifest.tenantId ||
          input.scope.environmentId !== manifest.environmentId ||
          input.scope.portableId !== manifest.portableId
        ) throw new Error('a2a_production_specialist_binding_scope_mismatch')
        return binding.transportConnection
      },
    }),
  })

  return Object.freeze({
    version: A2A_PRODUCTION_SPECIALIST_COMPOSITION_VERSION,
    registry: createInMemoryA2AAgentRegistry(snapshot),
    transportFactory,
    agentIds: Object.freeze(snapshot.agents.map(agent => agent.agentId)),
    bindingCount: snapshot.agents.length,
  })
}
