import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { refundVideoCredit, spendVideoCredit } from '@/lib/credits'

export const runtime = 'nodejs'
export const maxDuration = 300

type SupportedVideoLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type CaptionCue = {
  id: string
  start: number
  end: number
  text: string
}

type JsonSafeVideoResponse<T> = {
  ok: boolean
  data: T | null
  error: string | null
  meta: {
    locale: SupportedVideoLocale
    generatedAt: string
  }
}

type StoredVideoPayload = {
  bucket?: string
  path?: string
  locale?: SupportedVideoLocale
  durationSec?: number
}

type CompletedTranscript = {
  status: 'completed'
  cues: CaptionCue[]
  cueCount: number
  text: string
}

const ENV_PUBLIC_SUPABASE_URL = ['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')
const ENV_PUBLIC_SUPABASE_ANON = ['NEXT', 'PUBLIC', 'SUPABASE', 'ANON', 'KEY'].join('_')
const ENV_SUPABASE_SERVICE = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')
const ENV_OPENAI = ['OPENAI', 'API', 'KEY'].join('_')
const ENV_TRANSCRIPTION_MODEL = ['OPENAI', 'TRANSCRIPTION', 'MODEL'].join('_')

const defaultStorageBucket = 'video-uploads'
const supportedLocales: SupportedVideoLocale[] = ['en', 'es', 'pt', 'pl', 'ru']
const storageCaptionMaxMb = 24
const directCaptionMaxMb = 4

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) {
  return NextResponse.json(body, { status })
}

function locale(value: unknown): SupportedVideoLocale {
  const requested = String(value || 'en')

  return supportedLocales.includes(requested as SupportedVideoLocale)
    ? requested as SupportedVideoLocale
    : 'en'
}

function adminClient() {
  const url = process.env[ENV_PUBLIC_SUPABASE_URL]
  const key = process.env[ENV_SUPABASE_SERVICE]

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false },
  })
}

async function getUser() {
  const cookieStore = await cookies()
  const url = process.env[ENV_PUBLIC_SUPABASE_URL]
  const anon = process.env[ENV_PUBLIC_SUPABASE_ANON]

  if (!url || !anon) return null

  const supabase = createServerClient(
    url,
    anon,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Safe to ignore in server contexts where cookies cannot be set.
          }
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

function cueFromSegment(segment: unknown, index: number): CaptionCue | null {
  if (!segment || typeof segment !== 'object') return null

  const record = segment as {
    start?: unknown
    end?: unknown
    text?: unknown
  }

  const start = Number(record.start)
  const end = Number(record.end)
  const text = String(record.text || '').replace(/\s+/g, ' ').trim()

  if (!Number.isFinite(start) || !Number.isFinite(end) || !text) return null

  return {
    id: `cue-${index + 1}`,
    start,
    end: Math.max(end, start + 0.5),
    text,
  }
}

function fallbackCues(text: string, durationSec: number): CaptionCue[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)

  if (!words.length) return []

  const chunkSize = 9
  const chunks: string[] = []

  for (let index = 0; index < words.length; index += chunkSize) {
    chunks.push(words.slice(index, index + chunkSize).join(' '))
  }

  const duration = Math.max(durationSec || chunks.length * 3, chunks.length * 1.5)
  const step = duration / chunks.length

  return chunks.map((chunk, index) => ({
    id: `cue-${index + 1}`,
    start: Number((index * step).toFixed(2)),
    end: Number(Math.min(duration, (index + 1) * step).toFixed(2)),
    text: chunk,
  }))
}

function filenameFromPath(path: string) {
  return path.split('/').pop() || 'video.mp4'
}

function encodeTranscript(payload: CompletedTranscript): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeTranscript(id: string): CompletedTranscript | null {
  try {
    const parsed = JSON.parse(Buffer.from(id, 'base64url').toString('utf8')) as CompletedTranscript
    if (parsed?.status === 'completed' && Array.isArray(parsed.cues)) return parsed
  } catch {}
  return null
}

