import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 3 * 1024 * 1024
const MAX_CAPTION_TEXT_BYTES = 2 * 1024 * 1024
const MAX_CAPTION_CUES = 10000
const textEncoder = new TextEncoder()

class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayloadTooLargeError'
  }
}

class InvalidInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidInputError'
  }
}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

function errorResponse(locale: SupportedVideoLocale, status: number, code: string, message: string) {
  return NextResponse.json({
    ok: false,
    data: null,
    error: { code, message },
    meta: { locale, generatedAt: new Date().toISOString() },
  }, { status })
}

function assertCaptionTextSize(raw: string) {
  if (textEncoder.encode(raw).byteLength > MAX_CAPTION_TEXT_BYTES) {
    throw new PayloadTooLargeError('Caption text is too large')
  }
}

async function readRequestBodyWithinLimit(request: Request): Promise<Uint8Array> {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader)
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new InvalidInputError('Invalid request body length')
    }
    if (contentLength > MAX_REQUEST_BODY_BYTES) {
      throw new PayloadTooLargeError('Request body is too large')
    }
  }

  if (!request.body) {
    return new Uint8Array()
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
    total += chunk.byteLength
    if (total > MAX_REQUEST_BODY_BYTES) {
      try {
        await reader.cancel()
      } catch {
        // Ignore cancellation errors; the request will be rejected below.
      }
      throw new PayloadTooLargeError('Request body is too large')
    }
    chunks.push(chunk)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function captionTextFromFormData(formData: FormData): Promise<string> {
  const file = formData.get('captions')

  if (typeof file === 'string') {
    assertCaptionTextSize(file)
    return file
  }

  if (file instanceof File) {
    if (file.size > MAX_CAPTION_TEXT_BYTES) {
      throw new PayloadTooLargeError('Caption file is too large')
    }
    const raw = await file.text()
    assertCaptionTextSize(raw)
    return raw
  }

  const text = formData.get('text')
  const raw = typeof text === 'string' ? text : String(text || '')
  assertCaptionTextSize(raw)
  return raw
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  try {
    const bodyBytes = await readRequestBodyWithinLimit(request)
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: bodyBytes,
    })
    const formData = await boundedRequest.formData()
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
    if (error instanceof PayloadTooLargeError) {
      return errorResponse(locale, 413, 'PAYLOAD_TOO_LARGE', error.message)
    }

    console.error('Failed to process caption upload', error)
    return errorResponse(locale, 400, 'INVALID_CAPTIONS', 'Invalid captions payload')
  }
}
