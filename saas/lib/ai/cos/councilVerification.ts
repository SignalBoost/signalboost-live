import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import type { CouncilRole } from '@/lib/ai/cos/cognitiveCouncil'

export const COUNCIL_VERIFICATION_SOURCE_CLASSES = [
  'deterministic_tool',
  'human_review',
  'production_outcome',
  'authoritative_record',
] as const

export type CouncilVerificationSourceClass = typeof COUNCIL_VERIFICATION_SOURCE_CLASSES[number]
export type CouncilVerificationVerdict = 'supported' | 'refuted' | 'not_scored'

export type CouncilRoleVerdict = {
  role: CouncilRole
  verdict: CouncilVerificationVerdict
  note: string
}

export type CouncilVerificationInput = {
  sessionId: string
  sourceClass: CouncilVerificationSourceClass
  sourceRef: string
  summary: string
  findings?: string[]
  verdicts: CouncilRoleVerdict[]
}

export type CouncilVerificationResult = {
  ok: true
  sessionId: string
  problemClass: string
  sourceClass: CouncilVerificationSourceClass
  verifiedRoles: number
  supportedRoles: number
  refutedRoles: number
  alreadyVerified: boolean
}

export class CouncilVerificationError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = 'invalid_council_verification') {
    super(message)
    this.name = 'CouncilVerificationError'
    this.status = status
    this.code = code
  }
}

function safeText(value: unknown, max = 1200): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function isAcceptedCouncilVerificationSource(value: unknown): value is CouncilVerificationSourceClass {
  return (COUNCIL_VERIFICATION_SOURCE_CLASSES as readonly string[]).includes(String(value ?? ''))
}

export function normalizeCouncilVerificationVerdicts(value: unknown): CouncilRoleVerdict[] {
  if (!Array.isArray(value)) throw new CouncilVerificationError('verdicts must be an array.')
  const seen = new Set<string>()
  const normalized: CouncilRoleVerdict[] = []

  for (const item of value.slice(0, 12)) {
    const role = safeText((item as any)?.role, 40) as CouncilRole
    const verdictRaw = safeText((item as any)?.verdict, 40).toLowerCase()
    if (!['architect', 'sre', 'database', 'security', 'business', 'skeptic'].includes(role)) {
      throw new CouncilVerificationError(`Unsupported Council role: ${role || 'missing'}.`)
    }
    if (seen.has(role)) throw new CouncilVerificationError(`Duplicate Council verdict for role ${role}.`)
    if (!['supported', 'refuted', 'not_scored'].includes(verdictRaw)) {
      throw new CouncilVerificationError(`Unsupported verdict for ${role}: ${verdictRaw || 'missing'}.`)
    }
    seen.add(role)
    normalized.push({
      role,
      verdict: verdictRaw as CouncilVerificationVerdict,
      note: safeText((item as any)?.note, 1000),
    })
  }

  if (!normalized.some(item => item.verdict !== 'not_scored')) {
    throw new CouncilVerificationError('At least one role must be externally scored as supported or refuted.')
  }
  return normalized
}

export function normalizeCouncilVerificationRequest(value: unknown): CouncilVerificationInput {
  const input = (value && typeof value === 'object' ? value : {}) as any
  const sessionId = safeText(input.sessionId, 80)
  if (!validUuid(sessionId)) throw new CouncilVerificationError('A valid Council sessionId is required.')

  const sourceClass = safeText(input.sourceClass, 80)
  if (!isAcceptedCouncilVerificationSource(sourceClass)) {
    throw new CouncilVerificationError(
      `sourceClass must be one of: ${COUNCIL_VERIFICATION_SOURCE_CLASSES.join(', ')}. Model consensus is not a verification source.`,
    )
  }

  const sourceRef = safeText(input.sourceRef, 1000)
  if (!sourceRef) throw new CouncilVerificationError('sourceRef is required so the verification remains auditable.')
  if (/^(?:model|council|llm|consensus):/i.test(sourceRef)) {
    throw new CouncilVerificationError('A model or Council reference cannot be used as external verification evidence.')
  }

  const summary = safeText(input.summary, 4000)
  if (!summary) throw new CouncilVerificationError('summary is required.')

  const findings = Array.isArray(input.findings)
    ? input.findings.map((item: unknown) => safeText(item, 1000)).filter(Boolean).slice(0, 20)
    : []

  return {
    sessionId,
    sourceClass,
    sourceRef,
    summary,
    findings,
    verdicts: normalizeCouncilVerificationVerdicts(input.verdicts),
  }
}

/**
 * Record an outcome only after evidence external to Council exists. The database RPC performs the
 * session lock, verification insert, credibility updates and session transition atomically.
 */
export async function recordCouncilVerifiedOutcome(rawInput: unknown): Promise<CouncilVerificationResult> {
  const input = normalizeCouncilVerificationRequest(rawInput)
  const db = cosServiceDb()
  if (!db) throw new CouncilVerificationError('COS service database is unavailable.', 503, 'council_database_unavailable')

  const sessionResult = await db.from('cos_council_sessions')
    .select('id,problem_class,status')
    .eq('id', input.sessionId)
    .maybeSingle()
  if (sessionResult.error) throw new CouncilVerificationError(sessionResult.error.message, 500, 'council_session_lookup_failed')
  if (!sessionResult.data) throw new CouncilVerificationError('Council session was not found.', 404, 'council_session_not_found')

  const problemClass = safeText(sessionResult.data.problem_class, 240)
  if (sessionResult.data.status === 'verified') {
    return {
      ok: true,
      sessionId: input.sessionId,
      problemClass,
      sourceClass: input.sourceClass,
      verifiedRoles: 0,
      supportedRoles: 0,
      refutedRoles: 0,
      alreadyVerified: true,
    }
  }
  if (sessionResult.data.status !== 'deliberated') {
    throw new CouncilVerificationError(
      `Council session must be deliberated before verification; current status is ${sessionResult.data.status}.`,
      409,
      'council_session_not_deliberated',
    )
  }

  const opinionResult = await db.from('cos_council_opinions').select('role').eq('session_id', input.sessionId)
  if (opinionResult.error) throw new CouncilVerificationError(opinionResult.error.message, 500, 'council_opinion_lookup_failed')
  const opinionRoles = new Set((opinionResult.data ?? []).map(row => String(row.role)))
  for (const verdict of input.verdicts) {
    if (!opinionRoles.has(verdict.role)) {
      throw new CouncilVerificationError(
        `Role ${verdict.role} did not produce an opinion in Council session ${input.sessionId}.`,
        400,
        'council_verdict_role_missing',
      )
    }
  }

  const rpc = await db.rpc('cos_record_council_verified_outcome', {
    p_session_id: input.sessionId,
    p_source_class: input.sourceClass,
    p_source_ref: input.sourceRef,
    p_summary: input.summary,
    p_findings: input.findings,
    p_verdicts: input.verdicts,
  })
  if (rpc.error) throw new CouncilVerificationError(rpc.error.message, 500, 'council_verification_write_failed')

  const data = (rpc.data && typeof rpc.data === 'object' ? rpc.data : {}) as any
  return {
    ok: true,
    sessionId: input.sessionId,
    problemClass,
    sourceClass: input.sourceClass,
    verifiedRoles: Number(data.verified_roles || 0),
    supportedRoles: Number(data.supported_roles || 0),
    refutedRoles: Number(data.refuted_roles || 0),
    alreadyVerified: Boolean(data.already_verified),
  }
}
