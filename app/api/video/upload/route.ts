import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { persistVideoUpload } from '@/lib/video/storage'
import { calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024
const MAX_VIDEO_DURATION_SEC = 24 * 60 * 60
const ALLOWED_VIDEO_TYPES: Record<string, readonly string[]> = {
  'video/mp4': ['mp4', 'm4v'],
  'video/webm': ['webm'],
  'video/ogg': ['ogv', 'ogg'],
  'video/quicktime': ['mov'],
  'video/x-matroska': ['mkv'],
}

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale { return ['en','es','pt','pl','ru'].includes(String(value)) ? String(value) as SupportedVideoLocale : 'en' }
function meta(lang: SupportedVideoLocale = 'en') { return { locale: lang, generatedAt: new Date().toISOString() } }

function isSameOriginUrl(value: string, expectedOrigin: string) {
  try {
    return new URL(value).origin === expectedOrigin
  } catch {
    return false
  }
}

function passesCsrfCheck(request: Request) {
  const expectedOrigin = new URL(request.url).origin
  const origin = request.headers.get('origin')
  if (origin) return isSameOriginUrl(origin, expectedOrigin)

  const referer = request.headers.get('referer')
  return Boolean(referer && isSameOriginUrl(referer, expectedOrigin))
}

function parseNonNegativeFiniteNumber(value: FormDataEntryValue | null) {
  if (value === null || value === '') return 0
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function hasAscii(bytes: Uint8Array, offset: number, value: string) {
  if (bytes.length < offset + value.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

function hasValidVideoSignature(bytes: Uint8Array, extension: string) {
  if (['mp4', 'm4v', 'mov'].includes(extension)) return hasAscii(bytes, 4, 'ftyp')
  if (['webm', 'mkv'].includes(extension)) return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  if (['ogv', 'ogg'].includes(extension)) return hasAscii(bytes, 0, 'OggS')
  return false
}

async function validateVideoFile(video: File) {
  if (video.size <= 0) return 'The video file is empty.'
  if (video.size > MAX_VIDEO_UPLOAD_BYTES) return 'The video file is too large.'

  const allowedExtensions = ALLOWED_VIDEO_TYPES[video.type]
  if (!allowedExtensions) return 'Unsupported video type.'

  const extension = video.name.split('.').pop()?.toLowerCase() ?? ''
  if (!allowedExtensions.includes(extension)) return 'Unsupported video file extension.'

  const header = new Uint8Array(await video.slice(0, 64).arrayBuffer())
  if (!hasValidVideoSignature(header, extension)) return 'Invalid video file signature.'

  return null
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
  if (!passesCsrfCheck(request)) {
    return json({ ok: false, data: null, error: 'Invalid request origin.', meta: meta() }, 403)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, data: null, error: 'Authentication is not available.', meta: meta() }, 503)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json({ ok: false, data: null, error: 'Authentication is required.', meta: meta() }, 401)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  if (!accountId) {
    return json({ ok: false, data: null, error: 'No authorized account was found for this upload.', meta: meta() }, 403)
  }

  const form = await request.formData()
  const lang = locale(form.get('locale'))
  const video = form.get('video')
  if (!(video instanceof File)) {
    return json({ ok: false, data: null, error: 'A video file is required.', meta: meta(lang) }, 400)
  }

  const validationError = await validateVideoFile(video)
  if (validationError) {
    return json({ ok: false, data: null, error: validationError, meta: meta(lang) }, 400)
  }

  const durationSec = parseNonNegativeFiniteNumber(form.get('durationSec'))
  if (durationSec === null || durationSec > MAX_VIDEO_DURATION_SEC) {
    return json({ ok: false, data: null, error: 'Duration must be a finite non-negative value within the allowed range.', meta: meta(lang) }, 400)
  }

  const currentUsedMinutes = parseNonNegativeFiniteNumber(form.get('usedMinutes'))
  if (currentUsedMinutes === null || currentUsedMinutes > Number.MAX_SAFE_INTEGER) {
    return json({ ok: false, data: null, error: 'Used minutes must be a finite non-negative value.', meta: meta(lang) }, 400)
  }

  const uploadedMinutes = Math.ceil(durationSec / 60)
  if (currentUsedMinutes > Number.MAX_SAFE_INTEGER - uploadedMinutes) {
    return json({ ok: false, data: null, error: 'Used minutes are out of range.', meta: meta(lang) }, 400)
  }

  const tier = String(form.get('tier') || 'free')
  const usedMinutes = currentUsedMinutes + uploadedMinutes
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
    return json({ ok: false, data: null, error: 'Video metadata could not be saved.', meta: meta(lang) }, 500)
  }

  return json({
    ok: true,
    data: { ...persisted, quota },
    error: null,
    meta: meta(lang),
  })
}
