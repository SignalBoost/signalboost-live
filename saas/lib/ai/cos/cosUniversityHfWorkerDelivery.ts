import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

const WORKER_TOKEN_CONTEXT = 'itmounts:cos-university:hf-worker-delivery:v1'
const WORKER_ROUTE_PREFIX = '/api/internal/cos/hf-worker'
const WORKER_FILENAME = 'cos-university-hf-worker.py'

function clean(value: unknown, max = 4096): string { return String(value ?? '').trim().slice(0, max) }
function originFromEnv(env: Record<string, string | undefined>): string | null {
  const explicit = clean(env.ITMOUNTS_PUBLIC_ORIGIN || env.NEXT_PUBLIC_APP_URL, 2000)
  const candidate = explicit || (clean(env.VERCEL_URL, 1000) ? `https://${clean(env.VERCEL_URL, 1000)}` : '')
  if (!candidate) return null
  try { const url = new URL(candidate); return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.origin : null } catch { return null }
}
export function deriveHfWorkerDeliveryToken(hfToken: string): string {
  const token = clean(hfToken); if (token.length < 20) throw new Error('hf_worker_delivery_token_invalid')
  return createHmac('sha256', token).update(WORKER_TOKEN_CONTEXT).digest('hex')
}
export function verifyHfWorkerDeliveryToken(candidate: string, hfToken: string): boolean {
  try { const expected = Buffer.from(deriveHfWorkerDeliveryToken(hfToken)); const supplied = Buffer.from(clean(candidate, 128)); return supplied.length === expected.length && timingSafeEqual(supplied, expected) } catch { return false }
}
export function installHfWorkerDeliveryEnv(env: Record<string, string | undefined> = process.env): string | null {
  const hfToken = clean(env.HF_TOKEN); const origin = originFromEnv(env)
  if (hfToken.length < 20 || !origin) return null
  const workerUrl = `${origin}${WORKER_ROUTE_PREFIX}/${deriveHfWorkerDeliveryToken(hfToken)}/${WORKER_FILENAME}`
  env.COS_UNIVERSITY_HF_WORKER_URL = workerUrl
  return workerUrl
}

export type HfWorkerDeliveryPreflight = Readonly<{
  ok: boolean
  workerUrl: string | null
  status: number | null
  sha256: string | null
  bytes: number
  reason: string | null
}>

/**
 * Fail-fast probe used by the Self-Healing Supervisor before a recovery workflow is allowed to
 * dispatch another paid Hugging Face job. This specifically prevents repository visibility,
 * route/auth, deployment, and missing-artifact failures from becoming a paid retry storm.
 */
export async function preflightHfWorkerDelivery(input: {
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
} = {}): Promise<HfWorkerDeliveryPreflight> {
  const env = input.env ?? process.env
  const workerUrl = installHfWorkerDeliveryEnv(env)
  if (!workerUrl) return Object.freeze({ ok: false, workerUrl: null, status: null, sha256: null, bytes: 0, reason: 'hf_worker_delivery_not_configured' })
  try {
    const response = await (input.fetchImpl ?? fetch)(workerUrl, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: { 'user-agent': 'iTMounts-Self-Healing-Supervisor/1.0' },
    })
    const source = await response.text()
    const bytes = Buffer.byteLength(source, 'utf8')
    const looksLikeWorker = source.includes('ITMOUNTS_TRAINING_REQUEST') && source.includes('HF_TOKEN')
    if (!response.ok || bytes < 256 || !looksLikeWorker) {
      return Object.freeze({
        ok: false,
        workerUrl,
        status: response.status,
        sha256: null,
        bytes,
        reason: !response.ok ? `hf_worker_delivery_http_${response.status}` : 'hf_worker_delivery_artifact_invalid',
      })
    }
    return Object.freeze({
      ok: true,
      workerUrl,
      status: response.status,
      sha256: createHash('sha256').update(source).digest('hex'),
      bytes,
      reason: null,
    })
  } catch (error) {
    return Object.freeze({
      ok: false,
      workerUrl,
      status: null,
      sha256: null,
      bytes: 0,
      reason: error instanceof Error ? `hf_worker_delivery_preflight_failed:${clean(error.message, 180)}` : 'hf_worker_delivery_preflight_failed',
    })
  }
}
