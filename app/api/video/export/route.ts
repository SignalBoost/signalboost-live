import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { createOverageBillingSession } from '@/lib/video/billing'
import { assertCanExport, calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale, VideoExportPayload } from '@/lib/video/types'

const queueDir = join(process.cwd(), '.video-queue')
const MAX_REQUEST_BYTES = 256 * 1024
const MAX_URL_BYTES = 2048
const MAX_FILENAME_BYTES = 180
const MAX_CAPTIONS_BYTES = 128 * 1024
const MAX_VIDEO_DURATION_SECONDS = 24 * 60 * 60
const MAX_USED_MINUTES = 10_000_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const textEncoder = new TextEncoder()

class RequestValidationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function locale(value: string | undefined): SupportedVideoLocale { return value && ['en','es','pt','pl','ru'].includes(value) ? value as SupportedVideoLocale : 'en' }
function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function byteLength(value: string) { return textEncoder.encode(value).byteLength }
function jsonValueByteLength(value: unknown) {
  const serialized = JSON.stringify(value)
  return typeof serialized === 'string' ? byteLength(serialized) : 0
}

async function readLimitedRequestBody(request: Request) {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new RequestValidationError('Invalid Content-Length header')
    }
    if (contentLength > MAX_REQUEST_BYTES) {
      throw new RequestValidationError('Request body is too large', 413)
    }
  }

  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let receivedBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    receivedBytes += value.byteLength
    if (receivedBytes > MAX_REQUEST_BYTES) {
      throw new RequestValidationError('Request body is too large', 413)
    }
    chunks.push(value)
  }

  const body = new Uint8Array(receivedBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body)
  } catch {
    throw new RequestValidationError('Request body must be valid UTF-8')
  }
}

function validateVideoExportPayload(body: string): VideoExportPayload {
  if (!body.trim()) {
    throw new RequestValidationError('Request body must be valid JSON')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new RequestValidationError('Request body must be valid JSON')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestValidationError('Request body must be a JSON object')
  }

  const payload = parsed as Record<string, unknown>
  const sourceUrl = payload.sourceUrl
  if (typeof sourceUrl !== 'string' || !sourceUrl || byteLength(sourceUrl) > MAX_URL_BYTES) {
    throw new RequestValidationError('sourceUrl must be a valid URL')
  }

  let parsedSourceUrl: URL
  try {
    parsedSourceUrl = new URL(sourceUrl)
  } catch {
    throw new RequestValidationError('sourceUrl must be a valid URL')
  }
  if (!['http:', 'https:'].includes(parsedSourceUrl.protocol)) {
    throw new RequestValidationError('sourceUrl must use http or https')
  }

  const filename = payload.filename
  if (typeof filename !== 'string' || !filename || byteLength(filename) > MAX_FILENAME_BYTES) {
    throw new RequestValidationError('filename is invalid')
  }
  if (filename === '.' || filename === '..' || /[\\/\x00-\x1f\x7f]/.test(filename)) {
    throw new RequestValidationError('filename is invalid')
  }

  const durationSec = payload.durationSec
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_VIDEO_DURATION_SECONDS) {
    throw new RequestValidationError('durationSec is invalid')
  }

  const usedMinutes = payload.usedMinutes
  if (typeof usedMinutes !== 'number' || !Number.isFinite(usedMinutes) || usedMinutes < 0 || usedMinutes > MAX_USED_MINUTES) {
    throw new RequestValidationError('usedMinutes is invalid')
  }

  const tier = payload.tier
  if (typeof tier !== 'string' || !tier || tier.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(tier)) {
    throw new RequestValidationError('tier is invalid')
  }

  const billingProvider = payload.billingProvider
  if (billingProvider !== undefined && billingProvider !== '') {
    if (typeof billingProvider !== 'string' || billingProvider.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(billingProvider)) {
      throw new RequestValidationError('billingProvider is invalid')
    }
  }

  const localeValue = payload.locale
  if (localeValue !== undefined && (typeof localeValue !== 'string' || localeValue.length > 8)) {
    throw new RequestValidationError('locale is invalid')
  }

  if (payload.captions !== undefined && jsonValueByteLength(payload.captions) > MAX_CAPTIONS_BYTES) {
    throw new RequestValidationError('captions are too large')
  }

  return parsed as VideoExportPayload
}

async function cleanupQueuedPayload(payloadPath: string) {
  try {
    await rm(payloadPath, { force: true })
  } catch {
    // Best effort cleanup only.
  }
}

async function cleanupJobRecords(supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>, jobId: string) {
  try {
    await supabase.from('billing_overage_events').delete().eq('job_id', jobId)
    await supabase.from('video_jobs').delete().eq('id', jobId)
  } catch {
    // Best effort cleanup only.
  }
}

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>, userId: string) {
  if (!UUID_PATTERN.test(userId)) return null

  const { data } = await supabase
    .from('accounts')
    .select('id')
    .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, data: null, error: 'Authentication is required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return json({ ok: false, data: null, error: 'Authentication is required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  if (!accountId) {
    return json({ ok: false, data: null, error: 'Account access is required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 403)
  }

  let payload: VideoExportPayload
  try {
    payload = validateVideoExportPayload(await readLimitedRequestBody(request))
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return json({ ok: false, data: null, error: error.message, meta: { locale: 'en', generatedAt: new Date().toISOString() } }, error.status)
    }
    throw error
  }

  const lang = locale(payload.locale)
  const quota = calculateVideoQuota(payload.tier, payload.usedMinutes + Math.ceil(payload.durationSec / 60), payload.billingProvider || 'stripe')
  const permission = assertCanExport(quota)
  if (!permission.allowed) {
    return json({ ok: false, data: null, error: permission.reason, meta: { locale: lang, generatedAt: new Date().toISOString() } }, 402)
  }

  const jobId = randomUUID()
  const billingSession = await createOverageBillingSession({ jobId, quota, returnUrl: new URL('/dashboard/video', request.url).toString() })

  const { error: jobInsertError } = await supabase.from('video_jobs').insert({
    id: jobId,
    user_id: user.id,
    account_id: accountId,
    source_video: payload.sourceUrl,
    status: 'queued',
    job_type: 'export',
    queue_payload: payload,
    file_name: payload.filename,
    duration_seconds: Math.round(payload.durationSec),
    captions: payload.captions,
    plan: quota.tier,
  })
  if (jobInsertError) {
    return json({ ok: false, data: null, error: 'Failed to queue export', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

  if (quota.requiresOverageCharge) {
    const { error: billingInsertError } = await supabase.from('billing_overage_events').insert({
      user_id: user.id,
      account_id: accountId,
      provider: quota.overageProvider,
      job_id: jobId,
      amount_usd: Number((quota.overageMinutes * quota.overageRateUsd).toFixed(2)),
      status: 'pending',
      metadata: { quota, gateway: quota.overageProvider, billingSession },
    })
    if (billingInsertError) {
      await cleanupJobRecords(supabase, jobId)
      return json({ ok: false, data: null, error: 'Failed to queue export', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
    }
  }

  await mkdir(queueDir, { recursive: true })
  const payloadPath = join(queueDir, `${jobId}.json`)
  try {
    await writeFile(payloadPath, JSON.stringify(payload, null, 2), 'utf8')
  } catch {
    await cleanupQueuedPayload(payloadPath)
    await cleanupJobRecords(supabase, jobId)
    return json({ ok: false, data: null, error: 'Failed to queue export', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

  return json({
    ok: true,
    data: { jobId, status: 'queued' as const, quota, billing: billingSession },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  }, 202)
}
