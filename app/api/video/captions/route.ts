import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_CAPTION_TEXT_BYTES = 1024 * 1024
const MAX_CAPTION_CUES = 5000

type ClientErrorStatus = 400 | 413

class CaptionInputError extends Error {
  status: ClientErrorStatus

  constructor(message: string, status: ClientErrorStatus = 400) {
    super(message)
    this.name = 'CaptionInputError'
    this.status = status
  }
}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

function errorResponse(locale: SupportedVideoLocale, status: ClientErrorStatus, message: string) {
  const body: JsonSafeVideoResponse<null> = {
    ok: false,
    data: null,
    error: message,
    meta: { locale, generatedAt: new Date().toISOString() },
  }
  return NextResponse.json(body, { status })
}

function isUtf8ByteLengthOverLimit(value: string, limit: number): boolean {
  let bytes = 0

  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)

    if (code < 0x80) {
      bytes += 1
    } else if (code < 0x800) {
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

    if (bytes > limit) {
      return true
    }
  }

  return false
}

function assertCaptionTextSize(raw: string) {
  if (isUtf8ByteLengthOverLimit(raw, MAX_CAPTION_TEXT_BYTES)) {
    throw new CaptionInputError('Caption input is too large', 413)
  }
}

async function readRequestBodyWithLimit(request: Request): Promise<Uint8Array> {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader)
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      throw new CaptionInputError('Invalid request body', 400)
    }
    if (contentLength > MAX_REQUEST_BODY_BYTES) {
      throw new CaptionInputError('Request body is too large', 413)
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
    if (!value) {
      continue
    }

    total += value.byteLength
    if (total > MAX_REQUEST_BODY_BYTES) {
      try {
        await reader.cancel()
      } catch {
        // Ignore cancellation errors after the request has already been rejected.
      }
      throw new CaptionInputError('Request body is too large', 413)
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

async function readLimitedFormData(request: Request): Promise<FormData> {
  const body = await readRequestBodyWithLimit(request)
  const headers = new Headers(request.headers)
  headers.delete('content-length')

  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  }).formData()
}

async function rawCaptionTextFromFormData(formData: FormData): Promise<string> {
  const file = formData.get('captions')

  if (typeof file === 'string') {
    assertCaptionTextSize(file)
    return file
  }

  if (file instanceof File) {
    if (file.size > MAX_CAPTION_TEXT_BYTES) {
      throw new CaptionInputError('Caption input is too large', 413)
    }

    let raw: string
    try {
      raw = await file.text()
    } catch {
      throw new CaptionInputError('Invalid caption input', 400)
    }

    assertCaptionTextSize(raw)
    return raw
  }

  const raw = String(formData.get('text') || '')
  assertCaptionTextSize(raw)
  return raw
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  try {
    const formData = await readLimitedFormData(request)
    const raw = await rawCaptionTextFromFormData(formData)
    let cues: ReturnType<typeof parseCaptionText>

    try {
      cues = parseCaptionText(raw)
    } catch (error) {
      console.error('Failed to parse caption input', error)
      throw new CaptionInputError('Invalid caption input', 400)
    }

    if (cues.length > MAX_CAPTION_CUES) {
      throw new CaptionInputError('Too many caption cues', 413)
    }

    const body: JsonSafeVideoResponse<{ cues: typeof cues; cueCount: number }> = {
      ok: true,
      data: { cues, cueCount: cues.length },
      error: null,
      meta: { locale, generatedAt: new Date().toISOString() },
    }
    return NextResponse.json(body)
  } catch (error) {
    if (error instanceof CaptionInputError) {
      return errorResponse(locale, error.status, error.message)
    }

    console.error('Failed to process captions upload', error)
    return errorResponse(locale, 400, 'Invalid captions upload')
  }
}
