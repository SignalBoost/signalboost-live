import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { resolveSpecialistMeshAcceptanceControlSecret } from './specialist-mesh-acceptance-control.ts'

export const SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_VERSION = 'signalboost-specialist-mesh-write-acceptance-control-v1' as const
export const SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_HEADER = 'x-itmounts-mesh-write-acceptance-control' as const

export type SpecialistMeshWriteAcceptanceMode = 'normal' | 'before_apply_unavailable' | 'after_apply_unavailable'

interface TokenPayload {
  version: typeof SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_VERSION
  agentId: string
  taskId: string
  operationKey: string
  mode: SpecialistMeshWriteAcceptanceMode
  expiresAt: number
  nonce: string
}

function required(value: unknown, name: string, max = 2048): string {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized === '*' || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`specialist_mesh_write_acceptance_${name}_invalid`)
  }
  return normalized
}

function secret(explicit?: string): string {
  return explicit === undefined ? resolveSpecialistMeshAcceptanceControlSecret() : required(explicit, 'secret', 512)
}

function encode(value: TokenPayload): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function sign(payload: string, signingSecret: string): string {
  return createHmac('sha256', signingSecret).update(payload, 'utf8').digest('base64url')
}

export function createSpecialistMeshWriteAcceptanceControlToken(input: {
  agentId: string
  taskId: string
  operationKey: string
  mode: SpecialistMeshWriteAcceptanceMode
  signingSecret?: string
  now?: Date
  ttlMs?: number
  nonce?: string
}): string {
  const now = input.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new Error('specialist_mesh_write_acceptance_time_invalid')
  if (!['normal', 'before_apply_unavailable', 'after_apply_unavailable'].includes(input.mode)) {
    throw new Error('specialist_mesh_write_acceptance_mode_invalid')
  }
  const ttlMs = Math.max(5_000, Math.min(300_000, Math.floor(input.ttlMs ?? 60_000)))
  const body: TokenPayload = {
    version: SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_VERSION,
    agentId: required(input.agentId, 'agent_id', 512),
    taskId: required(input.taskId, 'task_id', 512),
    operationKey: required(input.operationKey, 'operation_key'),
    mode: input.mode,
    expiresAt: now.getTime() + ttlMs,
    nonce: required(input.nonce ?? randomBytes(12).toString('hex'), 'nonce', 512),
  }
  const payload = encode(body)
  return `${payload}.${sign(payload, secret(input.signingSecret))}`
}

export function verifySpecialistMeshWriteAcceptanceControlToken(input: {
  token: string | null | undefined
  agentId: string
  taskId: string
  operationKey: string
  signingSecret?: string
  now?: Date
}): { valid: true; mode: SpecialistMeshWriteAcceptanceMode } | { valid: false } {
  try {
    const token = String(input.token ?? '').trim()
    const [payload, providedSignature, extra] = token.split('.')
    if (!payload || !providedSignature || extra) return { valid: false }
    const expectedSignature = sign(payload, secret(input.signingSecret))
    const left = Buffer.from(providedSignature, 'base64url')
    const right = Buffer.from(expectedSignature, 'base64url')
    if (!left.length || left.length !== right.length || !timingSafeEqual(left, right)) return { valid: false }
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<TokenPayload>
    if (parsed.version !== SPECIALIST_MESH_WRITE_ACCEPTANCE_CONTROL_VERSION) return { valid: false }
    if (parsed.agentId !== required(input.agentId, 'agent_id', 512)) return { valid: false }
    if (parsed.taskId !== required(input.taskId, 'task_id', 512)) return { valid: false }
    if (parsed.operationKey !== required(input.operationKey, 'operation_key')) return { valid: false }
    if (!['normal', 'before_apply_unavailable', 'after_apply_unavailable'].includes(String(parsed.mode))) return { valid: false }
    const expiresAt = Number(parsed.expiresAt)
    const now = (input.now ?? new Date()).getTime()
    if (!Number.isFinite(expiresAt) || !Number.isFinite(now) || expiresAt <= now || expiresAt > now + 300_000) return { valid: false }
    if (!parsed.nonce) return { valid: false }
    return { valid: true, mode: parsed.mode as SpecialistMeshWriteAcceptanceMode }
  } catch {
    return { valid: false }
  }
}
