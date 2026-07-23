export type AgentSandboxProviderId = 'disabled' | 'remote'

export interface AgentSandboxProviderConfig {
  providerId: AgentSandboxProviderId
  enabled: boolean
  endpoint?: string
  authenticationToken?: string
  requestTimeoutMs: number
  maximumConcurrentSessions: number
  maximumSessionsPerUserPerHour: number
  maximumWorkflowCostUnits: number
  allowOutboundNetwork: false
  allowEnvironmentInheritance: false
  allowHostFilesystem: false
  allowRepositoryWrites: false
}

const DEFAULTS = Object.freeze({ requestTimeoutMs: 30_000, maximumConcurrentSessions: 1, maximumSessionsPerUserPerHour: 3, maximumWorkflowCostUnits: 10 })
export const DISABLED_AGENT_SANDBOX_PROVIDER_CONFIG: Readonly<AgentSandboxProviderConfig> = Object.freeze({ providerId: 'disabled', enabled: false, ...DEFAULTS, allowOutboundNetwork: false, allowEnvironmentInheritance: false, allowHostFilesystem: false, allowRepositoryWrites: false })

export class AgentSandboxProviderConfigurationError extends Error { constructor(message: string) { super(message); this.name = 'AgentSandboxProviderConfigurationError' } }
function positive(source: Readonly<Record<string, string | undefined>>, key: string, fallback: number): number { const value = source[key]; if (value === undefined) return fallback; if (!/^\d+$/.test(value) || Number(value) <= 0 || !Number.isSafeInteger(Number(value))) throw new AgentSandboxProviderConfigurationError(`Invalid ${key}.`); return Number(value) }
function safeEndpoint(value: string): string { let url: URL; try { url = new URL(value) } catch { throw new AgentSandboxProviderConfigurationError('Remote sandbox endpoint is invalid.') }; const host = url.hostname.toLowerCase(); const privateV4 = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host); if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || host === 'localhost' || host === '::1' || host === '[::1]' || host.startsWith('fe80:') || privateV4) throw new AgentSandboxProviderConfigurationError('Remote sandbox endpoint is not permitted.'); return url.toString().replace(/\/$/, '') }
export function loadAgentSandboxProviderConfig(source: Readonly<Record<string, string | undefined>>): AgentSandboxProviderConfig {
  const provider = source.AGENT_SANDBOX_PROVIDER
  if (provider === undefined || provider === '' || provider === 'disabled') return Object.freeze({ ...DISABLED_AGENT_SANDBOX_PROVIDER_CONFIG })
  if (provider !== 'remote') throw new AgentSandboxProviderConfigurationError('Unknown sandbox provider.')
  if (source.AGENT_SANDBOX_ENABLED !== 'true') throw new AgentSandboxProviderConfigurationError('Remote sandbox provider requires explicit enablement.')
  const endpoint = source.AGENT_SANDBOX_ENDPOINT; const token = source.AGENT_SANDBOX_TOKEN
  if (!endpoint) throw new AgentSandboxProviderConfigurationError('Remote sandbox endpoint is required.')
  if (!token) throw new AgentSandboxProviderConfigurationError('Remote sandbox authentication token is required.')
  return Object.freeze({ providerId: 'remote', enabled: true, endpoint: safeEndpoint(endpoint), authenticationToken: token, requestTimeoutMs: positive(source, 'AGENT_SANDBOX_REQUEST_TIMEOUT_MS', DEFAULTS.requestTimeoutMs), maximumConcurrentSessions: positive(source, 'AGENT_SANDBOX_MAX_CONCURRENT_SESSIONS', DEFAULTS.maximumConcurrentSessions), maximumSessionsPerUserPerHour: positive(source, 'AGENT_SANDBOX_MAX_SESSIONS_PER_USER_HOUR', DEFAULTS.maximumSessionsPerUserPerHour), maximumWorkflowCostUnits: positive(source, 'AGENT_SANDBOX_MAX_WORKFLOW_COST_UNITS', DEFAULTS.maximumWorkflowCostUnits), allowOutboundNetwork: false, allowEnvironmentInheritance: false, allowHostFilesystem: false, allowRepositoryWrites: false })
}
