import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { createOverageBillingSession } from '@/lib/video/billing'
import { assertCanExport, calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale, VideoExportPayload } from '@/lib/video/types'

const queueDir = join(process.cwd(), '.video-queue')
const supportedLocales = ['en','es','pt','pl','ru'] as const
const maxRequestBytes = 1024 * 1024
const maxQueuePayloadBytes = 1024 * 1024
const maxStringLength = 64 * 1024
const maxArrayItems = 5000
const maxObjectKeys = 100
const maxJsonDepth = 20
const maxDurationSeconds = 24 * 60 * 60
const maxUsedMinutes = 10 * 365 * 24 * 60
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function locale(value: unknown): SupportedVideoLocale { return typeof value === 'string' && (supportedLocales as readonly string[]).includes(value) ? value as SupportedVideoLocale : 'en' }
function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function isUuid(value: string) { return uuidRegex.test(value) }

async function removeQueuedPayload(payloadPath: string) {
  try {
    await unlink(payloadPath)
  } catch {
    // Best-effort cleanup only.
  }
}

async function readJsonWithLimit(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; error: string; status: number }> {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const declaredLength = Number(contentLength)
    if (Number.isFinite(declaredLength) && declaredLength > maxRequestBytes) {
      return { ok: false, error: 'Request body too large', status: 413 }
    }
  }

  if (!request.body) {
    return { ok: false, error: 'Request body is required', status: 400 }
  }

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > maxRequestBytes) {
        await reader.cancel()
        return { ok: false, error: 'Request body too large', status: 413 }
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch {
    return { ok: false, error: 'Failed to read request body', status: 400 }
  }

  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, error: 'Malformed JSON payload', status: 400 }
  }
}

function validateJsonShape(value: unknown, depth = 0): string | null {
  if (depth > maxJsonDepth) return 'Payload is too deeply nested'
  if (value === null) return null

  if (typeof value === 'string') {
    return value.length > maxStringLength ? 'Payload string value is too long' : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? null : 'Payload contains an invalid number'
  }

  if (typeof value === 'boolean') return null

  if (Array.isArray(value)) {
    if (value.length > maxArrayItems) return 'Payload array is too large'
    for (const item of value) {
      const error = validateJsonShape(item, depth + 1)
      if (error) return error
    }
    return null
  }

  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length > maxObjectKeys) return 'Payload object has too many fields'
    for (const key of keys) {
      if (key.length > 256) return 'Payload field name is too long'
      const error = validateJsonShape(value[key], depth + 1)
      if (error) return error
    }
    return null
  }

  return 'Payload contains an unsupported value'
}

function validateVideoExportPayload(value: unknown): { ok: true; payload: VideoExportPayload } | { ok: false; error: string } {
  const shapeError = validateJsonShape(value)
  if (shapeError) return { ok: false, error: shapeError }
  if (!isRecord(value)) return { ok: false, error: 'Payload must be a JSON object' }

  const durationSec = value.durationSec
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec) || durationSec <= 0 || durationSec > maxDurationSeconds) {
    return { ok: false, error: 'durationSec must be a positive bounded number' }
  }

  const usedMinutes = value.usedMinutes
  if (typeof usedMinutes !== 'number' || !Number.isFinite(usedMinutes) || usedMinutes < 0 || usedMinutes > maxUsedMinutes) {
    return { ok: false, error: 'usedMinutes must be a non-negative bounded number' }
  }

  const tier = value.tier
  if (typeof tier !== 'string' || tier.length === 0 || tier.length > 64) {
    return { ok: false, error: 'tier must be a valid string' }
  }

  if (value.billingProvider !== undefined && value.billingProvider !== null && value.billingProvider !== '') {
    if (typeof value.billingProvider !== 'string' || value.billingProvider.length > 64) {
      return { ok: false, error: 'billingProvider must be a valid string' }
    }
  }

  if (value.locale !== undefined && value.locale !== null && value.locale !== '') {
    if (typeof value.locale !== 'string' || value.locale.length > 16) {
      return { ok: false, error: 'locale must be a valid string' }
    }
  }

  if (value.sourceUrl !== undefined && value.sourceUrl !== null) {
    if (typeof value.sourceUrl !== 'string' || value.sourceUrl.length > 4096) {
      return { ok: false, error: 'sourceUrl must be a valid string' }
    }
  }

  if (value.filename !== undefined && value.filename !== null) {
    if (typeof value.filename !== 'string' || value.filename.length > 255) {
      return { ok: false, error: 'filename must be a valid string' }
    }
  }

  return { ok: true, payload: { ...value, durationSec, usedMinutes, tier } as VideoExportPayload }
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
  if (authError || !user || !isUuid(user.id)) {
    return json({ ok: false, data: null, error: 'Authentication required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  if (!accountId) {
    return json({ ok: false, data: null, error: 'Account access required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 403)
  }

  const parsedBody = await readJsonWithLimit(request)
  if (!parsedBody.ok) {
    return json({ ok: false, data: null, error: parsedBody.error, meta: { locale: 'en', generatedAt: new Date().toISOString() } }, parsedBody.status)
  }

  const validatedPayload = validateVideoExportPayload(parsedBody.value)
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

  const serializedPayload = JSON.stringify(payload)
  if (Buffer.byteLength(serializedPayload, 'utf8') > maxQueuePayloadBytes) {
    return json({ ok: false, data: null, error: 'Request body too large', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 413)
  }

  const jobId = randomUUID()
  await mkdir(queueDir, { recursive: true })
  const payloadPath = join(queueDir, `${jobId}.json`)
  try {
    await writeFile(payloadPath, serializedPayload, 'utf8')
  } catch {
    return json({ ok: false, data: null, error: 'Failed to queue export job', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

  let billingSession
  try {
    billingSession = await createOverageBillingSession({ jobId, quota, returnUrl: new URL('/dashboard/video', request.url).toString() })
  } catch {
    await removeQueuedPayload(payloadPath)
    return json({ ok: false, data: null, error: 'Failed to create billing session', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
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
    await removeQueuedPayload(payloadPath)
    return json({ ok: false, data: null, error: 'Failed to persist export job', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

  if (quota.requiresOverageCharge) {
    const { error: overageInsertError } = await supabase.from('billing_overage_events').insert({
      user_id: user.id,
      account_id: accountId,
      provider: quota.overageProvider,
      job_id: jobId,
      amount_usd: Number((quota.overageMinutes * quota.overageRateUsd).toFixed(2)),
      status: 'pending',
      metadata: { quota, gateway: quota.overageProvider, billingSession },
    })

    if (overageInsertError) {
      await removeQueuedPayload(payloadPath)
      return json({ ok: false, data: null, error: 'Failed to persist billing event', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
    }
  }

  return json({
    ok: true,
    data: { jobId, status: 'queued' as const, quota, billing: billingSession },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  }, 202)
}
