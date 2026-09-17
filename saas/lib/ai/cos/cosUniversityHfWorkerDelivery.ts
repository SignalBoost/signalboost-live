import { createHmac, timingSafeEqual } from 'node:crypto'

const WORKER_TOKEN_CONTEXT = 'itmounts:cos-university:hf-worker-delivery:v1'
const WORKER_ROUTE_PREFIX = '/api/internal/cos/hf-worker'

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
  const workerUrl = `${origin}${WORKER_ROUTE_PREFIX}/${deriveHfWorkerDeliveryToken(hfToken)}/cos-university-hf-worker.py`
  env.COS_UNIVERSITY_HF_WORKER_URL = workerUrl
  return workerUrl
}
