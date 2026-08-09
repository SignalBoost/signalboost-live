import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { createOverageBillingSession } from '@/lib/video/billing'
import { assertCanExport, calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale, VideoExportPayload } from '@/lib/video/types'

const queueDir = join(process.cwd(), '.video-queue')
const MAX_REQUEST_BODY_BYTES = 256 * 1024
const MAX_DURATION_SECONDS = 24 * 60 * 60
const MAX_USED_MINUTES = 10_000_000
const MAX_STRING_LENGTH = 32 * 1024
const MAX_ARRAY_LENGTH = 500
const MAX_OBJECT_KEYS = 100
const MAX_JSON_DEPTH = 8
const MAX_URL_LENGTH = 4096
const MAX_FILENAME_LENGTH = 255
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function locale(value: string | undefined): SupportedVideoLocale { return value && ['en','es','pt','pl','ru'].includes(value) ? value as SupportedVideoLocale : 'en' }
function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isUuid(value: string) { return UUID_PATTERN.test(value) }

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const parsedLength = Number(contentLength)
    if (Number.isFinite(parsedLength) && parsedLength > MAX_REQUEST_BODY_BYTES) {
      return { ok: false, status: 413, error: 'Request body is too large' }
    }
  }

  if (!request.body) return { ok: false, status: 400, error: 'Request body is required' }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let body = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      return { ok: false, status: 413, error: 'Request body is too large' }
    }
    body += decoder.decode(value, { stream: true })
  }
  body += decoder.decode()

  try {
    return { ok: true, value: JSON.parse(body) }
  } catch {
    return { ok: false, status: 400, error: 'Malformed JSON body' }
  }
}

function validateJsonBounds(value: unknown, depth = 0): string | null {
  if (depth > MAX_JSON_DEPTH) return 'Payload is too deeply nested'
  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) return 'Payload contains a string that is too long'
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) return 'Payload contains too many array items'
    for (const item of value) {
      const error = validateJsonBounds(item, depth + 1)
      if (error) return error
    }
  } else if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length > MAX_OBJECT_KEYS) return 'Payload contains too many fields'
    for (const key of keys) {
      const error = validateJsonBounds(value[key], depth + 1)
      if (error) return error
    }
  }
  return null
}

function validatePayload(value: unknown): { ok: true; payload: VideoExportPayload } | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: 'Request body must be a JSON object' }

  const boundsError = validateJsonBounds(value)
  if (boundsError) return { ok: false, error: boundsError }

  if (typeof value.durationSec !== 'number' || !Number.isFinite(value.durationSec) || value.durationSec <= 0 || value.durationSec > MAX_DURATION_SECONDS) {
    return { ok: false, error: 'durationSec must be a positive bounded number' }
  }

  if (typeof value.usedMinutes !== 'number' || !Number.isFinite(value.usedMinutes) || value.usedMinutes < 0 || value.usedMinutes > MAX_USED_MINUTES) {
    return { ok: false, error: 'usedMinutes must be a non-negative bounded number' }
  }

  if (typeof value.tier !== 'string' || value.tier.length === 0 || value.tier.length > 100) {
    return { ok: false, error: 'tier must be a valid string' }
  }

  if (value.billingProvider !== undefined && (typeof value.billingProvider !== 'string' || value.billingProvider.length > 50)) {
    return { ok: false, error: 'billingProvider must be a valid string' }
  }

  if (value.locale !== undefined && (typeof value.locale !== 'string' || value.locale.length > 16)) {
    return { ok: false, error: 'locale must be a valid string' }
  }

  if (value.sourceUrl !== undefined && (typeof value.sourceUrl !== 'string' || value.sourceUrl.length > MAX_URL_LENGTH)) {
    return { ok: false, error: 'sourceUrl must be a valid string' }
  }

  if (value.filename !== undefined && (typeof value.filename !== 'string' || value.filename.length > MAX_FILENAME_LENGTH)) {
    return { ok: false, error: 'filename must be a valid string' }
  }

  return { ok: true, payload: value as VideoExportPayload }
}

async function cleanupQueueFile(path: string) {
  await unlink(path).catch(() => undefined)
}

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>, userId: string) {
  if (!isUuid(userId)) return null

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
    return json({ ok: false, data: null, error: 'Authentication required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json({ ok: false, data: null, error: 'Authentication required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const parsedBody = await readJsonBody(request)
  if (!parsedBody.ok) {
    return json({ ok: false, data: null, error: parsedBody.error, meta: { locale: 'en', generatedAt: new Date().toISOString() } }, parsedBody.status)
  }

  const validatedPayload = validatePayload(parsedBody.value)
  if (!validatedPayload.ok) {
    return json({ ok: false, data: null, error: validatedPayload.error, meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 400)
  }

  const payload = validatedPayload.payload
  const lang = locale(payload.locale)
  const quota = calculateVideoQuota(payload.tier, payload.usedMinutes + Math.ceil(payload.durationSec / 60), payload.billingProvider || 'stripe')
  const permission = assertCanExport(quota)
  if (!permission.allowed) {
    return json({ ok: false, data: null, error: permission.reason, meta: { locale: lang, generatedAt: new Date().toISOString() } }, 402)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  const jobId = randomUUID()

  try {
    await mkdir(queueDir, { recursive: true })
  } catch {
    return json({ ok: false, data: null, error: 'Unable to prepare export queue', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

  const payloadPath = join(queueDir, `${jobId}.json`)
  try {
    await writeFile(payloadPath, JSON.stringify(payload), 'utf8')
  } catch {
    return json({ ok: false, data: null, error: 'Unable to write export queue payload', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

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
    await cleanupQueueFile(payloadPath)
    return json({ ok: false, data: null, error: 'Unable to queue export job', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

  let billingSession
  try {
    billingSession = await createOverageBillingSession({ jobId, quota, returnUrl: new URL('/dashboard/video', request.url).toString() })
  } catch {
    await cleanupQueueFile(payloadPath)
    await supabase.from('video_jobs').delete().eq('id', jobId)
    return json({ ok: false, data: null, error: 'Unable to create billing session', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 502)
  }

  if (quota.requiresOverageCharge) {
    const { error: billingEventError } = await supabase.from('billing_overage_events').insert({
      user_id: user.id,
      account_id: accountId,
      provider: quota.overageProvider,
      job_id: jobId,
      amount_usd: Number((quota.overageMinutes * quota.overageRateUsd).toFixed(2)),
      status: 'pending',
      metadata: { quota, gateway: quota.overageProvider, billingSession },
    })

    if (billingEventError) {
      await cleanupQueueFile(payloadPath)
      await supabase.from('video_jobs').delete().eq('id', jobId)
      return json({ ok: false, data: null, error: 'Unable to record billing event', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
    }
  }

  return json({
    ok: true,
    data: { jobId, status: 'queued' as const, quota, billing: billingSession },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  }, 202)
}
