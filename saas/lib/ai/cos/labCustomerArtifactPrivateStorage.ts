// Server-only customer artifact object reader. This adapter is not an HTTP route and
// grants no access on its own: trustedLabExportResolver must check membership,
// export Harness authority, and tenant-bound metadata before invoking it.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_BYTES = 32 * 1024 * 1024
const BUCKET = /^[a-z0-9][a-z0-9._-]{1,62}$/

export type PrivateCustomerArtifactStore = Pick<SupabaseClient, 'storage'>

/**
 * Connect only a deployment-owned private bucket to its exact registered provider.
 * Never accept a bucket or provider from a browser request.
 * Buckets must already exist, be private, and be provisioned by the operator.
 */
export function createPrivateCustomerArtifactReader(
  client: PrivateCustomerArtifactStore,
  configuration: Readonly<{ providerConnectionId: string; bucket: string }>,
) {
  if (!UUID.test(configuration.providerConnectionId) || !BUCKET.test(configuration.bucket)) {
    throw new Error('lab_export_storage_configuration_invalid')
  }
  return async function readPrivateObject(providerConnectionId: string, objectKey: string, maxBytes: number): Promise<Uint8Array | null> {
    if (providerConnectionId !== configuration.providerConnectionId
      || !objectKey || objectKey.length > 1024 || /[\\x00-\\x1f\\x7f]/.test(objectKey)
      || objectKey.startsWith('/') || objectKey.split('/').some(x => !x || x === '.' || x === '..')
      || /^(?:https?:|file:|s3:)/i.test(objectKey)
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) return null
    // Fail closed if an operator accidentally connects a public bucket.
    const { data: bucket, error: bucketError } = await client.storage.getBucket(configuration.bucket)
    if (bucketError || !bucket || bucket.public !== false) return null
    const { data, error } = await client.storage.from(configuration.bucket).download(objectKey)
    if (error || !data || data.size < 1 || data.size > maxBytes) return null
    const bytes = new Uint8Array(await data.arrayBuffer())
    return bytes.byteLength > 0 && bytes.byteLength <= maxBytes ? bytes : null
  }
}
