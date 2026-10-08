// Phase 3 BYOI: fail-closed scope checks before any customer provider adapter resolves a secret.
// Opaque references ONLY. This is an adapter boundary, not a credential store or a provider implementation.
export type ScopedProviderGrant = Readonly<{
  organizationId: string
  providerId: string
  secretReference: string
  capability: 'teacher.invoke' | 'compute.execute' | 'tool.invoke'
  artifactId: string
  expiresAtMs: number
}>
export type ScopedProviderRequest = Readonly<{
  organizationId: string
  providerId: string
  capability: ScopedProviderGrant['capability']
  artifactId: string
  nowMs: number
}>
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const SECRET_REF = /^vault:\/\/[a-zA-Z0-9/_-]{3,200}$/
export function assertCustomerProviderScope(grant: ScopedProviderGrant, request: ScopedProviderRequest): string {
  // This function validates a trusted grant fetched by the server from tenant-scoped storage.
  // Never construct the grant from a request body, JWT user metadata or model output.
  if (!grant || !request || !ID.test(grant.organizationId) || !ID.test(request.organizationId)
    || !ID.test(grant.providerId) || !ID.test(request.providerId)
    || !ID.test(grant.artifactId) || !ID.test(request.artifactId)
    || !SECRET_REF.test(grant.secretReference)
    || !['teacher.invoke','compute.execute','tool.invoke'].includes(grant.capability)
    || !Number.isSafeInteger(grant.expiresAtMs) || !Number.isSafeInteger(request.nowMs)
    || grant.expiresAtMs <= request.nowMs
    || grant.organizationId !== request.organizationId
    || grant.providerId !== request.providerId
    || grant.artifactId !== request.artifactId
    || grant.capability !== request.capability) throw new Error('lab_byoi_scope_denied')
  return grant.secretReference
}
