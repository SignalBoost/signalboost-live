import { NextResponse } from 'next/server'
import { parseCaptionText } from '@/lib/video/captions'
import type { JsonSafeVideoResponse, SupportedVideoLocale } from '@/lib/video/types'

const MAX_REQUEST_BODY_BYTES = 2 * 1024 * 1024
const MAX_CAPTION_TEXT_LENGTH = 1024 * 1024
const MAX_CUE_COUNT = 10000

type ErrorStatus = 400 | 413

class ClientInputError extends Error {
  readonly status: ErrorStatus

  constructor(message: string, status: ErrorStatus) {
    super(message)
    this.status = status
    Object.setPrototypeOf(this, ClientInputError.prototype)
  }
}

function localeFromRequest(request: Request): SupportedVideoLocale {
  const requested = new URL(request.url).searchParams.get('locale') || 'en'
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(requested) ? requested as SupportedVideoLocale : 'en'
}

function errorResponse(locale: SupportedVideoLocale, status: ErrorStatus, message: string) {
  const body: JsonSafeVideoResponse<null> = {
    ok: false,
    data: null,
    error: message,
    meta: { locale, generatedAt: new Date().toISOString() },
  }
  return NextResponse.json(body, { status })
}

function inputErrorResponse(locale: SupportedVideoLocale, error: unknown, fallbackMessage: string) {
  if (error instanceof ClientInputError) {
    return errorResponse(locale, error.status, error.message)
  }
  return errorResponse(locale, 400, fallbackMessage)
}

function validateContentLength(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (contentLength === null) return

  const normalized = contentLength.trim()
  if (!/^\d+$/.test(normalized)) {
    throw new ClientInputError('Invalid Content-Length', 400)
  }

  const length = Number(normalized)
  if (!Number.isSafeInteger(length)) {
    throw new ClientInputError('Invalid Content-Length', 400)
  }

  if (length > MAX_REQUEST_BODY_BYTES) {
    throw new ClientInputError('Request body is too large', 413)
  }
}

async function readLimitedFormData(request: Request) {
  validateContentLength(request)

  const reader = request.body?.getReader()
  const chunks: BlobPart[] = []
  let totalBytes = 0

  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalBytes += value.byteLength
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // Ignore cancellation errors; the request is already being rejected.
        }
        throw new ClientInputError('Request body is too large', 413)
      }

      const copy = new Uint8Array(value.byteLength)
      copy.set(value)
      chunks.push(copy)
    }
  }

  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  return new Response(new Blob(chunks), { headers }).formData()
}

async function captionTextFromFormData(formData: FormData) {
  const file = formData.get('captions')

  if (typeof file === 'string') return file

  if (file instanceof File) {
    if (file.size > MAX_CAPTION_TEXT_LENGTH) {
      throw new ClientInputError('Caption text is too large', 413)
    }
    return file.text()
  }

  return String(formData.get('text') || '')
}

export async function POST(request: Request) {
  const locale = localeFromRequest(request)

  let formData: FormData
  try {
    formData = await readLimitedFormData(request)
  } catch (error) {
    return inputErrorResponse(locale, error, 'Invalid form data')
  }

  let raw: string
  try {
    raw = await captionTextFromFormData(formData)
  } catch (error) {
    return inputErrorResponse(locale, error, 'Invalid form data')
  }

  if (raw.length > MAX_CAPTION_TEXT_LENGTH) {
    return errorResponse(locale, 413, 'Caption text is too large')
  }

  let cues: ReturnType<typeof parseCaptionText>
  try {
    cues = parseCaptionText(raw)
  } catch {
    return errorResponse(locale, 400, 'Invalid caption text')
  }

  if (cues.length > MAX_CUE_COUNT) {
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
