import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { createOverageBillingSession } from '@/lib/video/billing'
import { assertCanExport, calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale, VideoExportPayload } from '@/lib/video/types'

const queueDir = join(process.cwd(), '.video-queue')
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_STRING_LENGTH = 16 * 1024
const MAX_ARRAY_LENGTH = 500
const MAX_OBJECT_KEYS = 100
const MAX_JSON_DEPTH = 10
const MAX_DURATION_SECONDS = 24 * 60 * 60
const MAX_USED_MINUTES = 10_000_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function locale(value: string | undefined): SupportedVideoLocale { return value && ['en','es','pt','pl','ru'].includes(value) ? value as SupportedVideoLocale : 'en' }
function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }

async function readRequestBody(request: Request): Promise<{ text: string } | { error: string, status: number }> {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const size = Number(contentLength)
    if (!Number.isFinite(size) || size < 0) return { error: 'Invalid content length', status: 400 }
    if (size > MAX_BODY_BYTES) return { error: 'Request body too large', status: 413 }
  }

  if (!request.body) return { text: '' }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      if (received > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        return { error: 'Request body too large', status: 413 }
      }
      chunks.push(value)
    }
  } catch {
    return { error: 'Invalid request body', status: 400 }
  }

  const body = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { text: new TextDecoder().decode(body) }
}

function validateJsonLimits(value: unknown, depth = 0): string | null {
  if (depth > MAX_JSON_DEPTH) return 'Payload is too deeply nested'
  if (value === null) return null

  if (typeof value === 'string') return value.length <= MAX_STRING_LENGTH ? null : 'Payload string is too large'
  if (typeof value === 'number') return Number.isFinite(value) ? null : 'Payload contains an invalid number'
  if (typeof value === 'boolean') return null
  if (typeof value !== 'object') return 'Payload contains an unsupported value'

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) return 'Payload array is too large'
    for (const item of value) {
      const error = validateJsonLimits(item, depth + 1)
      if (error) return error
    }
    return null
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length > MAX_OBJECT_KEYS) return 'Payload object has too many fields'
  for (const [key, item] of entries) {
    if (key.length > 128) return 'Payload field name is too large'
    const error = validateJsonLimits(item, depth + 1)
    if (error) return error
  }
  return null
}

function validatePayload(value: unknown): { payload: VideoExportPayload } | { error: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Payload must be a JSON object' }

  const limitError = validateJsonLimits(value)
  if (limitError) return { error: limitError }

  const payload = value as Record<string, unknown>

  if (typeof payload.sourceUrl !== 'string' || payload.sourceUrl.trim().length === 0 || payload.sourceUrl.length > 4096) {
    return { error: 'Invalid sourceUrl' }
  }
  if (payload.filename !== undefined && (typeof payload.filename !== 'string' || payload.filename.length > 255)) {
    return { error: 'Invalid filename' }
  }
  if (payload.locale !== undefined && (typeof payload.locale !== 'string' || payload.locale.length > 16)) {
    return { error: 'Invalid locale' }
  }
  if (typeof payload.tier !== 'string' || payload.tier.trim().length === 0 || payload.tier.length > 64) {
    return { error: 'Invalid tier' }
  }
  if (payload.billingProvider !== undefined && (typeof payload.billingProvider !== 'string' || payload.billingProvider.length > 64)) {
    return { error: 'Invalid billingProvider' }
  }
  if (typeof payload.usedMinutes !== 'number' || !Number.isFinite(payload.usedMinutes) || payload.usedMinutes < 0 || payload.usedMinutes > MAX_USED_MINUTES) {
    return { error: 'Invalid usedMinutes' }
  }
  if (typeof payload.durationSec !== 'number' || !Number.isFinite(payload.durationSec) || payload.durationSec <= 0 || payload.durationSec > MAX_DURATION_SECONDS) {
    return { error: 'Invalid durationSec' }
  }

  return { payload: payload as VideoExportPayload }
}

async function parseExportPayload(request: Request): Promise<{ payload: VideoExportPayload } | { error: string, status: number }> {
  const body = await readRequestBody(request)
  if ('error' in body) return body
  if (!body.text.trim()) return { error: 'Request body is required', status: 400 }

  let parsed: unknown
  try {
    parsed = JSON.parse(body.text)
  } catch {
    return { error: 'Malformed JSON', status: 400 }
  }

  const validated = validatePayload(parsed)
  if ('error' in validated) return { error: validated.error, status: 400 }
  return validated
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
    return json({ ok: false, data: null, error: 'Authentication required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  let supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>
  try {
    supabase = await createMarketingServerSupabase()
  } catch {
    return json({ ok: false, data: null, error: 'Authentication required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json({ ok: false, data: null, error: 'Authentication required', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const parsed = await parseExportPayload(request)
  if ('error' in parsed) {
    return json({ ok: false, data: null, error: parsed.error, meta: { locale: 'en', generatedAt: new Date().toISOString() } }, parsed.status)
  }

  const payload = parsed.payload
  const lang = locale(payload.locale)
  const quota = calculateVideoQuota(payload.tier, payload.usedMinutes + Math.ceil(payload.durationSec / 60), payload.billingProvider || 'stripe')
  const permission = assertCanExport(quota)
  if (!permission.allowed) {
    return json({ ok: false, data: null, error: permission.reason, meta: { locale: lang, generatedAt: new Date().toISOString() } }, 402)
  }

  const jobId = randomUUID()
  const accountId = await resolveAccountId(supabase, user.id)
  const billingSession = await createOverageBillingSession({ jobId, quota, returnUrl: new URL('/dashboard/video', request.url).toString() })

  await mkdir(queueDir, { recursive: true })
  const payloadPath = join(queueDir, `${jobId}.json`)
  await writeFile(payloadPath, JSON.stringify(payload, null, 2), 'utf8')

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
    await unlink(payloadPath).catch(() => undefined)
    return json({ ok: false, data: null, error: 'Failed to queue export job', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
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
      await unlink(payloadPath).catch(() => undefined)
      await supabase.from('video_jobs').delete().eq('id', jobId)
      return json({ ok: false, data: null, error: 'Failed to queue export job', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
    }
  }

  return json({
    ok: true,
    data: { jobId, status: 'queued' as const, quota, billing: billingSession },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  }, 202)
}
