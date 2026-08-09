import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_CAPTION_TEXT_BYTES = 1 * 1024 * 1024
const MAX_CAPTION_CUES = 5000

class PayloadTooLargeError extends Error {}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

function errorResponse(locale: SupportedVideoLocale, status: number, message: string) {
  return NextResponse.json({
    ok: false,
    data: null,
    error: { message },
    meta: { locale, generatedAt: new Date().toISOString() },
  }, { status })
}

async function readLimitedRequestBody(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()

  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > MAX_REQUEST_BODY_BYTES) {
      throw new PayloadTooLargeError('Request body is too large')
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

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const parsedContentLength = Number(contentLength)
    if (!Number.isFinite(parsedContentLength) || parsedContentLength < 0) {
      return errorResponse(locale, 400, 'Invalid request body')
    }
    if (parsedContentLength > MAX_REQUEST_BODY_BYTES) {
      return errorResponse(locale, 413, 'Request body is too large')
    }
  }

  try {
    const requestBody = await readLimitedRequestBody(request)
    const formRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: requestBody,
    })
    const formData = await formRequest.formData()
    const file = formData.get('captions')

    if (file instanceof File && file.size > MAX_CAPTION_TEXT_BYTES) {
      return errorResponse(locale, 413, 'Caption payload is too large')
    }

    const raw = typeof file === 'string' ? file : file instanceof File ? await file.text() : String(formData.get('text') || '')
    if (utf8ByteLength(raw) > MAX_CAPTION_TEXT_BYTES) {
      return errorResponse(locale, 413, 'Caption payload is too large')
    }

    const cues = parseCaptionText(raw)
    if (cues.length > MAX_CAPTION_CUES) {
      return errorResponse(locale, 413, 'Too many caption cues')
    }

    const body: JsonSafeVideoResponse<{ cues: typeof cues; cueCount: number }> = {
      ok: true,
      data: { cues, cueCount: cues.length },
      error: null,
      meta: { locale, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(body)
  } catch (error) {
    console.error('Failed to process captions upload', error)
    if (error instanceof PayloadTooLargeError) {
      return errorResponse(locale, 413, 'Request body is too large')
    }
    return errorResponse(locale, 400, 'Invalid captions payload')
  }
}
