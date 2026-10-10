// Trusted server-side binding for customer artifact export.
// Host supplies separate authenticated membership / Harness authorization and a private
// object store. Never accept storage keys, provider IDs or ownership claims from HTTP JSON.
import {
  deliverVerifiedCustomerArtifact,
  type CustomerArtifactDeliveryResult,
  type CustomerArtifactExportResolver,
} from './labCustomerArtifactVerifiedDelivery.ts'
import type { LabExportRequest } from './labCustomerArtifactExportAuthorization.ts'

export type DurableExportObject = Readonly<{
  permanent_artifact_id: string
  organization_id: string
  provider_connection_id: string
  storage_object_key: string
  sha256: string
  byte_length: number
}>
export type TrustedArtifactExportServices = Readonly<{
  // Service-role tenant-scoped lookup, keyed by both organization and artifact.
  readExportObject: (organizationId: string, artifactId: string) => Promise<DurableExportObject | null>
  // Resolve from session and durable tenant membership; never trust request body claims.
  activeMember: (userId: string, organizationId: string) => Promise<boolean>
  // Verify a scoped authorized artifact-read Harness operation, not a training grant.
  exportAuthority: (userId: string, organizationId: string, artifactId: string) => Promise<boolean>
  // Resolve private provider connection and retrieve bytes using a host-owned adapter.
  readPrivateObject: (providerConnectionId: string, objectKey: string, maxBytes: number) => Promise<Uint8Array | null>
}>
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BYTES = 32 * 1024 * 1024
const SHA = /^[a-f0-9]{64}$/

export function trustedLabExportResolver(services: TrustedArtifactExportServices): CustomerArtifactExportResolver {
  return async request => {
    const userId = request.authenticatedUserId
    if (!userId?.trim() || !UUID.test(request.requestedOrganizationId)
      || !UUID.test(request.requestedArtifactId)) return null
    const organizationId = request.requestedOrganizationId
    const artifactId = request.requestedArtifactId
    // Deny before any storage lookup for non-members.
    if (!await services.activeMember(userId, organizationId)) return null
    if (!await services.exportAuthority(userId, organizationId, artifactId)) return null
    const row = await services.readExportObject(organizationId, artifactId)
    if (!row || row.organization_id !== organizationId || row.permanent_artifact_id !== artifactId
      || !UUID.test(row.provider_connection_id)
      || !row.storage_object_key || row.storage_object_key.length > 1024
      || /[\x00-\x1f\x7f]/.test(row.storage_object_key)
      || /^(https?:\/\/|file:|s3:\/\/)/i.test(row.storage_object_key)
      || !SHA.test(row.sha256)
      || !Number.isSafeInteger(row.byte_length) || row.byte_length < 1 || row.byte_length > MAX_BYTES) return null

    return {
      evidence: {
        organizationId, artifactId, storageTenantId: organizationId,
        requestingUserId: userId, activeMember: true,
        executionAuthorityVerified: true, artifactReady: true,
        storedSha256: row.sha256,
      },
      readBytes: async () => {
        const bytes = await services.readPrivateObject(row.provider_connection_id, row.storage_object_key, MAX_BYTES)
        return bytes?.byteLength === row.byte_length ? bytes : null
      },
    }
  }
}

/** No graduation, Referee pass, or independent certification required for customer retrieval. */
export async function retrieveCustomerArtifact(
  request: LabExportRequest,
  services: TrustedArtifactExportServices,
): Promise<CustomerArtifactDeliveryResult> {
  return deliverVerifiedCustomerArtifact(request, trustedLabExportResolver(services))
}
