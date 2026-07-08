import type { SupabaseClient } from '@supabase/supabase-js'

export const COS_VIDEO_RENDER_BUCKET_ENV = 'COS_VIDEO_RENDER_BUCKET'
export const DEFAULT_COS_VIDEO_RENDER_BUCKET = 'video-renders'

export type CosStorageCheck = {
  provider: 'supabase-storage'
  bucket: string
  bucketExists: boolean
}

export function cosVideoRenderBucket(): string {
  const bucket = String(process.env[COS_VIDEO_RENDER_BUCKET_ENV] || '').trim()
  if (bucket) return bucket
  if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error(`${COS_VIDEO_RENDER_BUCKET_ENV} is required for the COSA video pipeline. Expected Supabase Storage bucket name, for example "${DEFAULT_COS_VIDEO_RENDER_BUCKET}".`)
  }
  return DEFAULT_COS_VIDEO_RENDER_BUCKET
}

function storageMessage(error: any): string {
  return error?.message || error?.error || String(error || 'unknown storage error')
}

export async function ensureCosVideoRenderBucket(
  supabase: SupabaseClient<any, any, any>,
  opts: { createIfMissing?: boolean; bucket?: string } = {},
): Promise<CosStorageCheck> {
  const bucket = opts.bucket || cosVideoRenderBucket()
  const listed = await supabase.storage.listBuckets()
  if (listed.error) throw new Error(`Supabase Storage bucket check failed for bucket "${bucket}": ${storageMessage(listed.error)}`)
  const exists = Boolean((listed.data || []).some((b: any) => b?.name === bucket || b?.id === bucket))
  if (exists) return { provider: 'supabase-storage', bucket, bucketExists: true }

  if (opts.createIfMissing) {
    const created = await supabase.storage.createBucket(bucket, { public: false })
    if (!created.error) return { provider: 'supabase-storage', bucket, bucketExists: true }
    const refreshed = await supabase.storage.listBuckets()
    const nowExists = Boolean((refreshed.data || []).some((b: any) => b?.name === bucket || b?.id === bucket))
    if (nowExists) return { provider: 'supabase-storage', bucket, bucketExists: true }
    throw new Error(`Supabase Storage bucket "${bucket}" does not exist and automatic creation failed: ${storageMessage(created.error)}`)
  }

  throw new Error(`Supabase Storage bucket "${bucket}" does not exist. Create it or set ${COS_VIDEO_RENDER_BUCKET_ENV} to an existing bucket.`)
}

export function logCosVideoStorageFailure(context: {
  stage: string
  campaignId?: string | null
  requestId?: string | null
  bucket: string
  objectPath?: string | null
  bucketExists?: boolean | null
  error: unknown
}) {
  console.error('COSA video storage failure', {
    stage: context.stage,
    campaignId: context.campaignId || null,
    requestId: context.requestId || null,
    storageProvider: 'supabase-storage',
    bucket: context.bucket,
    objectPath: context.objectPath || null,
    bucketExists: context.bucketExists ?? null,
    storageSdkError: storageMessage(context.error),
  })
}
