import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BYTES = 1024 * 1024
const MAX_CAPTION_TEXT_BYTES = 512 * 1024
const MAX_CUE_COUNT = 10_000

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

function errorResponse(locale: SupportedVideoLocale, message: string, status: number) {
  const body: JsonSafeVideoResponse<null> = {
    ok: false,
    data: null,
    error: message,
    meta: { locale, generatedAt: new Date().toISOString() },
  }
  return NextResponse.json(body, { status })
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)
  const contentLengthHeader = request.headers.get('content-length')

  if (!contentLengthHeader) {
    return errorResponse(locale, 'Content-Length header is required.', 411)
  }

  const contentLength = Number(contentLengthHeader)
  if (!Number.isFinite(contentLength) || contentLength < 0) {
    return errorResponse(locale, 'Invalid Content-Length header.', 400)
  }

  if (contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(locale, 'Caption upload is too large.', 413)
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return errorResponse(locale, 'Invalid form data.', 400)
  }

  const file = formData.get('captions')
  let raw = ''

  try {
    if (typeof file === 'string') {
      raw = file
    } else if (file instanceof File) {
      if (file.size > MAX_CAPTION_TEXT_BYTES) {
        return errorResponse(locale, 'Caption file is too large.', 413)
      }
      raw = await file.text()
    } else {
      raw = String(formData.get('text') || '')
    }
  } catch {
    return errorResponse(locale, 'Unable to read caption data.', 400)
  }

  if (utf8ByteLength(raw) > MAX_CAPTION_TEXT_BYTES) {
    return errorResponse(locale, 'Caption text is too large.', 413)
  }

  let cues: ReturnType<typeof parseCaptionText>
  try {
    cues = parseCaptionText(raw)
  } catch {
    return errorResponse(locale, 'Invalid caption data.', 400)
  }

  if (cues.length > MAX_CUE_COUNT) {
    return errorResponse(locale, 'Caption file contains too many cues.', 413)
  }

  const body: JsonSafeVideoResponse<{ cues: typeof cues; cueCount: number }> = {
    ok: true,
    data: { cues, cueCount: cues.length },
    error: null,
    meta: { locale, generatedAt: new Date().toISOString() },
  }
  return NextResponse.json(body)
}
