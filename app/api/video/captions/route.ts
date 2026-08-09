import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const MAX_CAPTION_TEXT_BYTES = 512 * 1024
const MAX_CAPTION_CUES = 5000

class PayloadTooLargeError extends Error {}

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

function declaredRequestBodyTooLarge(request: Request): boolean {
  const contentLength = request.headers.get('content-length')
  if (!contentLength) return false

  const parsed = Number(contentLength)
  return Number.isFinite(parsed) && parsed > MAX_REQUEST_BODY_BYTES
}

async function readRequestBodyWithLimit(request: Request): Promise<Uint8Array> {
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

function textByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  let formData: FormData
  try {
    if (declaredRequestBodyTooLarge(request)) {
      throw new PayloadTooLargeError('Request body is too large')
    }

    const requestBody = await readRequestBodyWithLimit(request)
    const headers = new Headers(request.headers)
    headers.delete('content-length')

    formData = await new Request(request.url, {
      method: request.method,
      headers,
      body: requestBody,
    }).formData()
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return errorResponse(locale, 413, 'Caption upload is too large')
    }

    console.error('Failed to read captions form data', error)
    return errorResponse(locale, 400, 'Invalid captions form data')
  }

  let raw: string
  try {
    const file = formData.get('captions')
    if (typeof file === 'string') {
      raw = file
    } else if (file instanceof File) {
      if (file.size > MAX_CAPTION_TEXT_BYTES) {
        return errorResponse(locale, 413, 'Caption input is too large')
      }
      raw = await file.text()
    } else {
      raw = String(formData.get('text') || '')
    }
  } catch (error) {
    console.error('Failed to read captions input', error)
    return errorResponse(locale, 400, 'Invalid captions input')
  }

  if (textByteLength(raw) > MAX_CAPTION_TEXT_BYTES) {
    return errorResponse(locale, 413, 'Caption input is too large')
  }

  let cues: ReturnType<typeof parseCaptionText>
  try {
    cues = parseCaptionText(raw)
  } catch (error) {
    console.error('Failed to parse captions input', error)
    return errorResponse(locale, 400, 'Invalid captions input')
  }

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
}
