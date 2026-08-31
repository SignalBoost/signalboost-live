export type UserReferenceImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

export type UserReferenceImage = Readonly<{
  name: string
  b64: string
  mime: UserReferenceImageMime
  size: number
  source: 'attachment' | 'message-content' | 'reference-image'
}>

export type UserReferenceImageErrorCode =
  | 'visual_reference_image_required'
  | 'visual_reference_image_type_unsupported'
  | 'visual_reference_image_too_large'
  | 'visual_reference_image_invalid'

export const MAX_USER_REFERENCE_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_REFERENCE_CANDIDATES = 8

export class UserReferenceImageError extends Error {
  readonly code: UserReferenceImageErrorCode
  readonly observedBytes: number
  readonly maxBytes: number
  readonly declaredMime: string | null

  constructor(input: {
    code: UserReferenceImageErrorCode
    observedBytes?: number
    declaredMime?: string | null
  }) {
    super(input.code)
    this.name = 'UserReferenceImageError'
    this.code = input.code
    this.observedBytes = input.observedBytes || 0
    this.maxBytes = MAX_USER_REFERENCE_IMAGE_BYTES
    this.declaredMime = input.declaredMime || null
  }
}

type Candidate = Readonly<{
  name: string
  dataUrl: string
  declaredMime: string
  declaredSize: number
  source: UserReferenceImage['source']
}>

function record(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null
}

function declaredMime(value: Record<string, any>): string {
  return String(value.mimeType || value.type || value.mime || '').trim().toLowerCase()
}

function boundedDeclaredSize(value: unknown): number {
  const size = Number(value)
  return Number.isFinite(size) && size > 0 ? Math.floor(size) : 0
}

function candidateFromRecord(value: unknown, source: Candidate['source']): Candidate | null {
  const item = record(value)
  if (!item) return null

  const imageUrl = record(item.image_url)?.url || record(item.imageUrl)?.url
  const dataUrl = String(item.dataUrl || item.data_url || imageUrl || item.url || '').trim()
  const mime = declaredMime(item) || (/^data:([^;,]+)/i.exec(dataUrl)?.[1] || '').toLowerCase()
  if (!dataUrl && !mime.startsWith('image/')) return null

  return {
    name: String(item.name || item.filename || 'reference-image').trim() || 'reference-image',
    dataUrl,
    declaredMime: mime,
    declaredSize: boundedDeclaredSize(item.size || item.byteLength || item.bytes),
    source,
  }
}

function candidatesFromBody(body: unknown): Candidate[] {
  const root = record(body)
  if (!root) return []
  const candidates: Candidate[] = []
  const add = (candidate: Candidate | null) => {
    if (candidate && candidates.length < MAX_REFERENCE_CANDIDATES) candidates.push(candidate)
  }

  add(candidateFromRecord(root.referenceImage || root.reference_image, 'reference-image'))

  for (const attachment of Array.isArray(root.attachments) ? root.attachments : []) {
    add(candidateFromRecord(attachment, 'attachment'))
    if (candidates.length >= MAX_REFERENCE_CANDIDATES) return candidates
  }

  const messages = Array.isArray(root.messages) ? root.messages : []
  for (const message of [...messages].reverse()) {
    if (String(message?.role || '').toLowerCase() !== 'user') continue
    for (const attachment of Array.isArray(message?.attachments) ? message.attachments : []) {
      add(candidateFromRecord(attachment, 'attachment'))
      if (candidates.length >= MAX_REFERENCE_CANDIDATES) return candidates
    }
    for (const part of Array.isArray(message?.content) ? message.content : []) {
      const type = String(part?.type || '').toLowerCase()
      if (!type.includes('image') && !part?.dataUrl && !part?.data_url) continue
      add(candidateFromRecord(part, 'message-content'))
      if (candidates.length >= MAX_REFERENCE_CANDIDATES) return candidates
    }
    break
  }

  return candidates
}

