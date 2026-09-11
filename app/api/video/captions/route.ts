import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_CAPTION_TEXT_BYTES = 1024 * 1024
const MAX_CAPTION_CUES = 5000

class CaptionInputError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

async function readRequestBodyWithLimit(request: Request): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const parsedLength = Number(contentLength)
    if (Number.isFinite(parsedLength) && parsedLength > MAX_REQUEST_BODY_BYTES) {
      throw new CaptionInputError(413, 'CAPTIONS_TOO_LARGE', 'Caption upload is too large')
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
    if (done) break

    total += value.byteLength
    if (total > MAX_REQUEST_BODY_BYTES) {
      try {
        await reader.cancel()
      } catch {
        // Ignore cancellation errors; the request will be rejected below.
      }
      throw new CaptionInputError(413, 'CAPTIONS_TOO_LARGE', 'Caption upload is too large')
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

async function readFormDataWithLimit(request: Request): Promise<FormData> {
  const body = await readRequestBodyWithLimit(request)
  const headers = new Headers(request.headers)
  headers.delete('content-length')

  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  }).formData()
}

async function captionTextFromFormData(formData: FormData): Promise<string> {
  const file = formData.get('captions')
  const raw = typeof file === 'string'
    ? file
    : file instanceof File
      ? await readCaptionFile(file)
      : String(formData.get('text') || '')

  if (byteLength(raw) > MAX_CAPTION_TEXT_BYTES) {
    throw new CaptionInputError(413, 'CAPTIONS_TOO_LARGE', 'Caption text is too large')
  }

  return raw
}

async function readCaptionFile(file: File): Promise<string> {
  if (file.size > MAX_CAPTION_TEXT_BYTES) {
    throw new CaptionInputError(413, 'CAPTIONS_TOO_LARGE', 'Caption file is too large')
  }

  return file.text()
}

function errorResponse(locale: SupportedVideoLocale, error: unknown) {
  const inputError = error instanceof CaptionInputError
    ? error
    : new CaptionInputError(400, 'INVALID_CAPTIONS', 'Invalid captions input')

  console.error('Failed to process caption upload', error)

  return NextResponse.json({
    ok: false,
    data: null,
    error: { code: inputError.code, message: inputError.message },
    meta: { locale, generatedAt: new Date().toISOString() },
  }, { status: inputError.status })
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  try {
    const formData = await readFormDataWithLimit(request)
    const raw = await captionTextFromFormData(formData)
    const cues = parseCaptionText(raw)

    if (cues.length > MAX_CAPTION_CUES) {
      throw new CaptionInputError(413, 'TOO_MANY_CAPTION_CUES', 'Too many caption cues')
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
