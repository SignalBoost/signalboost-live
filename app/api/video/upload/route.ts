import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { persistVideoUpload } from '@/lib/video/storage'
import { calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024
const ALLOWED_VIDEO_TYPES: Record<string, string[]> = {
  'video/mp4': ['.mp4', '.m4v'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
  'video/ogg': ['.ogv'],
}
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale { return ['en','es','pt','pl','ru'].includes(String(value)) ? String(value) as SupportedVideoLocale : 'en' }
function isUuid(value: string) { return UUID_PATTERN.test(value) }

function sameOrigin(request: Request) {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  if (origin) return origin === expectedOrigin

  const referer = request.headers.get('referer')
  if (!referer) return false

  try {
    return new URL(referer).origin === expectedOrigin
  } catch {
    return false
  }
}

function readNonNegativeFiniteNumber(value: FormDataEntryValue | null) {
  if (value === null || value === '') return 0
  if (typeof value !== 'string') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  let value = ''
  for (let index = start; index < start + length && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index])
  }
  return value
}

function hasValidVideoMagic(contentType: string, bytes: Uint8Array) {
  if (contentType === 'video/mp4' || contentType === 'video/quicktime') {
    return bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp'
  }

  if (contentType === 'video/webm') {
    return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  }

  if (contentType === 'video/ogg') {
    return bytes.length >= 4 && ascii(bytes, 0, 4) === 'OggS'
  }

  return false
}

async function validateVideoFile(video: File) {
  if (video.size <= 0) return 'The uploaded video file is empty.'
  if (video.size > MAX_VIDEO_UPLOAD_BYTES) return 'The uploaded video file is too large.'

  const contentType = String(video.type || '').toLowerCase().split(';')[0].trim()
  const allowedExtensions = ALLOWED_VIDEO_TYPES[contentType]
  if (!allowedExtensions) return 'Unsupported video file type.'

  const filename = String(video.name || '').toLowerCase()
  if (!allowedExtensions.some((extension) => filename.endsWith(extension))) {
    return 'Unsupported video file extension.'
  }

  const header = new Uint8Array(await video.slice(0, 16).arrayBuffer())
  if (!hasValidVideoMagic(contentType, header)) return 'Invalid video file signature.'

  return null
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
  if (!sameOrigin(request)) {
    return json({ ok: false, data: null, error: 'Invalid request origin.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 403)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, data: null, error: 'Authentication is unavailable.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 503)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user || !isUuid(user.id)) {
    return json({ ok: false, data: null, error: 'Authentication is required.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  if (!accountId) {
    return json({ ok: false, data: null, error: 'No authorized account was found.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 403)
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

  const durationSec = readNonNegativeFiniteNumber(form.get('durationSec'))
  const priorUsedMinutes = readNonNegativeFiniteNumber(form.get('usedMinutes'))
  if (durationSec === null || priorUsedMinutes === null) {
    return json({ ok: false, data: null, error: 'Invalid video duration or usage value.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const tier = String(form.get('tier') || 'free')
  const usedMinutes = priorUsedMinutes + Math.ceil(durationSec / 60)
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