function supportedMime(value: string): UserReferenceImageMime | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'image/png') return 'image/png'
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'image/jpeg'
  if (normalized === 'image/webp') return 'image/webp'
  return null
}

function sniffMime(bytes: Uint8Array): UserReferenceImageMime | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 12
    && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP'
  ) return 'image/webp'
  return null
}

function estimatedBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((value.length * 3) / 4) - padding)
}

function decodeCandidate(candidate: Candidate): UserReferenceImage {
  if (candidate.declaredSize > MAX_USER_REFERENCE_IMAGE_BYTES) {
    throw new UserReferenceImageError({
      code: 'visual_reference_image_too_large',
      observedBytes: candidate.declaredSize,
      declaredMime: candidate.declaredMime,
    })
  }

  const dataMatch = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(candidate.dataUrl)
  if (!dataMatch) {
    throw new UserReferenceImageError({
      code: candidate.declaredMime.startsWith('image/')
        ? 'visual_reference_image_invalid'
        : 'visual_reference_image_required',
      declaredMime: candidate.declaredMime,
    })
  }

  const dataMime = supportedMime(dataMatch[1])
  const declared = candidate.declaredMime ? supportedMime(candidate.declaredMime) : null
  if (!dataMime || (candidate.declaredMime && !declared)) {
    throw new UserReferenceImageError({
      code: 'visual_reference_image_type_unsupported',
      declaredMime: candidate.declaredMime || dataMatch[1],
    })
  }

  const b64 = dataMatch[2].replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64) || b64.length < 16) {
    throw new UserReferenceImageError({ code: 'visual_reference_image_invalid', declaredMime: dataMime })
  }

  const estimatedBytes = estimatedBase64Bytes(b64)
  if (estimatedBytes > MAX_USER_REFERENCE_IMAGE_BYTES) {
    throw new UserReferenceImageError({
      code: 'visual_reference_image_too_large',
      observedBytes: estimatedBytes,
      declaredMime: dataMime,
    })
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(b64, 'base64')
  } catch {
    throw new UserReferenceImageError({ code: 'visual_reference_image_invalid', declaredMime: dataMime })
  }

  if (bytes.byteLength > MAX_USER_REFERENCE_IMAGE_BYTES) {
    throw new UserReferenceImageError({
      code: 'visual_reference_image_too_large',
      observedBytes: bytes.byteLength,
      declaredMime: dataMime,
    })
  }

  const sniffed = sniffMime(bytes)
  if (!sniffed || sniffed !== dataMime || (declared && declared !== dataMime)) {
    throw new UserReferenceImageError({
      code: 'visual_reference_image_invalid',
      observedBytes: bytes.byteLength,
      declaredMime: candidate.declaredMime || dataMime,
    })
  }

  return Object.freeze({
    name: candidate.name.slice(0, 180),
    b64,
    mime: sniffed,
    size: bytes.byteLength,
    source: candidate.source,
  })
}

/** True for supported or unsupported image attachments so explicit edit requests cannot bypass validation. */
export function hasUserReferenceImage(body: unknown): boolean {
  return candidatesFromBody(body).some((candidate) =>
    candidate.declaredMime.startsWith('image/') || /^data:image\//i.test(candidate.dataUrl),
  )
}

/** Reads exactly one bounded local data-URL image. Remote URLs are never fetched. */
export function readUserReferenceImage(body: unknown): UserReferenceImage {
  const candidates = candidatesFromBody(body)
  if (!candidates.length) throw new UserReferenceImageError({ code: 'visual_reference_image_required' })

  let firstError: UserReferenceImageError | null = null
  for (const candidate of candidates) {
    try {
      return decodeCandidate(candidate)
    } catch (error) {
      if (error instanceof UserReferenceImageError && !firstError) firstError = error
    }
  }
  throw firstError || new UserReferenceImageError({ code: 'visual_reference_image_required' })
}

export function isUserReferenceImageError(value: unknown): value is UserReferenceImageError {
  return value instanceof UserReferenceImageError
}
