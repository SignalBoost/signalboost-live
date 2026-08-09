import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { createOverageBillingSession } from '@/lib/video/billing'
import { assertCanExport, calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale, VideoExportPayload } from '@/lib/video/types'

const queueDir = join(process.cwd(), '.video-queue')
const maxRequestBodyBytes = 1024 * 1024
const maxDurationSeconds = 24 * 60 * 60
const maxUsedMinutes = 10_000_000
const maxStringLength = 64 * 1024
const maxArrayItems = 1_000
const maxObjectKeys = 100
const maxJsonDepth = 8
const allowedPayloadKeys = new Set(['sourceUrl', 'filename', 'locale', 'captions', 'durationSec', 'tier', 'usedMinutes', 'billingProvider'])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function locale(value: string | undefined): SupportedVideoLocale { return value && ['en','es','pt','pl','ru'].includes(value) ? value as SupportedVideoLocale : 'en' }
function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateJsonLimits(value: unknown, depth = 0): string | null {
  if (depth > maxJsonDepth) return 'Payload is too deeply nested'
  if (typeof value === 'string') return value.length <= maxStringLength ? null : 'Payload contains a string that is too long'
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return null
  if (Array.isArray(value)) {
    if (value.length > maxArrayItems) return 'Payload contains too many array items'
    for (const item of value) {
      const error = validateJsonLimits(item, depth + 1)
      if (error) return error
    }
    return null
  }
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length > maxObjectKeys) return 'Payload contains too many fields'
    for (const key of keys) {
      if (key.length > 128) return 'Payload contains a field name that is too long'
      const error = validateJsonLimits(value[key], depth + 1)
      if (error) return error
    }
    return null
  }
  return 'Payload contains an unsupported value'
}

async function readRequestBody(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const parsedLength = Number(contentLength)
    if (Number.isFinite(parsedLength) && parsedLength > maxRequestBodyBytes) {
      return { ok: false as const, status: 413, error: 'Request body is too large' }
    }
  }

  if (!request.body) return { ok: true as const, body: '' }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxRequestBodyBytes) {
      await reader.cancel()
      return { ok: false as const, status: 413, error: 'Request body is too large' }
    }
    chunks.push(value)
  }

  const buffer = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { ok: true as const, body: new TextDecoder().decode(buffer) }
}

async function parseVideoExportPayload(request: Request) {
  const body = await readRequestBody(request)
  if (!body.ok) return body
  if (!body.body.trim()) return { ok: false as const, status: 400, error: 'Request body is required' }

  let parsed: unknown
  try {
    parsed = JSON.parse(body.body)
  } catch {
    return { ok: false as const, status: 400, error: 'Malformed JSON payload' }
  }

  if (!isRecord(parsed)) return { ok: false as const, status: 400, error: 'Payload must be a JSON object' }

  const unknownKeys = Object.keys(parsed).filter((key) => !allowedPayloadKeys.has(key))
  if (unknownKeys.length) return { ok: false as const, status: 400, error: 'Payload contains unsupported fields' }

  const limitError = validateJsonLimits(parsed)
  if (limitError) return { ok: false as const, status: 400, error: limitError }

  if (typeof parsed.sourceUrl !== 'string' || parsed.sourceUrl.length === 0 || parsed.sourceUrl.length > 8192) {
    return { ok: false as const, status: 400, error: 'sourceUrl must be a non-empty string' }
  }
  if (typeof parsed.filename !== 'string' || parsed.filename.length === 0 || parsed.filename.length > 255) {
    return { ok: false as const, status: 400, error: 'filename must be a non-empty string' }
  }
  if (parsed.locale !== undefined && (typeof parsed.locale !== 'string' || parsed.locale.length > 16)) {
    return { ok: false as const, status: 400, error: 'locale must be a string' }
  }
  if (typeof parsed.tier !== 'string' || parsed.tier.length === 0 || parsed.tier.length > 64) {
    return { ok: false as const, status: 400, error: 'tier must be a non-empty string' }
  }
  if (parsed.billingProvider !== undefined && (typeof parsed.billingProvider !== 'string' || parsed.billingProvider.length === 0 || parsed.billingProvider.length > 64)) {
    return { ok: false as const, status: 400, error: 'billingProvider must be a non-empty string' }
  }
  if (typeof parsed.durationSec !== 'number' || !Number.isFinite(parsed.durationSec) || parsed.durationSec <= 0 || parsed.durationSec > maxDurationSeconds) {
    return { ok: false as const, status: 400, error: 'durationSec must be a positive bounded number' }
  }
  if (typeof parsed.usedMinutes !== 'number' || !Number.isFinite(parsed.usedMinutes) || parsed.usedMinutes < 0 || parsed.usedMinutes > maxUsedMinutes) {
    return { ok: false as const, status: 400, error: 'usedMinutes must be a non-negative bounded number' }
  }

  return { ok: true as const, payload: parsed as VideoExportPayload }
}

async function removeQueuedPayload(payloadPath: string) {
  try {
    await unlink(payloadPath)
  } catch {
    // Best-effort cleanup only.
  }
}

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>, userId: string) {
  if (!uuidPattern.test(userId)) return null

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
  const generatedAt = new Date().toISOString()
  let supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>

  try {
    supabase = await createMarketingServerSupabase()
  } catch {
    return json({ ok: false, data: null, error: 'Authentication required', meta: { locale: 'en', generatedAt } }, 401)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return json({ ok: false, data: null, error: 'Authentication required', meta: { locale: 'en', generatedAt } }, 401)
  }

  const parsed = await parseVideoExportPayload(request)
  if (!parsed.ok) {
    return json({ ok: false, data: null, error: parsed.error, meta: { locale: 'en', generatedAt: new Date().toISOString() } }, parsed.status)
  }

  const payload = parsed.payload
  const lang = locale(payload.locale)
  const quota = calculateVideoQuota(payload.tier, payload.usedMinutes + Math.ceil(payload.durationSec / 60), payload.billingProvider || 'stripe')
  const permission = assertCanExport(quota)
  if (!permission.allowed) {
    return json({ ok: false, data: null, error: permission.reason, meta: { locale: lang, generatedAt: new Date().toISOString() } }, 402)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  const jobId = randomUUID()
  await mkdir(queueDir, { recursive: true })
  const payloadPath = join(queueDir, `${jobId}.json`)
  await writeFile(payloadPath, JSON.stringify(payload, null, 2), 'utf8')

  let billingSession: Awaited<ReturnType<typeof createOverageBillingSession>>
  try {
    billingSession = await createOverageBillingSession({ jobId, quota, returnUrl: new URL('/dashboard/video', request.url).toString() })
  } catch {
    await removeQueuedPayload(payloadPath)
    return json({ ok: false, data: null, error: 'Unable to create billing session', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 502)
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
    return json({ ok: false, data: null, error: 'Unable to queue export job', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
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
      await supabase.from('video_jobs').delete().eq('id', jobId)
      return json({ ok: false, data: null, error: 'Unable to record overage billing event', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
    }
  }

  return json({
    ok: true,
    data: { jobId, status: 'queued' as const, quota, billing: billingSession },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  }, 202)
}
