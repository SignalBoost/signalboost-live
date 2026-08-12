// Connector-native objects that can move between tools without copy/paste or text parsing.

export const PORTABLE_STRUCTURED_REFERENCE_SCHEMA_VERSION = 'portable-structured-reference-v1' as const

export type PortableStructuredReferenceKind =
  | 'deployment'
  | 'incident'
  | 'issue'
  | 'document'
  | 'email'
  | 'log_stream'
  | 'artifact'
  | 'repository'
  | 'resource'
  | 'custom'

export interface PortableStructuredReference {
  schemaVersion: typeof PORTABLE_STRUCTURED_REFERENCE_SCHEMA_VERSION
  kind: PortableStructuredReferenceKind
  providerId: string
  tenantId: string
  environmentId: string
  objectId: string
  canonicalRef: string
  contentType?: string
  metadata?: Readonly<Record<string, string | number | boolean | null>>
}

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}

export function createPortableStructuredReference(
  input: Omit<PortableStructuredReference, 'schemaVersion'>,
): PortableStructuredReference {
  return Object.freeze({
    ...input,
    schemaVersion: PORTABLE_STRUCTURED_REFERENCE_SCHEMA_VERSION,
    providerId: required(input.providerId, 'providerId'),
    tenantId: required(input.tenantId, 'tenantId'),
    environmentId: required(input.environmentId, 'environmentId'),
    objectId: required(input.objectId, 'objectId'),
    canonicalRef: required(input.canonicalRef, 'canonicalRef'),
    metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined,
  })
}

export function isPortableStructuredReference(value: unknown): value is PortableStructuredReference {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<PortableStructuredReference>
  return candidate.schemaVersion === PORTABLE_STRUCTURED_REFERENCE_SCHEMA_VERSION &&
    typeof candidate.providerId === 'string' &&
    typeof candidate.tenantId === 'string' &&
    typeof candidate.environmentId === 'string' &&
    typeof candidate.objectId === 'string' &&
    typeof candidate.canonicalRef === 'string'
}
