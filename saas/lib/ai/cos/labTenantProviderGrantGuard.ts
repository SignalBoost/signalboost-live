// Phase 3: fail-closed validation of a server-retrieved buyer-owned provider grant.
// This is NOT the grant issuer, a secret-vault reader or an execution authority.
export type ProviderGrantCapability = 'teacher.invoke' | 'compute.execute' | 'tool.invoke'
export type ProviderGrant = Readonly<{
  organization_id: string
  permanent_artifact_id: string
  provider_id: string
  capability: string
  secret_reference: string
  expires_at: string
  revoked_at: string | null
}>
export type ProviderUseScope = Readonly<{
  organizationId: string
  permanentArtifactId: string
  providerId: string
  capability: ProviderGrantCapability
}>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROVIDER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
export function validateTenantProviderGrant(
  scope: ProviderUseScope,
  grant: ProviderGrant | null,
  now: Date,
): Readonly<{ allowed: boolean; secretReference: string | null }> {
  const denied = { allowed: false, secretReference: null } as const
  if (!scope || !grant || !Number.isFinite(now.getTime())
    || !UUID.test(scope.organizationId) || !UUID.test(scope.permanentArtifactId)
    || !PROVIDER.test(scope.providerId)
    || !['teacher.invoke', 'compute.execute', 'tool.invoke'].includes(scope.capability)
    || grant.organization_id !== scope.organizationId
    || grant.permanent_artifact_id !== scope.permanentArtifactId
    || grant.provider_id !== scope.providerId
    || grant.capability !== scope.capability
    || grant.revoked_at !== null) return denied
  const expiry = Date.parse(grant.expires_at)
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) return denied
  const prefix = `vault://${scope.organizationId}/`
  const secretRef = grant.secret_reference
  if (!secretRef?.startsWith(prefix)
    || !/^vault:\/\/[a-f0-9-]+\/[a-zA-Z0-9/_-]{1,200}$/.test(secretRef)) return denied
  return { allowed: true, secretReference: secretRef }
}
