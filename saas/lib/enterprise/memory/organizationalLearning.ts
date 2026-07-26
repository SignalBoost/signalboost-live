// saas/lib/enterprise/memory/organizationalLearning.ts
// Organizational learning derived only from completed closed-loop verification outcomes.
// Inconclusive outcomes never change repair effectiveness or confidence.

import type { ClosedLoopVerificationResult } from './closedLoopVerification.ts'
import type { EnterpriseRepairPlan, RepairPlanStep } from './repairPlanning.ts'

export type RepairLearningSample = Readonly<{
  sampleId: string
  organizationId: string
  targetEventId: string
  strategyKey: string
  systems: readonly RepairPlanStep['system'][]
  outcome: 'success' | 'failure'
  confidence: number
  recordedAt: string
}>

export type RepairStrategyLearning = Readonly<{
  strategyKey: string
  systems: readonly RepairPlanStep['system'][]
  verifiedAttempts: number
  successes: number
  failures: number
  successRate: number
  averageVerificationConfidence: number
  recommendationConfidence: number
  sampleIds: readonly string[]
}>

export type OrganizationalRepairLearning = Readonly<{
  organizationId: string
  acceptedSamples: readonly RepairLearningSample[]
  ignoredOutcomeCount: number
  strategies: readonly RepairStrategyLearning[]
}>

export type VerifiedRepairOutcome = Readonly<{
  sampleId: string
  plan: EnterpriseRepairPlan
  verification: ClosedLoopVerificationResult
  recordedAt: string
}>

function clamp01(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(1, Math.max(0, numeric))
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function timestamp(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid organizational learning timestamp: ${value}`)
  return parsed
}

function systemsFor(plan: EnterpriseRepairPlan): readonly RepairPlanStep['system'][] {
  return Object.freeze([...new Set(plan.steps.map(step => step.system))].sort())
}

function strategyKeyFor(plan: EnterpriseRepairPlan): string {
  return plan.steps
    .map(step => `${step.system}:${step.risk}:${step.verification.join('|')}`)
    .join('>')
}

export function learnFromVerifiedRepairOutcomes(
  organizationId: string,
  outcomes: readonly VerifiedRepairOutcome[],
): OrganizationalRepairLearning {
  if (!organizationId.trim()) throw new Error('Organizational learning requires organizationId.')

  const acceptedById = new Map<string, RepairLearningSample>()
  let ignoredOutcomeCount = 0

  for (const outcome of outcomes) {
    if (!outcome.sampleId.trim()) throw new Error('Organizational learning outcomes require sampleId.')
    timestamp(outcome.recordedAt)

    const { plan, verification } = outcome
    const validRelationship = plan.organizationId === organizationId
      && verification.organizationId === organizationId
      && plan.targetEventId === verification.targetEventId
      && plan.status === 'proposed'
      && plan.steps.length > 0

    if (!validRelationship || verification.status === 'inconclusive') {
      ignoredOutcomeCount += 1
      continue
    }

    const sample: RepairLearningSample = Object.freeze({
      sampleId: outcome.sampleId,
      organizationId,
      targetEventId: plan.targetEventId,
      strategyKey: strategyKeyFor(plan),
      systems: systemsFor(plan),
      outcome: verification.status === 'verified' ? 'success' : 'failure',
      confidence: round(clamp01(verification.confidence)),
      recordedAt: new Date(timestamp(outcome.recordedAt)).toISOString(),
    })

    const existing = acceptedById.get(sample.sampleId)
    if (!existing || timestamp(sample.recordedAt) > timestamp(existing.recordedAt)) {
      acceptedById.set(sample.sampleId, sample)
    }
  }

  const acceptedSamples = [...acceptedById.values()]
    .sort((a, b) => timestamp(a.recordedAt) - timestamp(b.recordedAt) || a.sampleId.localeCompare(b.sampleId))

  const grouped = new Map<string, RepairLearningSample[]>()
  for (const sample of acceptedSamples) {
    grouped.set(sample.strategyKey, [...(grouped.get(sample.strategyKey) || []), sample])
  }

  const strategies = [...grouped.entries()].map(([strategyKey, samples]): RepairStrategyLearning => {
    const successes = samples.filter(sample => sample.outcome === 'success').length
    const failures = samples.length - successes
    const successRate = successes / samples.length
    const averageVerificationConfidence = samples.reduce((sum, sample) => sum + sample.confidence, 0) / samples.length
    // Bayesian smoothing prevents one successful sample from becoming certain organizational knowledge.
    const recommendationConfidence = ((successes + 1) / (samples.length + 2)) * averageVerificationConfidence

    return Object.freeze({
      strategyKey,
      systems: Object.freeze([...samples[0].systems]),
      verifiedAttempts: samples.length,
      successes,
      failures,
      successRate: round(successRate),
      averageVerificationConfidence: round(averageVerificationConfidence),
      recommendationConfidence: round(recommendationConfidence),
      sampleIds: Object.freeze(samples.map(sample => sample.sampleId).sort()),
    })
  }).sort((a, b) => b.recommendationConfidence - a.recommendationConfidence || a.strategyKey.localeCompare(b.strategyKey))

  return Object.freeze({
    organizationId,
    acceptedSamples: Object.freeze(acceptedSamples),
    ignoredOutcomeCount,
    strategies: Object.freeze(strategies),
  })
}
