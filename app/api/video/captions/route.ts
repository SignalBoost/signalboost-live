import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 6 * 1024 * 1024
const MAX_CAPTION_BYTES = 5 * 1024 * 1024
const MAX_CAPTION_TEXT_CHARS = 5 * 1024 * 1024
const MAX_CAPTION_CUES = 10_000

class PayloadTooLargeError extends Error {
  constructor(message = 'Caption upload is too large') {
    super(message)
    this.name = 'PayloadTooLargeError'
  }
}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

function errorResponse(locale: SupportedVideoLocale, status: number, message: string) {
  const body: JsonSafeVideoResponse<null> = {
    ok: false,
    data: null,
    error: message,
    meta: { locale, generatedAt: new Date().toISOString() },
  }
  return NextResponse.json(body, { status })
}

async function readRequestBodyWithLimit(request: Request): Promise<Uint8Array> {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new Error('Invalid content length')
    }
    if (contentLength > MAX_REQUEST_BODY_BYTES) {
      throw new PayloadTooLargeError()
    }
  }

  if (!request.body) {
    return new Uint8Array()
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    received += value.byteLength
    if (received > MAX_REQUEST_BODY_BYTES) {
      try {
        await reader.cancel()
      } catch {
        // Ignore cancellation failures; the request is already rejected.
      }
      throw new PayloadTooLargeError()
    }
    chunks.push(value)
  }

  const body = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function formDataFromLimitedRequest(request: Request): Promise<FormData> {
  const body = await readRequestBodyWithLimit(request)
  const headers = new Headers(request.headers)
  headers.delete('content-length')

  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  }).formData()
}

function ensureCaptionTextSize(raw: string) {
  if (raw.length > MAX_CAPTION_TEXT_CHARS) {
    throw new PayloadTooLargeError()
  }
}

async function captionTextFromFormData(formData: FormData): Promise<string> {
  const file = formData.get('captions')

  if (typeof file === 'string') {
    ensureCaptionTextSize(file)
    return file
  }

  if (file instanceof File) {
    if (file.size > MAX_CAPTION_BYTES) {
      throw new PayloadTooLargeError()
    }
    const raw = await file.text()
    ensureCaptionTextSize(raw)
    return raw
  }

  const text = formData.get('text')
  const raw = typeof text === 'string' ? text : String(text || '')
  ensureCaptionTextSize(raw)
  return raw
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  try {
    const formData = await formDataFromLimitedRequest(request)
    const raw = await captionTextFromFormData(formData)
    const cues = parseCaptionText(raw)

    if (cues.length > MAX_CAPTION_CUES) {
      throw new PayloadTooLargeError('Caption upload contains too many cues')
    }

    const body: JsonSafeVideoResponse<{ cues: typeof cues; cueCount: number }> = {
      ok: true,
      data: { cues, cueCount: cues.length },
      error: null,
      meta: { locale, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(body)
  } catch (error) {
    console.warn('Caption upload rejected', error instanceof Error ? { name: error.name, message: error.message } : error)

    if (error instanceof PayloadTooLargeError) {
      return errorResponse(locale, 413, error.message)
    }

    return errorResponse(locale, 400, 'Invalid caption upload')
  }
}
