import { NextResponse } from 'next/server'

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

const supportedLocales: SupportedVideoLocale[] = ['en', 'es', 'pt', 'pl', 'ru']
const maxDirectUploadMb = 25
const freeDemoMaxSeconds = 30

function json<T>(body: JsonSafeVideoResponse<T>, status = 200) {
  return NextResponse.json(body, { status })
}

function locale(value: FormDataEntryValue | null): SupportedVideoLocale {
  const requested = String(value || 'en')

  return supportedLocales.includes(requested as SupportedVideoLocale)
    ? requested as SupportedVideoLocale
    : 'en'
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

export async function POST(request: Request) {
  const form = await request.formData()
  const lang = locale(form.get('locale'))
  const video = form.get('video')
  const tier = String(form.get('tier') || 'free').toLowerCase()
  const durationSec = Number(form.get('durationSec') || 0)

  if (!(video instanceof File)) {
    return json(
      {
        ok: false,
        data: null,
        error: 'A video file is required for AI caption generation.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      400,
    )
  }

  if ((tier === 'free' || tier === 'demo') && durationSec > freeDemoMaxSeconds) {
    return json(
      {
        ok: false,
        data: null,
        error: `Free/demo caption generation is limited to ${freeDemoMaxSeconds} seconds. Upgrade to caption the full video.`,
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      402,
    )
  }

  if (video.size > maxDirectUploadMb * 1024 * 1024) {
    return json(
      {
        ok: false,
        data: null,
        error: `This direct captioning flow supports files up to ${maxDirectUploadMb} MB. Compress the video or use the render worker audio-extraction flow for longer videos.`,
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      413,
    )
  }

  if (!process.env.OPENAI_API_KEY) {
    return json(
      {
        ok: false,
        data: null,
        error: 'OPENAI_API_KEY is not configured.',
        meta: { locale: lang, generatedAt: new Date().toISOString() },
      },
      500,
    )
  }

  const upstreamForm = new FormData()
  upstreamForm.set('file', video)
  upstreamForm.set('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'whisper-1')
  upstreamForm.set('language', lang)
  upstreamForm.set('response_format', 'verbose_json')
  upstreamForm.append('timestamp_granularities[]', 'segment')

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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

    return json({
      ok: true,
      data: {
        cues,
        cueCount: cues.length,
        text: payload.text || '',
      },
      error: null,
      meta: { locale: lang, generatedAt: new Date().toISOString() },
    })
  } catch (error) {
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
