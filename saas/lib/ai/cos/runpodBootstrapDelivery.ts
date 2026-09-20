import { createHmac, timingSafeEqual } from 'node:crypto'

const CONTEXT = 'itmounts:runpod:bootstrap-delivery:v1'
export const RUNPOD_BOOTSTRAP_ROUTE_PREFIX = '/api/internal/cos/runpod-bootstrap'
export const RUNPOD_BOOTSTRAP_FILENAME = 'runpod-cos-reasoner.sh'

function clean(value: unknown, max = 4096): string {
  return String(value ?? '').trim().slice(0, max)
}

function publicOrigin(env: Record<string, string | undefined>): string | null {
  const explicit = clean(env.ITMOUNTS_PUBLIC_ORIGIN || env.NEXT_PUBLIC_APP_URL, 2000)
  const candidate = explicit || (clean(env.VERCEL_URL, 1000) ? `https://${clean(env.VERCEL_URL, 1000)}` : '')
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password && !url.hash
      ? url.origin
      : null
  } catch {
    return null
  }
}

export function deriveRunpodBootstrapDeliveryToken(apiKey: string): string {
  const key = clean(apiKey)
  if (key.length < 20) throw new Error('runpod_bootstrap_delivery_token_invalid')
  return createHmac('sha256', key).update(CONTEXT).digest('hex')
}

export function verifyRunpodBootstrapDeliveryToken(
  candidate: string,
  apiKey: string,
): boolean {
  try {
    const expected = Buffer.from(deriveRunpodBootstrapDeliveryToken(apiKey))
    const supplied = Buffer.from(clean(candidate, 128))
    return supplied.length === expected.length && timingSafeEqual(supplied, expected)
  } catch {
    return false
  }
}

export function runpodBootstrapDeliveryUrl(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const apiKey = clean(env.RUNPOD_API_KEY)
  const origin = publicOrigin(env)
  if (apiKey.length < 20 || !origin) return null
  const capability = deriveRunpodBootstrapDeliveryToken(apiKey)
  return `${origin}${RUNPOD_BOOTSTRAP_ROUTE_PREFIX}/${capability}/${RUNPOD_BOOTSTRAP_FILENAME}`
}
