import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import {
  VIDEO_BUCKET,
  bytesToRoundedMb,
  cleanupWorkDir,
  createUsageSnapshot,
  getOriginalExtension,
  normalizeSubscriptionTier,
  readAsset,
  safeBaseName,
  transcodeWithFfmpeg,
  type SubscriptionTier,
} from '@/lib/video/transcoding'

export const runtime = 'nodejs'
export const maxDuration = 300

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24

function jsonError(error: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(details ?? {}) }, { status })
}

function getOrigin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || 'https://signalboostapp.com'
}

async function getAuthenticatedClients() {
  const cookieStore = await cookies()
  const supabaseUser = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  )
  const { data: { user }, error } = await supabaseUser.auth.getUser()
  if (error || !user) return { user: null, supabaseAdmin: null }
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  return { user, supabaseAdmin }
}

export async function POST(req: NextRequest) {
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter((key) => !process.env[key])
  if (missing.length) return jsonError(`Server config error: missing ${missing.join(', ')}`, 500)

  const { user, supabaseAdmin } = await getAuthenticatedClients()
  if (!user || !supabaseAdmin) return jsonError('Unauthorized', 401)

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonError('Invalid multipart form data.', 400)
  }

  const file = formData.get('file') as File | null
  if (!file || file.size <= 0) return jsonError('Upload a non-empty video file.', 400)

  const accountId = String(formData.get('accountId') || user.id)
  const forcedTier = formData.get('subscriptionTier')
  const jobId = crypto.randomUUID()
  const originalExtension = getOriginalExtension(file.name)
  const originalSizeMb = bytesToRoundedMb(file.size)
  const originalFilename = file.name.replace(/[\u0000-\u001f]/g, '').slice(0, 180) || `upload.${originalExtension}`

  await supabaseAdmin.from('accounts').upsert({ id: accountId, updated_at: new Date().toISOString() }, { onConflict: 'id' })

  const subscriptionTier = await resolveSubscriptionTier(supabaseAdmin, user.id, forcedTier)
  const existingUsage = await getExistingUsage(supabaseAdmin, accountId, subscriptionTier)
  const usage = createUsageSnapshot({
    accountId,
    subscriptionTier,
    quotaMb: existingUsage.quotaMb,
    usedMb: existingUsage.usedMb,
    uploadMb: originalSizeMb,
  })

  await upsertUsage(supabaseAdmin, usage)
  await supabaseAdmin.from('video_transcodes').insert({
    id: jobId,
    account_id: accountId,
    original_filename: originalFilename,
    original_extension: originalExtension,
    original_size_mb: originalSizeMb,
    transcoded_filename: null,
    transcoded_format: 'mp4',
    transcoded_size_mb: null,
    status: 'pending',
  })

  let workDir: string | null = null
  try {
    await supabaseAdmin.from('video_transcodes').update({ status: 'processing', updated_at: new Date().toISOString() }).eq('id', jobId)
    const output = await transcodeWithFfmpeg({ file, jobId, subscriptionTier })
    workDir = output.workDir

    const folder = `${accountId}/${jobId}`
    const originalKey = `${folder}/original/${safeBaseName(originalFilename)}.${originalExtension}`
    const mp4Key = `${folder}/playback/${output.transcodedFilename}`
    const hlsSegmentKeys = output.hlsSegmentPaths.map((path) => `${folder}/hls/${basename(path)}`)
    const hlsManifestKey = `${folder}/hls/index.m3u8`

    await uploadObject(supabaseAdmin, originalKey, await readAsset(output.originalPath), file.type || 'application/octet-stream')
    await uploadObject(supabaseAdmin, mp4Key, await readAsset(output.mp4Path), 'video/mp4')

    for (let index = 0; index < output.hlsSegmentPaths.length; index += 1) {
      await uploadObject(supabaseAdmin, hlsSegmentKeys[index], await readAsset(output.hlsSegmentPaths[index]), 'video/mp2t')
    }

    const segmentSignedUrls = await signedUrls(supabaseAdmin, hlsSegmentKeys)
    const rawManifest = await readFile(output.hlsManifestPath, 'utf8')
    const rewrittenManifest = rawManifest.replace(/segment-\d+\.ts/g, (segment) => {
      const key = `${folder}/hls/${segment}`
      return segmentSignedUrls[key] ?? segment
    })
    await uploadObject(supabaseAdmin, hlsManifestKey, Buffer.from(rewrittenManifest), 'application/vnd.apple.mpegurl')

    const mediaUrls = await signedUrls(supabaseAdmin, [mp4Key, hlsManifestKey])
    const billing = await createOverageBillingLinks({
      req,
      accountId,
      jobId,
      usage,
      originalFilename,
    })

    await supabaseAdmin.from('video_transcodes').update({
      transcoded_filename: output.transcodedFilename,
      transcoded_size_mb: output.transcodedSizeMb,
      status: 'ready',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId)

    return NextResponse.json({
      ok: true,
      asset: {
        id: jobId,
        originalFilename,
        originalExtension,
        originalSizeMb,
        transcodedFilename: output.transcodedFilename,
        transcodedFormat: 'mp4',
        transcodedSizeMb: output.transcodedSizeMb,
        status: 'ready',
        mp4Key,
        hlsManifestKey,
        hlsSegmentKeys,
        demoTrimmed: subscriptionTier === 'free',
        usage,
      },
      playback: {
        mp4Url: mediaUrls[mp4Key],
        hlsUrl: mediaUrls[hlsManifestKey],
        serve: 'hls_preferred_mp4_fallback',
      },
      billing,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Video transcoding failed.'
    await supabaseAdmin.from('video_transcodes').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', jobId)
    return jsonError(message, 500, { jobId })
  } finally {
    if (workDir) await cleanupWorkDir(workDir)
  }
}

async function resolveSubscriptionTier(supabase: any, userId: string, forcedTier: FormDataEntryValue | null): Promise<SubscriptionTier> {
  if (forcedTier) return normalizeSubscriptionTier(forcedTier)
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, tier, status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return normalizeSubscriptionTier(data?.tier ?? data?.plan)
}

async function getExistingUsage(supabase: any, accountId: string, tier: SubscriptionTier): Promise<{ quotaMb: number | null; usedMb: number }> {
  const { data } = await supabase
    .from('video_usage')
    .select('quota_mb, used_mb')
    .eq('account_id', accountId)
    .eq('subscription_tier', tier)
    .maybeSingle()
  return { quotaMb: data?.quota_mb ?? null, usedMb: Number(data?.used_mb ?? 0) }
}

async function upsertUsage(supabase: any, usage: ReturnType<typeof createUsageSnapshot>) {
  await supabase.from('video_usage').upsert({
    account_id: usage.accountId,
    subscription_tier: usage.subscriptionTier,
    quota_mb: usage.quotaMb,
    used_mb: usage.usedMb,
    overage_charges: usage.overageCharges,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,subscription_tier' })
}

async function uploadObject(supabase: any, key: string, body: Buffer, contentType: string) {
  const { error } = await supabase.storage.from(VIDEO_BUCKET).upload(key, body, { contentType, upsert: true })
  if (error) throw new Error(`Storage upload failed for ${key}: ${error.message}`)
}

async function signedUrls(supabase: any, keys: string[]) {
  const out: Record<string, string> = {}
  for (const key of keys) {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(key, SIGNED_URL_TTL_SECONDS)
    if (error || !data?.signedUrl) throw new Error(`Could not sign playback asset ${key}: ${error?.message ?? 'missing signed URL'}`)
    out[key] = data.signedUrl
  }
  return out
}

async function createOverageBillingLinks(input: {
  req: NextRequest
  accountId: string
  jobId: string
  usage: ReturnType<typeof createUsageSnapshot>
  originalFilename: string
}) {
  if (!input.usage.extraChargeRequired || input.usage.overageCharges <= 0) {
    return { required: false, amountUsd: 0, stripeCheckoutUrl: null, paypalCheckoutUrl: null, message: null }
  }

  const origin = getOrigin(input.req)
  let stripeCheckoutUrl: string | null = null
  if (process.env.STRIPE_SECRET_KEY) {
    stripeCheckoutUrl = await createStripeCheckoutUrl({
      secretKey: process.env.STRIPE_SECRET_KEY,
      origin,
      accountId: input.accountId,
      jobId: input.jobId,
      amountUsd: input.usage.overageCharges,
      originalFilename: input.originalFilename,
    })
  }

  const paypalCheckoutUrl = createPayPalCheckoutUrl(input.usage.overageCharges, input.jobId)
  return {
    required: true,
    amountUsd: input.usage.overageCharges,
    stripeCheckoutUrl,
    paypalCheckoutUrl,
    message: stripeCheckoutUrl || paypalCheckoutUrl
      ? 'Over-quota playback is billable; complete a provider checkout to reconcile storage overage.'
      : 'Over-quota playback is billable. Configure STRIPE_SECRET_KEY or PAYPAL_MERCHANT_ID to collect charges automatically.',
  }
}


async function createStripeCheckoutUrl(input: {
  secretKey: string
  origin: string
  accountId: string
  jobId: string
  amountUsd: number
  originalFilename: string
}) {
  const params = new URLSearchParams()
  params.set('mode', 'payment')
  params.set('success_url', `${input.origin}/dashboard/video?videoBilling=success&job=${input.jobId}`)
  params.set('cancel_url', `${input.origin}/dashboard/video?videoBilling=cancelled&job=${input.jobId}`)
  params.set('line_items[0][quantity]', '1')
  params.set('line_items[0][price_data][currency]', 'usd')
  params.set('line_items[0][price_data][unit_amount]', String(Math.max(50, Math.round(input.amountUsd * 100))))
  params.set('line_items[0][price_data][product_data][name]', `SignalBoost video overage for ${input.originalFilename}`)
  params.set('metadata[accountId]', input.accountId)
  params.set('metadata[jobId]', input.jobId)
  params.set('metadata[feature]', 'video_overage')

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.secretKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })
  if (!response.ok) throw new Error(`Stripe checkout creation failed: ${response.status}`)
  const data = await response.json() as { url?: string | null }
  return data.url ?? null
}

function createPayPalCheckoutUrl(amountUsd: number, jobId: string) {
  const merchant = process.env.PAYPAL_MERCHANT_ID
  if (!merchant) return null
  const params = new URLSearchParams({
    cmd: '_xclick',
    business: merchant,
    item_name: `SignalBoost video overage ${jobId}`,
    amount: amountUsd.toFixed(2),
    currency_code: 'USD',
    custom: jobId,
  })
  return `https://www.paypal.com/cgi-bin/webscr?${params.toString()}`
}