async function getVideoFromRequest(request: Request): Promise<{
  file: File
  lang: SupportedVideoLocale
  durationSec: number
}> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const body = await request.json() as StoredVideoPayload
    const lang = locale(body.locale)
    const bucket = String(body.bucket || defaultStorageBucket)
    const path = String(body.path || '')
    const durationSec = Number(body.durationSec || 0)

    if (!path) {
      throw new Error('Stored video path is required.')
    }

    const supabase = adminClient()

    if (!supabase) {
      throw new Error('Storage is not configured for video captions.')
    }

    const { data, error } = await supabase.storage.from(bucket).download(path)

    if (error || !data) {
      throw new Error(error?.message || 'Could not download uploaded video from storage.')
    }

    if (data.size > storageCaptionMaxMb * 1024 * 1024) {
      throw new Error(
        `This video is too large for immediate captions (${storageCaptionMaxMb} MB max). Background caption processing is required for larger videos.`,
      )
    }

    const file = new File(
      [data],
      filenameFromPath(path),
      { type: data.type || 'video/mp4' },
    )

    return { file, lang, durationSec }
  }

  const form = await request.formData()
  const lang = locale(form.get('locale'))
  const video = form.get('video')
  const durationSec = Number(form.get('durationSec') || 0)

  if (!(video instanceof File)) {
    throw new Error('A video file is required for AI caption generation.')
  }

  if (video.size > directCaptionMaxMb * 1024 * 1024) {
    throw new Error(
      `Direct browser captioning supports files up to ${directCaptionMaxMb} MB. Upload the video to storage first, then generate captions.`,
    )
  }

  return { file: video, lang, durationSec }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id') || ''
  const transcript = decodeTranscript(id)

  if (!transcript) {
    return json<CompletedTranscript>(
      {
        ok: false,
        data: null,
        error: 'Transcript is unavailable or expired. Please generate captions again.',
        meta: { locale: 'en', generatedAt: new Date().toISOString() },
      },
      404,
    )
  }

  return json<CompletedTranscript>({
    ok: true,
    data: transcript,
    error: null,
    meta: { locale: 'en', generatedAt: new Date().toISOString() },
  })
}

export async function POST(request: Request) {
  let videoFile: File
  let lang: SupportedVideoLocale
  let durationSec = 0

  try {
    const video = await getVideoFromRequest(request)
    videoFile = video.file
    lang = video.lang
    durationSec = video.durationSec
  } catch (error) {
    return json(
      {
        ok: false,
        data: null,
        error: error instanceof Error ? error.message : 'Invalid caption request.',
        meta: { locale: 'en', generatedAt: new Date().toISOString() },
      },
      400,
    )
  }

  const providerKey = process.env[ENV_OPENAI]
  if (!providerKey) {
    return json(
      {
        ok: false,
        data: null,
        error: 'Caption transcription provider is not configured.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      500,
    )
  }

  const user = await getUser()

  if (!user?.id) {
    return json(
      {
        ok: false,
        data: null,
        error: 'You must be signed in to generate AI captions.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      401,
    )
  }

  const credit = await spendVideoCredit(user.id)

  if (!credit.ok) {
    return json(
      {
        ok: false,
        data: null,
        error: 'You do not have enough video credits to generate captions. Upgrade or wait for your monthly reset.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      402,
    )
  }

  const upstreamForm = new FormData()
  upstreamForm.set('file', videoFile)
  upstreamForm.set('model', process.env[ENV_TRANSCRIPTION_MODEL] || 'whisper-1')
  upstreamForm.set('language', lang)
  upstreamForm.set('response_format', 'verbose_json')
  upstreamForm.append('timestamp_granularities[]', 'segment')

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${providerKey}`,
      },
      body: upstreamForm,
    })

    const payload = await response.json() as {
      text?: string
      segments?: unknown[]
      error?: { message?: string }
    }

    if (!response.ok) {
      throw new Error(payload.error?.message || 'OpenAI transcription failed.')
    }

    const segmentCues = Array.isArray(payload.segments)
      ? payload.segments.map(cueFromSegment).filter(Boolean) as CaptionCue[]
      : []

    const cues = segmentCues.length
      ? segmentCues
      : fallbackCues(String(payload.text || ''), durationSec)

    const completed: CompletedTranscript = {
      status: 'completed',
      cues,
      cueCount: cues.length,
      text: payload.text || '',
    }

    return json({
      ok: true,
      data: {
        ...completed,
        transcriptId: encodeTranscript(completed),
        creditsRemaining: credit.remaining,
        plan: credit.plan,
      },
      error: null,
      meta: { locale: lang, generatedAt: new Date().toISOString() },
    })
  } catch (error) {
    await refundVideoCredit(user.id)

    return json(
      {
        ok: false,
        data: null,
        error: error instanceof Error ? error.message : 'Caption generation failed.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      500,
    )
  }
}
