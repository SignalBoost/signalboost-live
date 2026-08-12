import { RC_SCHEMA_VERSION, type RcCheckCategory, type RcCheckResult, type RcReadinessInput, type RcReadinessSnapshot } from './types.ts'

const CATEGORIES: readonly RcCheckCategory[] = [
  'deployment',
  'multi_tenant',
  'security',
  'resilience',
  'performance',
  'observability',
  'integration',
  'documentation',
]

function scoreStatus(status: RcCheckResult['status']): number {
  if (status === 'pass') return 1
  if (status === 'warn') return 0.5
  return 0
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested)
  return value
}

function assertValidCheck(check: RcCheckResult, generatedAt: number): void {
  if (!check.checkId.trim()) throw new Error('rc_check_id_required')
  if (!CATEGORIES.includes(check.category)) throw new Error('rc_check_category_invalid')
  if (!check.summary.trim()) throw new Error('rc_check_summary_required')
  if (check.status === 'pass' && check.evidence.length === 0) throw new Error('rc_pass_requires_evidence')
  for (const evidence of check.evidence) {
    if (!evidence.ref.trim()) throw new Error('rc_evidence_ref_required')
    const observedAt = Date.parse(evidence.observedAt)
    if (!Number.isFinite(observedAt)) throw new Error('rc_evidence_timestamp_invalid')
    if (observedAt > generatedAt) throw new Error('rc_evidence_timestamp_after_snapshot')
  }
}

export function evaluateReleaseCandidateReadiness(input: RcReadinessInput): RcReadinessSnapshot {
  if (!input.tenant.tenantId || !input.tenant.environmentId) throw new Error('tenant_required')
  const generatedAt = Date.parse(input.generatedAt)
  if (!Number.isFinite(generatedAt)) throw new Error('rc_generated_at_invalid')

  const ids = new Set<string>()
  for (const check of input.checks) {
    assertValidCheck(check, generatedAt)
    if (ids.has(check.checkId)) throw new Error('duplicate_rc_check_id')
    ids.add(check.checkId)
  }

  const required = input.checks.filter(check => check.required)
  const failedRequiredCheckIds = required.filter(check => check.status === 'fail').map(check => check.checkId).sort()
  const notRunRequiredCheckIds = required.filter(check => check.status === 'not_run').map(check => check.checkId).sort()
  const warningCheckIds = input.checks.filter(check => check.status === 'warn').map(check => check.checkId).sort()
  const passedRequired = required.filter(check => check.status === 'pass').length
  const requiredPassRate = required.length ? passedRequired / required.length : 0

  const categoryScores = Object.fromEntries(CATEGORIES.map(category => {
    const rows = input.checks.filter(check => check.category === category)
    const score = rows.length ? rows.reduce((sum, check) => sum + scoreStatus(check.status), 0) / rows.length : 0
    return [category, score]
  })) as Record<RcCheckCategory, number>

  const score = input.checks.length
    ? input.checks.reduce((sum, check) => sum + scoreStatus(check.status), 0) / input.checks.length
    : 0

  const releaseCandidate = required.length > 0
    && failedRequiredCheckIds.length === 0
    && notRunRequiredCheckIds.length === 0
    && requiredPassRate === 1

  return deepFreeze({
    schemaVersion: RC_SCHEMA_VERSION,
    tenant: { ...input.tenant },
    generatedAt: input.generatedAt,
    releaseCandidate,
    score,
    requiredPassRate,
    failedRequiredCheckIds,
    warningCheckIds,
    notRunRequiredCheckIds,
    categoryScores,
    checks: input.checks.map(check => ({ ...check, evidence: [...check.evidence] })),
  })
}
