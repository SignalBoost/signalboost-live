// Platform-neutral customer artifact delivery. No public route or provider connection
// is created here. Authenticated host adapters must resolve ownership and storage
// from durable tenant-scoped records (never from a caller-supplied URL or path).
import { createHash } from 'node:crypto'
import {
  authorizeCustomerArtifactExport,
  type LabExportRequest,
  type VerifiedLabExportEvidence,
} from './labCustomerArtifactExportAuthorization.ts'

const MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024

export type TrustedCustomerArtifact = Readonly<{
  evidence: Omit<VerifiedLabExportEvidence, 'storageObjectVerified' | 'independentlyComputedSha256'>
  // Already resolved by a trusted server-side storage registry; no external URL.
  readBytes: () => Promise<Uint8Array | null>
}>
export type CustomerArtifactExportResolver = (request: LabExportRequest) => Promise<TrustedCustomerArtifact | null>

export type CustomerArtifactDeliveryResult =
  | { ok: true; bytes: Uint8Array; sha256: string; filename: string; contentType: 'application/octet-stream' }
  | { ok: false; reason: 'unauthorized' | 'ownership_mismatch' | 'not_ready' | 'integrity_failed' | 'storage_unavailable' }

/**
 * Bound exact bytes to durable tenant/artifact provenance before returning anything.
 * The host must validate the session, Harness authority and tenant membership
 * independently. Do not use this as evidence of a live customer download.
 */
export async function deliverVerifiedCustomerArtifact(
  request: LabExportRequest,
  resolve: CustomerArtifactExportResolver,
): Promise<CustomerArtifactDeliveryResult> {
  if (!request.authenticatedUserId?.trim()) return { ok: false, reason: 'unauthorized' }
  let candidate: TrustedCustomerArtifact | null
  try { candidate = await resolve(request) } catch { return { ok: false, reason: 'storage_unavailable' } }
  if (!candidate) return { ok: false, reason: 'unauthorized' }

  const preflight = authorizeCustomerArtifactExport(request, {
    ...candidate.evidence,
    storageObjectVerified: true,
    independentlyComputedSha256: candidate.evidence.storedSha256,
  })
  if (!preflight.allowed) return { ok: false, reason: preflight.reason }

  if (!candidate.evidence.artifactReady) return { ok: false, reason: 'not_ready' }
  let bytes: Uint8Array | null
  try { bytes = await candidate.readBytes() } catch { return { ok: false, reason: 'storage_unavailable' } }
  if (!bytes || !ArrayBuffer.isView(bytes) || !(bytes instanceof Uint8Array)
    || bytes.byteLength === 0 || bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    return { ok: false, reason: 'not_ready' }
  }
  const digest = createHash('sha256').update(bytes).digest('hex')
  const decision = authorizeCustomerArtifactExport(request, {
    ...candidate.evidence,
    storageObjectVerified: true,
    independentlyComputedSha256: digest,
  })
  if (!decision.allowed) return { ok: false, reason: decision.reason }
  return {
    ok: true, bytes, sha256: decision.sha256,
    filename: `${decision.artifactId}.bin`,
    contentType: 'application/octet-stream',
  }
}
