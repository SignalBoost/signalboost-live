import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { persistVideoUpload } from '@/lib/video/storage'
import { calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024
const MAX_MULTIPART_BODY_BYTES = MAX_VIDEO_UPLOAD_BYTES + 1024 * 1024
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogg', 'ogv', 'mkv', 'avi'])
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/x-m4v',
  'video/quicktime',
  'video/webm',
  'video/ogg',
  'video/x-msvideo',
  'video/avi',
  'video/x-matroska',
  'video/matroska',
])

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale { return ['en','es','pt','pl','ru'].includes(String(value)) ? String(value) as SupportedVideoLocale : 'en' }

function parseContentLength(value: string | null) {
  if (!value) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : NaN
}

function parseNonNegativeNumber(value: FormDataEntryValue | null) {
  if (value === null || value === '') return 0
  if (typeof value !== 'string') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function hasAllowedVideoExtension(filename: string) {
  const extension = filename.split('.').pop()?.toLowerCase()
  return Boolean(extension && ALLOWED_VIDEO_EXTENSIONS.has(extension))
}

async function hasAllowedVideoSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (bytes.length < 4) return false

  const startsWith = (signature: string, offset = 0) => {
    if (bytes.length < offset + signature.length) return false
    for (let index = 0; index < signature.length; index += 1) {
      if (bytes[offset + index] !== signature.charCodeAt(index)) return false
    }
    return true
  }

  return (
    startsWith('ftyp', 4) ||
    startsWith('OggS') ||
    startsWith('RIFF') && startsWith('AVI ', 8) ||
    bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
  )
}

async function validateVideoFile(file: File) {
  if (file.size <= 0) return 'The uploaded video is empty.'
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) return 'The uploaded video is too large.'
  if (!ALLOWED_VIDEO_MIME_TYPES.has(file.type.toLowerCase())) return 'Unsupported video type.'
  if (!hasAllowedVideoExtension(file.name)) return 'Unsupported video filename.'
  if (!(await hasAllowedVideoSignature(file))) return 'Unsupported or invalid video file.'
  return null
}

async function resolveAccountId(supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>, userId: string) {
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
    return json({ ok: false, data: null, error: 'Authentication service is unavailable.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 503)
  }

  let supabase: Awaited<ReturnType<typeof createMarketingServerSupabase>>
  try {
    supabase = await createMarketingServerSupabase()
  } catch {
    return json({ ok: false, data: null, error: 'Authentication service is unavailable.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 503)
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return json({ ok: false, data: null, error: 'Authentication is required.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const contentLength = parseContentLength(request.headers.get('content-length'))
  if (contentLength === null) {
    return json({ ok: false, data: null, error: 'Content-Length header is required.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 411)
  }
  if (!Number.isFinite(contentLength) || contentLength > MAX_MULTIPART_BODY_BYTES) {
    return json({ ok: false, data: null, error: 'Request body is too large.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 413)
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

  const durationSec = parseNonNegativeNumber(form.get('durationSec'))
  const previouslyUsedMinutes = parseNonNegativeNumber(form.get('usedMinutes'))
  if (durationSec === null || previouslyUsedMinutes === null) {
    return json({ ok: false, data: null, error: 'Video duration and used minutes must be finite non-negative numbers.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const persisted = await persistVideoUpload(video)
  const tier = String(form.get('tier') || 'free')
  const usedMinutes = previouslyUsedMinutes + Math.ceil(durationSec / 60)
  const quota = calculateVideoQuota(tier, usedMinutes, String(form.get('billingProvider') || 'stripe') === 'paypal' ? 'paypal' : 'stripe')

  const accountId = await resolveAccountId(supabase, user.id)
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
    return json({ ok: false, data: null, error: 'Video metadata could not be saved.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 500)
  }

  return json({
    ok: true,
    data: { ...persisted, quota },
    error: null,
    meta: { locale: lang, generatedAt: new Date().toISOString() },
  })
}
