// saas/lib/cos/objectStore.ts
// Injected object-storage seam for the COS render pipeline. Uploaders and signers talk to THIS
// port, never to Supabase Storage directly, so a Fortune-500 buyer drops rendered assets into
// THEIR bucket (S3, Azure Blob, GCS) by supplying one adapter — the render pipeline never changes.
// On SignalBoost's own deployment createSupabaseObjectStore() is the adapter and behaviour is
// identical to the previous direct storage.from(bucket).upload / createSignedUrl calls.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cosVideoRenderBucket, ensureCosVideoRenderBucket } from './video-storage.ts'

export type ObjectStoreCheck = { bucket: string; bucketExists: boolean }

export interface ObjectStorePort {
  readonly bucket: string
  ensureContainer(opts?: { createIfMissing?: boolean }): Promise<ObjectStoreCheck>
  put(key: string, bytes: Buffer | Uint8Array, opts: { contentType: string; upsert?: boolean }): Promise<{ ok: boolean; error?: string }>
  signedUrl(key: string, ttlSeconds: number): Promise<{ url: string | null; error?: string }>
}

function defaultAdminClient(): SupabaseClient<any, any, any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service credentials are not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ── SignalBoost's own adapter (the host implementation) ──
export function createSupabaseObjectStore(opts: { client?: SupabaseClient<any, any, any>; bucket?: string } = {}): ObjectStorePort {
  const bucket = opts.bucket || cosVideoRenderBucket()
  const client = opts.client || defaultAdminClient()
  return {
    bucket,
    async ensureContainer(o) {
      const check = await ensureCosVideoRenderBucket(client, { createIfMissing: o?.createIfMissing, bucket })
      return { bucket: check.bucket, bucketExists: check.bucketExists }
    },
    async put(key, bytes, o) {
      const up = await client.storage.from(bucket).upload(key, bytes, { contentType: o.contentType, upsert: o.upsert ?? true })
      return up.error ? { ok: false, error: up.error.message } : { ok: true }
    },
    async signedUrl(key, ttlSeconds) {
      const signed = await client.storage.from(bucket).createSignedUrl(key, ttlSeconds)
      return (signed.error || !signed.data?.signedUrl)
        ? { url: null, error: signed.error?.message || 'missing signed URL' }
        : { url: signed.data.signedUrl }
    },
  }
}
