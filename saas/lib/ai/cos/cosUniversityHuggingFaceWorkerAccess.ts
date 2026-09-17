import { createHmac, timingSafeEqual } from 'node:crypto'

export const COS_UNIVERSITY_HF_WORKER_ROUTE = '/api/internal/cos/huggingface-worker' as const
export const COS_UNIVERSITY_HF_WORKER_ACCESS_PROFILE = 'cos_university_hf_worker_access_v1' as const
export const COS_UNIVERSITY_HF_WORKER_ACCESS_TTL_SECONDS = 15 * 60

const ALLOWED_WORKER_FILES = new Set([
  'cos-university-hf-worker.py',
  'cos-university-hf-worker-base.py',
])

function clean(value: unknown, max = 4096): string {
  return String(value ?? '').trim().slice(0, max)
}

function signature(secret: string, expiresAtSeconds: number): string {
  return createHmac('sha256', secret)
    .update(`${COS_UNIVERSITY_HF_WORKER_ACCESS_PROFILE}:${expiresAtSeconds}`)
    .digest('hex')
}

export function allowedHuggingFaceWorkerFilename(value: unknown): value is string {
  return ALLOWED_WORKER_FILES.has(clean(value, 120))
}

export function createHuggingFaceWorkerAccessToken(input: {
  secret: string
  now?: Date
  ttlSeconds?: number
}): string {
  const secret = clean(input.secret)
  if (secret.length < 32) throw new Error('huggingface_worker_access_secret_invalid')
  const ttlSeconds = Math.max(60, Math.min(30 * 60, Math.floor(input.ttlSeconds ?? COS_UNIVERSITY_HF_WORKER_ACCESS_TTL_SECONDS)))
  const expiresAtSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000) + ttlSeconds
  return `${expiresAtSeconds}.${signature(secret, expiresAtSeconds)}`
}

export function verifyHuggingFaceWorkerAccessToken(input: {
  token: string
  secret: string
  now?: Date
}): boolean {
  const token = clean(input.token, 256)
  const secret = clean(input.secret)
  if (secret.length < 32) return false
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(token)
  if (!match) return false
  const expiresAtSeconds = Number(match[1])
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000)
  if (!Number.isSafeInteger(expiresAtSeconds) || expiresAtSeconds < nowSeconds || expiresAtSeconds > nowSeconds + 31 * 60) return false
  const expected = Buffer.from(signature(secret, expiresAtSeconds), 'hex')
  const actual = Buffer.from(match[2], 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createHuggingFaceWorkerUrl(input: {
  origin: string
  secret: string
  filename?: string
  now?: Date
}): string {
  const filename = clean(input.filename || 'cos-university-hf-worker.py', 120)
  if (!allowedHuggingFaceWorkerFilename(filename)) throw new Error('huggingface_worker_filename_invalid')
  const origin = new URL(input.origin)
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.hash) throw new Error('huggingface_worker_origin_invalid')
  const token = createHuggingFaceWorkerAccessToken({ secret: input.secret, now: input.now })
  return new URL(`${COS_UNIVERSITY_HF_WORKER_ROUTE}/${token}/${filename}`, origin.origin).toString()
}
