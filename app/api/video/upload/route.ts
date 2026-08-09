import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { persistVideoUpload } from '@/lib/video/storage'
import { calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024
const MAX_MULTIPART_BODY_BYTES = MAX_VIDEO_UPLOAD_BYTES + 10 * 1024 * 1024
const MAX_DATABASE_INTEGER = 2147483647
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/x-msvideo',
  'video/mpeg',
  'video/ogg',
  'video/x-matroska',
])
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'avi', 'mpeg', 'mpg', 'ogv', 'mkv'])

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale { return ['en','es','pt','pl','ru'].includes(String(value)) ? String(value) as SupportedVideoLocale : 'en' }

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>, userId: string) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id')
    .or(`user_id.eq.${userId},owner_id.eq.${userId}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

function matchesAscii(header: Uint8Array, offset: number, value: string) {
  if (header.length < offset + value.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (header[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

async function hasAllowedVideoSignature(file: File) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const isIsoBaseMedia = matchesAscii(header, 4, 'ftyp')
  const isWebmOrMatroska = header.length >= 4 && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3
  const isAvi = matchesAscii(header, 0, 'RIFF') && matchesAscii(header, 8, 'AVI')
  const isMpeg = header.length >= 4 && header[0] === 0x00 && header[1] === 0x00 && header[2] === 0x01 && (header[3] === 0xba || header[3] === 0xb3)
  const isOgg = matchesAscii(header, 0, 'OggS')
  return isIsoBaseMedia || isWebmOrMatroska || isAvi || isMpeg || isOgg
}

function extension(filename: string) {
  const normalized = filename.toLowerCase()
  const dot = normalized.lastIndexOf('.')
  return dot >= 0 ? normalized.slice(dot + 1) : ''
}

async function validateVideoFile(file: File) {
  if (file.size <= 0) return 'The video file is empty.'
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) return 'The video file is too large.'

  const mimeType = file.type.split(';')[0].trim().toLowerCase()
  if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) return 'Unsupported video file type.'
  if (!ALLOWED_VIDEO_EXTENSIONS.has(extension(file.name))) return 'Unsupported video file extension.'
  if (!(await hasAllowedVideoSignature(file))) return 'Unsupported or invalid video file.'

  return null
}

function parseNonNegativeFiniteNumber(value: FormDataEntryValue | null) {
  if (value === null || value === '') return 0
  if (value instanceof File) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, data: null, error: 'Video upload authentication is unavailable.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 503)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json({ ok: false, data: null, error: 'Authentication is required to upload videos.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  let accountId: string | null
  try {
    accountId = await resolveAccountId(supabase, user.id)
  } catch {
    return json({ ok: false, data: null, error: 'Unable to verify upload authorization.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 500)
  }
  if (!accountId) {
    return json({ ok: false, data: null, error: 'No authorized account is available for video uploads.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 403)
  }

  const contentLengthHeader = request.headers.get('content-length')
  if (!contentLengthHeader) {
    return json({ ok: false, data: null, error: 'Content-Length is required for video uploads.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 411)
  }
  const contentLength = Number(contentLengthHeader)
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return json({ ok: false, data: null, error: 'Invalid Content-Length header.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 400)
  }
  if (contentLength > MAX_MULTIPART_BODY_BYTES) {
    return json({ ok: false, data: null, error: 'The upload request is too large.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 413)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return json({ ok: false, data: null, error: 'Invalid upload form data.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 400)
  }

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
  if (durationSec === null || durationSec > MAX_DATABASE_INTEGER) {
    return json({ ok: false, data: null, error: 'Invalid video duration.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const usedMinutesInput = parseNonNegativeFiniteNumber(form.get('usedMinutes'))
  const uploadedMinutes = Math.ceil(durationSec / 60)
  if (usedMinutesInput === null || usedMinutesInput > Number.MAX_SAFE_INTEGER - uploadedMinutes) {
    return json({ ok: false, data: null, error: 'Invalid usage metadata.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const persisted = await persistVideoUpload(video)
  const tier = String(form.get('tier') || 'free')
  const usedMinutes = usedMinutesInput + uploadedMinutes
  const quota = calculateVideoQuota(tier, usedMinutes, String(form.get('billingProvider') || 'stripe') === 'paypal' ? 'paypal' : 'stripe')

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
