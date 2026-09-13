import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SPECIALIST_MESH_ACCEPTANCE_CONTROL_VERSION = 'signalboost-specialist-mesh-acceptance-control-v1' as const
export const SPECIALIST_MESH_ACCEPTANCE_FAILURE_HEADER = 'x-itmounts-mesh-acceptance-failure' as const

const CONTROL_SECRET_DERIVATION_CONTEXT = `${SPECIALIST_MESH_ACCEPTANCE_CONTROL_VERSION}:failure-token-signing`

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*') throw new Error(`specialist mesh acceptance ${name} is required`)
  return normalized
}

function validatedSecret(value: string | undefined): string {
  const normalized = String(value ?? '').trim()
  if (normalized.length < 16) throw new Error('specialist_mesh_acceptance_control_secret_unavailable')
  return normalized
}

/**
 * Resolve server-only fault-injection signing material independently from cron authentication.
 * A dedicated secret wins when configured. Otherwise derive a domain-separated key from the
 * existing server-only Supabase service-role secret; the service-role value itself is never sent
 * or persisted. CRON_SECRET intentionally is not a signing-key fallback.
 */
export function resolveSpecialistMeshAcceptanceControlSecret(env: NodeJS.ProcessEnv = process.env): string {
  const dedicated = String(env.SPECIALIST_MESH_ACCEPTANCE_CONTROL_SECRET ?? '').trim()
  if (dedicated) return validatedSecret(dedicated)

  const serviceRoleSecret = String(env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (serviceRoleSecret.length < 32) throw new Error('specialist_mesh_acceptance_control_secret_unavailable')
  return createHmac('sha256', serviceRoleSecret).update(CONTROL_SECRET_DERIVATION_CONTEXT, 'utf8').digest('hex')
}

function signingSecret(explicit: string | undefined): string {
  return explicit === undefined ? resolveSpecialistMeshAcceptanceControlSecret() : validatedSecret(explicit)
}

function signature(payload: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(payload, 'utf8').digest('hex')
}

/**
 * Create a short-lived, server-only token that permits one controlled HTTP 503 from the exact
 * advisory specialist endpoint named in the token. This token grants no A2A skill, scope or
 * authority; it is only a Production acceptance fault-injection control.
 */
export function createSpecialistMeshAcceptanceFailureToken(input: {
  agentId: string
  signingSecret?: string
  now?: Date
  ttlMs?: number
  nonce?: string
}): string {
  const agentId = required(input.agentId, 'agentId')
  const secret = signingSecret(input.signingSecret)
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('specialist_mesh_acceptance_control_time_invalid')
  const ttlMs = Math.max(5_000, Math.min(300_000, Math.floor(input.ttlMs ?? 60_000)))
  const expiresAt = now.getTime() + ttlMs
  const nonce = required(input.nonce ?? randomBytes(12).toString('hex'), 'nonce')
  const payload = `${SPECIALIST_MESH_ACCEPTANCE_CONTROL_VERSION}.${agentId}.${expiresAt}.${nonce}`
  return `${payload}.${signature(payload, secret)}`
}

/** Validate without throwing so public A2A endpoints fail closed to normal advisory execution. */
export function isValidSpecialistMeshAcceptanceFailureToken(input: {
  token: string | null | undefined
  agentId: string
  signingSecret?: string
  now?: Date
}): boolean {
  try {
    const token = String(input.token ?? '').trim()
    if (!token) return false
    const secret = signingSecret(input.signingSecret)
    const expectedAgentId = required(input.agentId, 'agentId')
    const parts = token.split('.')
    if (parts.length !== 5) return false
    const [version, agentId, expiresRaw, nonce, providedSignature] = parts
    if (version !== SPECIALIST_MESH_ACCEPTANCE_CONTROL_VERSION || agentId !== expectedAgentId || !nonce || !providedSignature) return false
    const expiresAt = Number(expiresRaw)
    const now = (input.now ?? new Date()).getTime()
    if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 300_000) return false
    const payload = `${version}.${agentId}.${expiresRaw}.${nonce}`
    const expectedSignature = signature(payload, secret)
    const left = Buffer.from(providedSignature, 'hex')
    const right = Buffer.from(expectedSignature, 'hex')
    return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
  } catch {
    return false
  }
}
