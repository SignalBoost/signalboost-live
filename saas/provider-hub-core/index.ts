// saas/provider-hub-core/index.ts
export { executeProviderLiveDataRead } from './live-data-read-adapter.ts'
export type {
  ProviderLiveDataDigestPort,
  ProviderLiveDataExecutionMode,
  ProviderLiveDataReadAdapterOptions,
  ProviderLiveDataReadRequest,
  ProviderLiveDataReadTransport,
  ProviderLiveDataTransportResponse,
} from './live-data-read-adapter.ts'
export { PROVIDER_LIVE_DATA_READ_EVIDENCE_SCHEMA_VERSION, createProviderLiveDataReadEvidence } from './live-data-read-evidence.ts'
// ── Real transport, shipped rather than specified ────────────────────────────
// Both ports a buyer used to have to implement themselves. createHttpsReadTransport performs
// the read — refusing a cross-origin redirect, because that is where a credential in an
// Authorization header gets handed to somebody else — and createSha256DigestPort hashes with
// the runtime's own SHA-256 so two records of the same payload cannot disagree.
export { createHttpsReadTransport, createSha256DigestPort } from './transports/https-read.ts'
export type { HttpsReadAuth, HttpsReadOptions } from './transports/https-read.ts'
export type { ProviderLiveDataProductionAuthorization } from './live-data-read-adapter.ts'

export { PROVIDER_HUB_ACCEPTANCE_SCHEMA, runProviderHubAcceptance } from './acceptance-harness.ts'
export type { ProviderHubAcceptanceOptions, ProviderHubAcceptanceResult, ProviderHubCheck, ProviderHubCheckId } from './acceptance-harness.ts'
export type { ProviderLiveDataReadEvidence, ProviderLiveDataReadState } from './live-data-read-evidence.ts'

// ── Portable Connector Runtime ──────────────────────────────────────────────
export {
  PORTABLE_CONNECTOR_CAPABILITY_SCHEMA_VERSION,
  createPortableCapabilityDescriptor,
  resolvePortableCapabilities,
} from './capability-runtime.ts'
export type {
  PortableCapabilityAvailability,
  PortableCapabilityDescriptor,
  PortableCapabilityDiscoveryPort,
  PortableCapabilityManifest,
  PortableCapabilityRequirement,
  PortableCapabilityResolution,
  PortableCapabilityRisk,
} from './capability-runtime.ts'
export {
  PORTABLE_STRUCTURED_REFERENCE_SCHEMA_VERSION,
  createPortableStructuredReference,
  isPortableStructuredReference,
} from './structured-reference.ts'
export type {
  PortableStructuredReference,
  PortableStructuredReferenceKind,
} from './structured-reference.ts'
export {
  PORTABLE_CONNECTOR_RUNTIME_SCHEMA_VERSION,
  createPortableConnectorRuntime,
} from './connector-runtime.ts'
export type {
  PortableApprovalEvidence,
  PortableConnectorAuditEvent,
  PortableConnectorAuditPort,
  PortableConnectorExecutionPort,
  PortableConnectorExecutionResult,
  PortableConnectorInvocation,
  PortableConnectorRuntimeOptions,
  PortableRuntimeDiscovery,
} from './connector-runtime.ts'

export const PROVIDER_HUB_CONNECTION_SCHEMA_VERSION = 'provider-hub-connection-v1' as const

export type ProviderAuthenticationMethod = 'api_key' | 'oauth' | 'service_account' | 'manual' | 'assisted'
export type ProviderConnectionState = 'configured' | 'validated' | 'degraded' | 'disconnected'

export interface ProviderConnectionIdentity {
  tenantId: string
  environmentId: string
  connectionId: string
  providerId: string
}

export interface ProviderAuthenticationMetadata {
  method: ProviderAuthenticationMethod
  configured: boolean
  maskedFields: Readonly<Record<string, string>>
}

export interface ProviderConnectionMetadata extends ProviderConnectionIdentity {
  schemaVersion: typeof PROVIDER_HUB_CONNECTION_SCHEMA_VERSION
  state: ProviderConnectionState
  authentication: ProviderAuthenticationMetadata
  updatedAt: string
}

export interface ProviderConnectionPersistencePort {
  getConnection(identity: ProviderConnectionIdentity): Promise<ProviderConnectionMetadata | null>
}

const SECRET_FIELD = /(secret|token|password|private.?key|credential|api.?key|access.?key)/i
const SAFE_MASKED_VALUE = /^(saved|configured|••••[a-zA-Z0-9_-]{1,8})$/

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

function assertSafeMaskedFields(fields: Record<string, unknown>): Readonly<Record<string, string>> {
  const safe: Record<string, string> = {}
  for (const [name, rawValue] of Object.entries(fields)) {
    if (SECRET_FIELD.test(name)) throw new Error(`secret-shaped public field rejected: ${name}`)
    const value = String(rawValue ?? '').trim()
    if (!value) continue
    if (!SAFE_MASKED_VALUE.test(value)) throw new Error(`unsafe masked value rejected: ${name}`)
    safe[name] = value
  }
  return Object.freeze(safe)
}

export function createProviderConnectionMetadata(input: {
  tenantId: unknown
  environmentId: unknown
  connectionId: unknown
  providerId: unknown
  state: ProviderConnectionState
  authentication: { method: ProviderAuthenticationMethod; configured: boolean; maskedFields?: Record<string, unknown> }
  updatedAt: unknown
}): ProviderConnectionMetadata {
  const updatedAt = required(input.updatedAt, 'updatedAt')
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error('updatedAt must be an ISO timestamp')

  const record: ProviderConnectionMetadata = {
    schemaVersion: PROVIDER_HUB_CONNECTION_SCHEMA_VERSION,
    tenantId: required(input.tenantId, 'tenantId'),
    environmentId: required(input.environmentId, 'environmentId'),
    connectionId: required(input.connectionId, 'connectionId'),
    providerId: required(input.providerId, 'providerId'),
    state: input.state,
    authentication: Object.freeze({
      method: input.authentication.method,
      configured: Boolean(input.authentication.configured),
      maskedFields: assertSafeMaskedFields(input.authentication.maskedFields ?? {}),
    }),
    updatedAt: new Date(updatedAt).toISOString(),
  }

  return Object.freeze(record)
}
