import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { persistVideoUpload } from '@/lib/video/storage'
import { calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/ogg',
  'video/x-msvideo',
  'video/x-matroska',
])
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.webm', '.ogv', '.ogg', '.avi', '.mkv']

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale { return ['en','es','pt','pl','ru'].includes(String(value)) ? String(value) as SupportedVideoLocale : 'en' }
function errorResponse(message: string, status: number, lang: SupportedVideoLocale = 'en') {
  return json({ ok: false, data: null, error: message, meta: { locale: lang, generatedAt: new Date().toISOString() } }, status)
}
function parseNonNegativeFiniteNumber(value: FormDataEntryValue | null, fallback = 0) {
  if (value === null || value === '') return fallback
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= Number.MAX_SAFE_INTEGER ? numeric : null
}
function hasAllowedVideoExtension(file: File) {
  const name = (file.name || '').toLowerCase()
  return ALLOWED_VIDEO_EXTENSIONS.some((extension) => name.endsWith(extension))
}
async function hasAllowedVideoSignature(file: File) {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const ascii = String.fromCharCode(...header)

  return (
    (header.length >= 12 && ascii.slice(4, 8) === 'ftyp') ||
    (header.length >= 4 && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) ||
    (header.length >= 4 && ascii.slice(0, 4) === 'OggS') ||
    (header.length >= 12 && ascii.slice(0, 4) === 'RIFF' && ascii.slice(8, 11) === 'AVI')
  )
}

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

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return errorResponse('Authentication service is unavailable.', 503)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return errorResponse('Authentication is required.', 401)
  }

  let accountId: string | null
  try {
    accountId = await resolveAccountId(supabase, user.id)
  } catch {
    return errorResponse('Unable to verify upload permissions.', 500)
  }
  if (!accountId) {
    return errorResponse('Upload permissions could not be verified.', 403)
  }

  const contentLengthHeader = request.headers.get('content-length')
  if (!contentLengthHeader) {
    return errorResponse('Content-Length is required.', 411)
  }
  const contentLength = Number(contentLengthHeader)
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return errorResponse('Invalid Content-Length.', 400)
  }
  if (contentLength > MAX_UPLOAD_BYTES) {
    return errorResponse('The uploaded video is too large.', 413)
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return errorResponse('Invalid upload form data.', 400)
  }

  const lang = locale(form.get('locale'))
  const video = form.get('video')
  if (!(video instanceof File)) {
    return errorResponse('A video file is required.', 400, lang)
  }
  if (video.size <= 0) {
    return errorResponse('The uploaded video is empty.', 400, lang)
  }
  if (video.size > MAX_UPLOAD_BYTES) {
    return errorResponse('The uploaded video is too large.', 413, lang)
  }
  const videoMimeType = video.type.toLowerCase().split(';')[0].trim()
  if (!ALLOWED_VIDEO_MIME_TYPES.has(videoMimeType) || !hasAllowedVideoExtension(video)) {
    return errorResponse('Unsupported video file type.', 400, lang)
  }
  if (!(await hasAllowedVideoSignature(video))) {
    return errorResponse('Invalid video file content.', 400, lang)
  }

  const durationSec = parseNonNegativeFiniteNumber(form.get('durationSec'))
  const existingUsedMinutes = parseNonNegativeFiniteNumber(form.get('usedMinutes'))
  if (durationSec === null || existingUsedMinutes === null) {
    return errorResponse('Invalid upload metadata.', 400, lang)
  }
  const additionalMinutes = Math.ceil(durationSec / 60)
  if (existingUsedMinutes > Number.MAX_SAFE_INTEGER - additionalMinutes) {
    return errorResponse('Invalid upload metadata.', 400, lang)
  }

  const persisted = await persistVideoUpload(video)
  const tier = String(form.get('tier') || 'free')
  const usedMinutes = existingUsedMinutes + additionalMinutes
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
    return errorResponse('Unable to save uploaded video metadata.', 500, lang)
  }

  return json({
    ok: true,
    data: { ...persisted, quota },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  })
}
