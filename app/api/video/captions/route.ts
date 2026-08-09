import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_CAPTION_TEXT_BYTES = 1024 * 1024
const MAX_CUES = 5000

class ClientInputError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

class PayloadTooLargeError extends ClientInputError {
  constructor(message = 'Captions payload is too large') {
    super(413, 'PAYLOAD_TOO_LARGE', message)
  }
}

class BadRequestError extends ClientInputError {
  constructor(message = 'Invalid captions input') {
    super(400, 'INVALID_CAPTIONS', message)
  }
}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

async function readRequestBodyWithLimit(request: Request, limitBytes: number): Promise<Uint8Array> {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new BadRequestError('Invalid request body')
    }
    if (contentLength > limitBytes) {
      throw new PayloadTooLargeError()
    }
  }

  if (!request.body) {
    return new Uint8Array()
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (!value) {
        continue
      }

      total += value.byteLength
      if (total > limitBytes) {
        try {
          await reader.cancel()
        } catch {
          // Ignore cancellation errors while rejecting the oversized request.
        }
        throw new PayloadTooLargeError()
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof ClientInputError) {
      throw error
    }
    throw new BadRequestError('Invalid request body')
  } finally {
    reader.releaseLock()
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

async function readLimitedFormData(request: Request): Promise<FormData> {
  const body = await readRequestBodyWithLimit(request, MAX_REQUEST_BODY_BYTES)
  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) {
    headers.set('content-type', contentType)
  }

  try {
    return await new Request(request.url, {
      method: request.method,
      headers,
      body,
    }).formData()
  } catch {
    throw new BadRequestError('Invalid form data')
  }
}

function assertCaptionTextSize(raw: string) {
  if (new TextEncoder().encode(raw).byteLength > MAX_CAPTION_TEXT_BYTES) {
    throw new PayloadTooLargeError()
  }
}

async function captionTextFromFormData(formData: FormData): Promise<string> {
  const file = formData.get('captions')
  if (typeof file === 'string') {
    assertCaptionTextSize(file)
    return file
  }
  if (file instanceof File) {
    if (file.size > MAX_CAPTION_TEXT_BYTES) {
      throw new PayloadTooLargeError()
    }
    const raw = await file.text()
    assertCaptionTextSize(raw)
    return raw
  }

  const raw = String(formData.get('text') || '')
  assertCaptionTextSize(raw)
  return raw
}

function errorResponse(locale: SupportedVideoLocale, error: unknown) {
  const clientError = error instanceof ClientInputError ? error : new BadRequestError()
  console.warn('Caption upload rejected', error)

  return NextResponse.json({
    ok: false,
    data: null,
    error: { code: clientError.code, message: clientError.message },
    meta: { locale, generatedAt: new Date().toISOString() },
  }, { status: clientError.status })
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  try {
    const formData = await readLimitedFormData(request)
    const raw = await captionTextFromFormData(formData)
    const cues = parseCaptionText(raw)
    if (cues.length > MAX_CUES) {
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
    return errorResponse(locale, error)
  }
}
