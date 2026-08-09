import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_CAPTION_TEXT_BYTES = 1024 * 1024
const MAX_CAPTION_CUES = 5000

class ClientInputError extends Error {
  readonly status: 400 | 413

  constructor(message: string, status: 400 | 413 = 400) {
    super(message)
    this.name = 'ClientInputError'
    this.status = status
  }
}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

function errorResponse(locale: SupportedVideoLocale, status: 400 | 413, message: string) {
  return NextResponse.json({
    ok: false,
    data: null,
    error: message,
    meta: { locale, generatedAt: new Date().toISOString() },
  }, { status })
}

function validateContentLength(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (contentLength === null) return

  const normalized = contentLength.trim()
  if (!/^\d+$/.test(normalized)) {
    throw new ClientInputError('Invalid request headers', 400)
  }

  if (Number(normalized) > MAX_REQUEST_BODY_BYTES) {
    throw new ClientInputError('Caption upload is too large', 413)
  }
}

async function readLimitedRequestBody(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()

  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    received += value.byteLength
    if (received > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new ClientInputError('Caption upload is too large', 413)
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

async function limitedFormData(request: Request): Promise<FormData> {
  validateContentLength(request)
  const body = await readLimitedRequestBody(request)
  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  }).formData()
}

function utf8ByteLengthExceeds(value: string, maxBytes: number): boolean {
  let bytes = 0

  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)

    if (code <= 0x7f) {
      bytes += 1
    } else if (code <= 0x7ff) {
      bytes += 2
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        i += 1
      } else {
        bytes += 3
      }
    } else {
      bytes += 3
    }

    if (bytes > maxBytes) return true
  }

  return false
}

function validateCaptionTextSize(raw: string) {
  if (utf8ByteLengthExceeds(raw, MAX_CAPTION_TEXT_BYTES)) {
    throw new ClientInputError('Caption input is too large', 413)
  }
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  try {
    const formData = await limitedFormData(request)
    const file = formData.get('captions')

    if (file instanceof File && file.size > MAX_CAPTION_TEXT_BYTES) {
      throw new ClientInputError('Caption input is too large', 413)
    }

    const raw = typeof file === 'string' ? file : file instanceof File ? await file.text() : String(formData.get('text') || '')
    validateCaptionTextSize(raw)

    const cues = parseCaptionText(raw)
    if (cues.length > MAX_CAPTION_CUES) {
      throw new ClientInputError('Caption input has too many cues', 413)
    }

    const body: JsonSafeVideoResponse<{ cues: typeof cues; cueCount: number }> = {
      ok: true,
      data: { cues, cueCount: cues.length },
      error: null,
      meta: { locale, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(body)
  } catch (error) {
    if (error instanceof ClientInputError) {
      return errorResponse(locale, error.status, error.message)
    }

    console.warn('Failed to process caption upload', error)
    return errorResponse(locale, 400, 'Invalid caption input')
  }
}
