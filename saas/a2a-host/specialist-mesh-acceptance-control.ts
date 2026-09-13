import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SPECIALIST_MESH_ACCEPTANCE_CONTROL_VERSION = 'signalboost-specialist-mesh-acceptance-control-v1' as const
export const SPECIALIST_MESH_ACCEPTANCE_FAILURE_HEADER = 'x-itmounts-mesh-acceptance-failure' as const

function required(value: unknown, name: string): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*') throw new Error(`specialist mesh acceptance ${name} is required`)
  return normalized
}

function secret(value: string | undefined): string {
  const normalized = String(value ?? '').trim()
  if (normalized.length < 16) throw new Error('specialist_mesh_acceptance_control_secret_unavailable')
  return normalized
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
  const signingSecret = secret(input.signingSecret ?? process.env.CRON_SECRET)
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('specialist_mesh_acceptance_control_time_invalid')
  const ttlMs = Math.max(5_000, Math.min(300_000, Math.floor(input.ttlMs ?? 60_000)))
  const expiresAt = now.getTime() + ttlMs
  const nonce = required(input.nonce ?? randomBytes(12).toString('hex'), 'nonce')
  const payload = `${SPECIALIST_MESH_ACCEPTANCE_CONTROL_VERSION}.${agentId}.${expiresAt}.${nonce}`
  return `${payload}.${signature(payload, signingSecret)}`
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
    const signingSecret = secret(input.signingSecret ?? process.env.CRON_SECRET)
    const expectedAgentId = required(input.agentId, 'agentId')
    const parts = token.split('.')
    if (parts.length !== 5) return false
    const [version, agentId, expiresRaw, nonce, providedSignature] = parts
    if (version !== SPECIALIST_MESH_ACCEPTANCE_CONTROL_VERSION || agentId !== expectedAgentId || !nonce || !providedSignature) return false
    const expiresAt = Number(expiresRaw)
    const now = (input.now ?? new Date()).getTime()
    if (!Number.isFinite(now) || !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 300_000) return false
    const payload = `${version}.${agentId}.${expiresRaw}.${nonce}`
    const expectedSignature = signature(payload, signingSecret)
    const left = Buffer.from(providedSignature, 'hex')
    const right = Buffer.from(expectedSignature, 'hex')
    return left.length === right.length && left.length > 0 && timingSafeEqual(left, right)
  } catch {
    return false
  }
}
