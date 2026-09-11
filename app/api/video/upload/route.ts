import { NextResponse } from 'next/server'
import { createMarketingServerSupabase } from '@/lib/auth/supabaseServer'
import { persistVideoUpload } from '@/lib/video/storage'
import { calculateVideoQuota } from '@/lib/video/subscription'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024
const MAX_MULTIPART_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_BYTES + 1024 * 1024
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/x-matroska',
  'video/x-msvideo',
  'video/avi',
  'video/msvideo',
])
const ALLOWED_VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi'])

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale { return ['en','es','pt','pl','ru'].includes(String(value)) ? String(value) as SupportedVideoLocale : 'en' }

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

function fileExtension(name: string) {
  const index = name.lastIndexOf('.')
  return index >= 0 ? name.slice(index + 1).toLowerCase() : ''
}

function mimeMatchesExtension(mime: string, extension: string) {
  if (mime === 'video/mp4') return extension === 'mp4' || extension === 'm4v'
  if (mime === 'video/quicktime') return extension === 'mov'
  if (mime === 'video/x-m4v') return extension === 'm4v'
  if (mime === 'video/webm') return extension === 'webm'
  if (mime === 'video/x-matroska') return extension === 'mkv'
  if (mime === 'video/x-msvideo' || mime === 'video/avi' || mime === 'video/msvideo') return extension === 'avi'
  return false
}

function hasAllowedVideoSignature(extension: string, header: Uint8Array) {
  const hasFtypSignature = header.length >= 12 && header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70
  const hasEbmlSignature = header.length >= 4 && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3
  const hasAviSignature = header.length >= 12 && header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 && header[8] === 0x41 && header[9] === 0x56 && header[10] === 0x49 && header[11] === 0x20

  if (extension === 'mp4' || extension === 'm4v' || extension === 'mov') return hasFtypSignature
  if (extension === 'webm' || extension === 'mkv') return hasEbmlSignature
  if (extension === 'avi') return hasAviSignature
  return false
}

async function validateVideoFile(video: File) {
  if (!Number.isFinite(video.size) || video.size <= 0) return 'The video file is empty or invalid.'
  if (video.size > MAX_VIDEO_UPLOAD_BYTES) return 'The video file is too large.'

  const mime = String(video.type || '').toLowerCase()
  if (!ALLOWED_VIDEO_MIME_TYPES.has(mime)) return 'Unsupported video type.'

  const extension = fileExtension(video.name || '')
  if (!ALLOWED_VIDEO_EXTENSIONS.has(extension) || !mimeMatchesExtension(mime, extension)) return 'Unsupported video filename.'

  const header = new Uint8Array(await video.slice(0, 16).arrayBuffer())
  if (!hasAllowedVideoSignature(extension, header)) return 'Invalid video file.'

  return null
}

function parseNonNegativeNumber(value: FormDataEntryValue | null, fallback: number) {
  if (value === null || String(value).trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return json({ ok: false, data: null, error: 'Authentication service is unavailable.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 503)
  }

  const contentLengthHeader = request.headers.get('content-length')
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader)
  if (contentLength === null || !Number.isFinite(contentLength) || contentLength < 0) {
    return json({ ok: false, data: null, error: 'Content-Length header is required.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 411)
  }
  if (contentLength > MAX_MULTIPART_UPLOAD_BYTES) {
    return json({ ok: false, data: null, error: 'Upload is too large.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 413)
  }

  const supabase = await createMarketingServerSupabase()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return json({ ok: false, data: null, error: 'Authentication required.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 401)
  }

  const accountId = await resolveAccountId(supabase, user.id)
  if (!accountId) {
    return json({ ok: false, data: null, error: 'No authorized account was found for this upload.', meta: { locale: 'en', generatedAt: new Date().toISOString() } }, 403)
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

  const durationSec = parseNonNegativeNumber(form.get('durationSec'), 0)
  const previouslyUsedMinutes = parseNonNegativeNumber(form.get('usedMinutes'), 0)
  if (durationSec === null || previouslyUsedMinutes === null) {
    return json({ ok: false, data: null, error: 'Invalid numeric upload metadata.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const usedMinutes = previouslyUsedMinutes + Math.ceil(durationSec / 60)
  if (!Number.isFinite(usedMinutes) || usedMinutes > Number.MAX_SAFE_INTEGER) {
    return json({ ok: false, data: null, error: 'Invalid numeric upload metadata.', meta: { locale: lang, generatedAt: new Date().toISOString() } }, 400)
  }

  const persisted = await persistVideoUpload(video)
  const tier = String(form.get('tier') || 'free')
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
