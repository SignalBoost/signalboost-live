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

async function readRequestBody(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const declaredLength = Number(contentLength)
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
      throw new PayloadTooLargeError('Request body is too large')
    }
  }

  if (!request.body) return new Uint8Array()

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    total += value.byteLength
    if (total > MAX_REQUEST_BODY_BYTES) {
      await reader.cancel()
      throw new PayloadTooLargeError('Request body is too large')
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function assertCaptionTextSize(value: string) {
  if (byteLength(value) > MAX_CAPTION_TEXT_BYTES) {
    throw new PayloadTooLargeError('Caption text is too large')
  }
}

function assertCueMarkerLimit(value: string) {
  let count = 0
  let index = 0
  while ((index = value.indexOf('-->', index)) !== -1) {
    count += 1
    if (count > MAX_CAPTION_CUES) {
      throw new PayloadTooLargeError('Too many caption cues')
    }
    index += 3
  }
}

async function rawCaptionText(formData: FormData): Promise<string> {
  const file = formData.get('captions')

  if (typeof file === 'string') {
    assertCaptionTextSize(file)
    return file
  }

  if (file instanceof File) {
    if (file.size > MAX_CAPTION_TEXT_BYTES) {
      throw new PayloadTooLargeError('Caption file is too large')
    }
    const text = await file.text()
    assertCaptionTextSize(text)
    return text
  }

  const raw = String(formData.get('text') || '')
  assertCaptionTextSize(raw)
  return raw
}

function errorResponse(locale: SupportedVideoLocale, status: 400 | 413, code: string, message: string) {
  return NextResponse.json({
    ok: false,
    data: null,
    error: { code, message },
    meta: { locale, generatedAt: new Date().toISOString() },
  }, { status })
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  try {
    const bodyBytes = await readRequestBody(request)
    const headers = new Headers()
    const contentType = request.headers.get('content-type')
    if (contentType) headers.set('content-type', contentType)

    const formData = await new Request(request.url, {
      method: 'POST',
      headers,
      body: bodyBytes,
    }).formData()

    const raw = await rawCaptionText(formData)
    assertCueMarkerLimit(raw)
    const cues = parseCaptionText(raw)

    if (cues.length > MAX_CAPTION_CUES) {
      throw new PayloadTooLargeError('Too many caption cues')
    }

    const body: JsonSafeVideoResponse<{ cues: typeof cues; cueCount: number }> = {
      ok: true,
      data: { cues, cueCount: cues.length },
      error: null,
      meta: { locale, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(body)
  } catch (error) {
    console.warn('Caption upload rejected', error)

    if (error instanceof PayloadTooLargeError) {
      return errorResponse(locale, 413, 'CAPTIONS_TOO_LARGE', 'Caption upload is too large.')
    }

    return errorResponse(locale, 400, 'INVALID_CAPTIONS', 'Invalid caption upload.')
  }
}
