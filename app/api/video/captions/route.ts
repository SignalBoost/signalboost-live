import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_CAPTION_TEXT_CHARS = 1 * 1024 * 1024
const MAX_CAPTION_CUES = 5000

class PayloadTooLargeError extends Error {}
class BadRequestError extends Error {}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

async function readFormDataWithLimit(request: Request): Promise<FormData> {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const parsed = Number(contentLength)
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestError('Invalid Content-Length')
    }
    if (parsed > MAX_REQUEST_BODY_BYTES) {
      throw new PayloadTooLargeError('Request body is too large')
    }
  }

  if (!request.body) {
    return request.formData()
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel()
        throw new PayloadTooLargeError('Request body is too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  }).formData()
}

async function captionTextFromFormData(formData: FormData): Promise<string> {
  const file = formData.get('captions')

  if (typeof file === 'string') {
    if (file.length > MAX_CAPTION_TEXT_CHARS) {
      throw new PayloadTooLargeError('Caption text is too large')
    }
    return file
  }

  if (file instanceof File) {
    if (file.size > MAX_CAPTION_TEXT_CHARS) {
      throw new PayloadTooLargeError('Caption file is too large')
    }
    const text = await file.text()
    if (text.length > MAX_CAPTION_TEXT_CHARS) {
      throw new PayloadTooLargeError('Caption file is too large')
    }
    return text
  }

  const text = String(formData.get('text') || '')
  if (text.length > MAX_CAPTION_TEXT_CHARS) {
    throw new PayloadTooLargeError('Caption text is too large')
  }
  return text
}

function errorResponse(locale: SupportedVideoLocale, status: 400 | 413, message: string) {
  return NextResponse.json({
    ok: false,
    data: null,
    error: { message },
    meta: { locale, generatedAt: new Date().toISOString() },
  }, { status })
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  try {
    const formData = await readFormDataWithLimit(request)
    const raw = await captionTextFromFormData(formData)
    const cues = parseCaptionText(raw)

    if (cues.length > MAX_CAPTION_CUES) {
      throw new PayloadTooLargeError('Caption cue count is too large')
    }

    const body: JsonSafeVideoResponse<{ cues: typeof cues; cueCount: number }> = {
      ok: true,
      data: { cues, cueCount: cues.length },
      error: null,
      meta: { locale, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(body)
  } catch (error) {
    console.warn('Failed to process caption upload', error)

    if (error instanceof PayloadTooLargeError) {
      return errorResponse(locale, 413, 'Caption upload is too large')
    }

    return errorResponse(locale, 400, 'Invalid caption upload')
  }
}
