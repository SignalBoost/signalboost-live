// Deterministic closed-loop verification for approved Enterprise repair plans.
// This module evaluates fresh observations; it never executes repairs or closes incidents directly.

import type { EnterpriseRepairPlan, RepairPlanStep } from './repairPlanning'

export type VerificationObservation = Readonly<{
  observationId: string
  check: string
  status: 'passed' | 'failed'
  observedAt: string
  confidence: number
  evidenceEventIds?: readonly string[]
}>

export type VerificationCheckResult = Readonly<{
  check: string
  status: 'verified' | 'failed' | 'missing'
  confidence: number
  observationId: string | null
  evidenceEventIds: readonly string[]
}>

export type ClosedLoopVerificationResult = Readonly<{
  organizationId: string
  targetEventId: string
  status: 'verified' | 'failed' | 'inconclusive'
  confidence: number
  checks: readonly VerificationCheckResult[]
  verifiedChecks: readonly string[]
  failedChecks: readonly string[]
  missingChecks: readonly string[]
  recommendation: 'request_incident_closure_approval' | 'keep_incident_open' | 'collect_more_evidence'
  unknowns: readonly string[]
}>

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function validTimestamp(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid verification observation timestamp: ${value}`)
  return parsed
}

function requiredChecks(plan: EnterpriseRepairPlan): readonly string[] {
  return Object.freeze([...new Set(plan.steps.flatMap((step: RepairPlanStep) => step.verification))].sort())
}

export function verifyEnterpriseRepairOutcome(
  plan: EnterpriseRepairPlan,
  observations: readonly VerificationObservation[],
  options: { minimumConfidence?: number } = {},
): ClosedLoopVerificationResult {
  const minimumConfidence = options.minimumConfidence ?? 0.6
  if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
    throw new Error('Verification minimumConfidence must be from 0 to 1.')
  }

  const checks = requiredChecks(plan)
  if (plan.status !== 'proposed' || !checks.length) {
    return Object.freeze({
      organizationId: plan.organizationId,
      targetEventId: plan.targetEventId,
      status: 'inconclusive',
      confidence: 0,
      checks: Object.freeze([]),
      verifiedChecks: Object.freeze([]),
      failedChecks: Object.freeze([]),
      missingChecks: Object.freeze([...checks]),
      recommendation: 'collect_more_evidence',
      unknowns: Object.freeze(['No proposed repair plan with verification requirements was available.']),
    })
  }

  const latestByCheck = new Map<string, VerificationObservation>()
  for (const observation of observations) {
    if (!observation.observationId.trim() || !observation.check.trim()) {
      throw new Error('Verification observations require observationId and check.')
    }
    const observedAt = validTimestamp(observation.observedAt)
    const current = latestByCheck.get(observation.check)
    if (!current || observedAt > validTimestamp(current.observedAt)
      || (observedAt === validTimestamp(current.observedAt) && observation.observationId.localeCompare(current.observationId) > 0)) {
      latestByCheck.set(observation.check, observation)
    }
  }

  const results = checks.map((check): VerificationCheckResult => {
    const observation = latestByCheck.get(check)
    if (!observation) {
      return Object.freeze({ check, status: 'missing', confidence: 0, observationId: null, evidenceEventIds: Object.freeze([]) })
    }
    const confidence = clamp01(observation.confidence)
    const status = observation.status === 'passed' && confidence >= minimumConfidence ? 'verified' : 'failed'
    return Object.freeze({
      check,
      status,
      confidence: Math.round(confidence * 1000) / 1000,
      observationId: observation.observationId,
      evidenceEventIds: Object.freeze([...new Set(observation.evidenceEventIds || [])].sort()),
    })
  })

  const verifiedChecks = results.filter(item => item.status === 'verified').map(item => item.check)
  const failedChecks = results.filter(item => item.status === 'failed').map(item => item.check)
  const missingChecks = results.filter(item => item.status === 'missing').map(item => item.check)
  const status = failedChecks.length ? 'failed' : missingChecks.length ? 'inconclusive' : 'verified'
  const confidence = Math.round((results.reduce((sum, item) => sum + item.confidence, 0) / results.length) * 1000) / 1000

  return Object.freeze({
    organizationId: plan.organizationId,
    targetEventId: plan.targetEventId,
    status,
    confidence,
    checks: Object.freeze(results),
    verifiedChecks: Object.freeze(verifiedChecks),
    failedChecks: Object.freeze(failedChecks),
    missingChecks: Object.freeze(missingChecks),
    recommendation: status === 'verified'
      ? 'request_incident_closure_approval'
      : status === 'failed' ? 'keep_incident_open' : 'collect_more_evidence',
    unknowns: Object.freeze(status === 'verified'
      ? ['Incident closure still requires the existing approval process.']
      : status === 'failed'
        ? ['The repair outcome contradicted at least one required verification check.']
        : ['Required fresh evidence has not yet been observed.']),
  })
}
