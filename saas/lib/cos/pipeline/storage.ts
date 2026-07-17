export type BucketVerification = {
  ok: boolean
  bucketName: string
  provisioned: boolean
  fallbackBucket?: string
  error?: string
}

function endpointFor(bucket: string) {
  const base = String(process.env.COS_S3_ENDPOINT || '').replace(/\/+$/, '')
  if (!base) throw new Error('COS_S3_ENDPOINT is required for S3-compatible bucket verification.')
  return process.env.COS_S3_FORCE_PATH_STYLE === '1' ? `${base}/${encodeURIComponent(bucket)}` : base.replace('://', `://${bucket}.`)
}

async function bucketExists(bucket: string) {
  const response = await fetch(endpointFor(bucket), { method: 'HEAD', cache: 'no-store' })
  if (response.ok || response.status === 403) return true
  if (response.status === 404) return false
  throw new Error(`bucket HEAD returned ${response.status}`)
}

async function createBucket(bucket: string) {
  const response = await fetch(endpointFor(bucket), { method: 'PUT', cache: 'no-store' })
  if (!response.ok && response.status !== 409) throw new Error(`bucket create returned ${response.status}: ${(await response.text()).slice(0, 300)}`)
}

export async function verifyOrProvisionBucket(bucketName: string): Promise<BucketVerification> {
  const requested = bucketName.trim()
  if (!requested) return { ok: false, bucketName: requested, provisioned: false, error: 'bucketName is required' }
  try {
    if (await bucketExists(requested)) return { ok: true, bucketName: requested, provisioned: false }
    if (process.env.COS_AUTO_CREATE_RENDER_BUCKET === '1') {
      await createBucket(requested)
      if (await bucketExists(requested)) return { ok: true, bucketName: requested, provisioned: true }
    }
    const fallbackBucket = process.env.COS_GLOBAL_RENDER_BUCKET || ''
    if (fallbackBucket && await bucketExists(fallbackBucket)) return { ok: true, bucketName: fallbackBucket, provisioned: false, fallbackBucket, error: `Requested bucket ${requested} was unavailable.` }
    return { ok: false, bucketName: requested, provisioned: false, fallbackBucket: fallbackBucket || undefined, error: `Render bucket ${requested} is unavailable and no verified fallback bucket exists.` }
  } catch (error) {
    return { ok: false, bucketName: requested, provisioned: false, error: error instanceof Error ? error.message : String(error) }
  }
}
