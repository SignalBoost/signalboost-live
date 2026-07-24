import type { BrowserTaskMode } from './contracts.ts'
import {
  normalizeBrowserProviderCapabilities,
  type BrowserProviderCapabilities,
} from './provider-capabilities.ts'

export const BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION = '1.0.0' as const

export type BrowserProviderHealth = 'healthy' | 'degraded' | 'unavailable'

export interface BrowserProviderSelectionCandidate {
  readonly provider: string
  readonly capabilities: BrowserProviderCapabilities
  readonly health: BrowserProviderHealth
  readonly priority?: number
  readonly costWeight?: number
  readonly regions?: readonly string[]
  readonly modes?: readonly BrowserTaskMode[]
}

export interface BrowserProviderSelectionRequest {
  readonly schemaVersion: typeof BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION
  readonly candidates: readonly BrowserProviderSelectionCandidate[]
  readonly region?: string
  readonly mode?: BrowserTaskMode
  readonly requiredCapabilities?: readonly (keyof Pick<
    BrowserProviderCapabilities,
    'sessionSnapshotCapture' | 'sessionSnapshotRestore' | 'profileExport' | 'profileImport'
  >)[]
  readonly allowDegraded?: boolean
}

export interface RankedBrowserProvider {
  readonly provider: string
  readonly score: number
  readonly health: Exclude<BrowserProviderHealth, 'unavailable'>
  readonly capabilities: BrowserProviderCapabilities
}

export interface BrowserProviderSelectionResult {
  readonly schemaVersion: typeof BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION
  readonly selected: RankedBrowserProvider
  readonly ranked: readonly RankedBrowserProvider[]
  readonly rejected: readonly Readonly<{
    provider: string
    reasons: readonly string[]
  }>[]
}

function requireProvider(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value)) {
    throw new Error('browser_provider_selection_provider_invalid')
  }
  return value
}

function requireFinite(value: unknown, fallback: number, error: string): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(error)
  return value
}

function normalizeRegion(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new Error('browser_provider_selection_region_invalid')
  }
  return value.toLowerCase()
}

function normalizeCandidate(candidate: BrowserProviderSelectionCandidate): BrowserProviderSelectionCandidate {
  if (!candidate || !['healthy', 'degraded', 'unavailable'].includes(candidate.health)) {
    throw new Error('browser_provider_selection_health_invalid')
  }

  const provider = requireProvider(candidate.provider)
  const capabilities = normalizeBrowserProviderCapabilities(candidate.capabilities)
  if (capabilities.provider !== provider) throw new Error('browser_provider_selection_provider_mismatch')

  const regions = candidate.regions?.map((region) => normalizeRegion(region) as string)
  const modes = candidate.modes?.map((mode) => {
    if (!['observe', 'prepare_change', 'execute_change'].includes(mode)) {
      throw new Error('browser_provider_selection_mode_invalid')
    }
    return mode
  })

  return Object.freeze({
    provider,
    capabilities,
    health: candidate.health,
    priority: requireFinite(candidate.priority, 0, 'browser_provider_selection_priority_invalid'),
    costWeight: requireFinite(candidate.costWeight, 0, 'browser_provider_selection_cost_invalid'),
    ...(regions ? { regions: Object.freeze([...new Set(regions)]) } : {}),
    ...(modes ? { modes: Object.freeze([...new Set(modes)]) } : {}),
  })
}

export function selectBrowserProvider(request: BrowserProviderSelectionRequest): BrowserProviderSelectionResult {
  if (!request || request.schemaVersion !== BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION) {
    throw new Error('browser_provider_selection_schema_invalid')
  }
  if (!Array.isArray(request.candidates) || request.candidates.length === 0) {
    throw new Error('browser_provider_selection_candidates_required')
  }

  const region = normalizeRegion(request.region)
  const required = [...new Set(request.requiredCapabilities ?? [])]
  const allowedCapabilities = new Set([
    'sessionSnapshotCapture',
    'sessionSnapshotRestore',
    'profileExport',
    'profileImport',
  ])
  if (required.some((capability) => !allowedCapabilities.has(capability))) {
    throw new Error('browser_provider_selection_capability_invalid')
  }

  const normalized = request.candidates.map(normalizeCandidate)
  if (new Set(normalized.map((candidate) => candidate.provider)).size !== normalized.length) {
    throw new Error('browser_provider_selection_provider_duplicate')
  }

  const ranked: RankedBrowserProvider[] = []
  const rejected: { provider: string; reasons: string[] }[] = []

  for (const candidate of normalized) {
    const reasons: string[] = []
    if (candidate.health === 'unavailable') reasons.push('provider_unavailable')
    if (candidate.health === 'degraded' && request.allowDegraded !== true) reasons.push('provider_degraded')
    if (region && candidate.regions && !candidate.regions.includes(region)) reasons.push('region_unsupported')
    if (request.mode && candidate.modes && !candidate.modes.includes(request.mode)) reasons.push('mode_unsupported')
    for (const capability of required) {
      if (!candidate.capabilities[capability]) reasons.push(`capability_missing:${capability}`)
    }

    if (reasons.length > 0) {
      rejected.push({ provider: candidate.provider, reasons })
      continue
    }

    const healthScore = candidate.health === 'healthy' ? 1000 : 500
    const score = healthScore + (candidate.priority ?? 0) * 10 - (candidate.costWeight ?? 0)
    ranked.push(Object.freeze({
      provider: candidate.provider,
      score,
      health: candidate.health,
      capabilities: candidate.capabilities,
    }))
  }

  ranked.sort((left, right) => right.score - left.score || left.provider.localeCompare(right.provider))
  rejected.sort((left, right) => left.provider.localeCompare(right.provider))

  if (ranked.length === 0) throw new Error('browser_provider_selection_no_eligible_provider')

  return Object.freeze({
    schemaVersion: BROWSER_PROVIDER_SELECTION_SCHEMA_VERSION,
    selected: ranked[0],
    ranked: Object.freeze([...ranked]),
    rejected: Object.freeze(rejected.map((entry) => Object.freeze({
      provider: entry.provider,
      reasons: Object.freeze([...entry.reasons]),
    }))),
  })
}
