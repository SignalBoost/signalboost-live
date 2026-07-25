export const PROVIDER_EXECUTION_MODES = ['direct', 'cosa_pr', 'browser_agent', 'manual'] as const

export type ProviderExecutionMode = (typeof PROVIDER_EXECUTION_MODES)[number]

export type ProviderExecutionCapability = {
  mode: ProviderExecutionMode
  available: boolean
  reason?: string
  endpoint?: string
  browserAdapterId?: string
  approvedOrigin?: string
}

export type ProviderExecutionPolicy = {
  preferredMode: ProviderExecutionMode
  capabilities: readonly ProviderExecutionCapability[]
}

const DEFAULT_CAPABILITIES: readonly ProviderExecutionCapability[] = Object.freeze([
  Object.freeze({ mode: 'direct', available: true, endpoint: '/api/hub/action' }),
  Object.freeze({ mode: 'manual', available: true }),
])

export function createProviderExecutionPolicy(input?: {
  preferredMode?: ProviderExecutionMode
  capabilities?: readonly ProviderExecutionCapability[]
}): ProviderExecutionPolicy {
  const capabilities = normalizeCapabilities(input?.capabilities ?? DEFAULT_CAPABILITIES)
  const preferredMode = resolvePreferredMode(input?.preferredMode, capabilities)

  return Object.freeze({
    preferredMode,
    capabilities: Object.freeze(capabilities.map(capability => Object.freeze({ ...capability }))),
  })
}

export function resolvePreferredMode(
  requested: ProviderExecutionMode | undefined,
  capabilities: readonly ProviderExecutionCapability[],
): ProviderExecutionMode {
  const available = new Set(capabilities.filter(capability => capability.available).map(capability => capability.mode))

  if (requested && available.has(requested)) return requested

  for (const mode of PROVIDER_EXECUTION_MODES) {
    if (available.has(mode)) return mode
  }

  throw new Error('provider_execution_mode_unavailable')
}

export function assertProviderExecutionMode(
  policy: ProviderExecutionPolicy,
  mode: ProviderExecutionMode,
): ProviderExecutionCapability {
  const capability = policy.capabilities.find(candidate => candidate.mode === mode)
  if (!capability?.available) throw new Error('provider_execution_mode_unsupported')

  if (mode === 'browser_agent') {
    if (!capability.browserAdapterId) throw new Error('browser_adapter_required')
    if (!capability.approvedOrigin) throw new Error('browser_approved_origin_required')
    assertApprovedOrigin(capability.approvedOrigin)
  }

  return capability
}

export function assertApprovedOrigin(value: string): void {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') throw new Error('browser_approved_origin_must_be_https')
  if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
    throw new Error('browser_approved_origin_must_be_origin_only')
  }
}

function normalizeCapabilities(
  capabilities: readonly ProviderExecutionCapability[],
): ProviderExecutionCapability[] {
  const seen = new Set<ProviderExecutionMode>()
  const normalized: ProviderExecutionCapability[] = []

  for (const capability of capabilities) {
    if (!PROVIDER_EXECUTION_MODES.includes(capability.mode)) {
      throw new Error('provider_execution_mode_unknown')
    }
    if (seen.has(capability.mode)) throw new Error('provider_execution_mode_duplicate')
    seen.add(capability.mode)
    normalized.push({ ...capability })
  }

  return normalized
}
