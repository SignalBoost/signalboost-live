import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { persistVideoUpload } from '@/lib/video/storage'
import { calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024
const ALLOWED_VIDEO_TYPES: Record<string, readonly string[]> = {
  'video/mp4': ['mp4', 'm4v'],
  'video/quicktime': ['mov', 'qt'],
  'video/webm': ['webm'],
  'video/ogg': ['ogv', 'ogg'],
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale { return ['en','es','pt','pl','ru'].includes(String(value)) ? String(value) as SupportedVideoLocale : 'en' }

function sameOrigin(request: Request) {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  if (origin) {
    try { return new URL(origin).origin === expectedOrigin } catch { return false }
  }

  const referer = request.headers.get('referer')
  if (referer) {
    try { return new URL(referer).origin === expectedOrigin } catch { return false }
  }

  return false
}

function fileExtension(filename: string) {
  const index = filename.lastIndexOf('.')
  return index >= 0 ? filename.slice(index + 1).toLowerCase() : ''
}

function bytesEqualAscii(bytes: Uint8Array, offset: number, value: string) {
  if (bytes.length < offset + value.length) return false
  for (let i = 0; i < value.length; i += 1) {
    if (bytes[offset + i] !== value.charCodeAt(i)) return false
  }
  return true
}

async function hasAllowedVideoSignature(video: File, mimeType: string) {
  const header = new Uint8Array(await video.slice(0, 16).arrayBuffer())

  if (mimeType === 'video/webm') {
    return header.length >= 4 && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3
  }

  if (mimeType === 'video/ogg') {
    return bytesEqualAscii(header, 0, 'OggS')
  }

  if (mimeType === 'video/mp4' || mimeType === 'video/quicktime') {
    return bytesEqualAscii(header, 4, 'ftyp')
  }

  return false
}

async function validateVideoFile(video: File) {
  if (video.size <= 0) return 'The video file is empty.'
  if (video.size > MAX_VIDEO_UPLOAD_BYTES) return 'The video file is too large.'

  const mimeType = video.type.toLowerCase()
  const allowedExtensions = ALLOWED_VIDEO_TYPES[mimeType]
  if (!allowedExtensions) return 'Unsupported video type.'

  const extension = fileExtension(video.name)
  if (!allowedExtensions.includes(extension)) return 'Unsupported video filename extension.'

  if (!(await hasAllowedVideoSignature(video, mimeType))) return 'Invalid video file signature.'

  return null
}

function parseNonNegativeFiniteNumber(value: FormDataEntryValue | null) {
  if (value === null || value === '') return 0
  if (value instanceof File) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null
}

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>, userId: string) {
  if (!UUID_RE.test(userId)) return null

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
  if (!sameOrigin(request)) {
    return json({ ok: false, data: null, error: 'Invalid request origin.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 403)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, data: null, error: 'Authentication is unavailable.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 503)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json({ ok: false, data: null, error: 'Authentication is required.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  if (!accountId) {
    return json({ ok: false, data: null, error: 'An authorized account is required.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 403)
  }

  const form = await request.formData()
  const lang = locale(form.get('locale'))
  const video = form.get('video')
  if (!(video instanceof File)) {
    return json({ ok: false, data: null, error: 'A video file is required.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const videoValidationError = await validateVideoFile(video)
  if (videoValidationError) {
    return json({ ok: false, data: null, error: videoValidationError, meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const durationSec = parseNonNegativeFiniteNumber(form.get('durationSec'))
  const usedMinutesInput = parseNonNegativeFiniteNumber(form.get('usedMinutes'))
  if (durationSec === null || usedMinutesInput === null) {
    return json({ ok: false, data: null, error: 'Duration and usage values must be finite non-negative numbers.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const uploadMinutes = Math.ceil(durationSec / 60)
  if (usedMinutesInput > Number.MAX_SAFE_INTEGER - uploadMinutes) {
    return json({ ok: false, data: null, error: 'Usage value is too large.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const tier = String(form.get('tier') || 'free')
  const usedMinutes = usedMinutesInput + uploadMinutes
  const quota = calculateVideoQuota(tier, usedMinutes, String(form.get('billingProvider') || 'stripe') === 'paypal' ? 'paypal' : 'stripe')
  const persisted = await persistVideoUpload(video)

  const { error: insertError } = await supabase.from('video_storage').insert({
    user_id: user.id,
    account_id: accountId,
    filename: persisted.filename,
    source_path: persisted.publicUrl,
    size_mb: persisted.sizeMb,
    duration_sec: Math.round(durationSec),
    captions: [],
    transcoded: false,
  })

  if (insertError) {
    return json({ ok: false, data: null, error: 'Unable to save video metadata.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

  return json({
    ok: true,
    data: { ...persisted, quota },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  })
}
