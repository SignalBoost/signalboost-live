// saas/lib/enterprise/memory/playbookIntelligence.ts
// Versioned operational playbooks derived only from verified organizational repair learning.
// This module ranks proven strategies; it never executes repairs or promotes unverified plans.

import type { OrganizationalRepairLearning, RepairStrategyLearning } from './organizationalLearning.ts'
import type { RepairPlanStep } from './repairPlanning.ts'

export type PlaybookStatus = 'candidate' | 'recommended' | 'trusted' | 'deprecated'

export type EnterprisePlaybookVersion = Readonly<{
  playbookId: string
  organizationId: string
  incidentClass: string
  strategyFingerprint: string
  strategyKey: string
  systems: readonly RepairPlanStep['system'][]
  version: number
  status: PlaybookStatus
  verifiedAttempts: number
  successes: number
  failures: number
  successRate: number
  confidence: number
  sampleIds: readonly string[]
  createdAt: string
}>

export type EnterprisePlaybookRegistry = Readonly<{
  organizationId: string
  incidentClass: string
  versions: readonly EnterprisePlaybookVersion[]
  current: readonly EnterprisePlaybookVersion[]
}>

export type PlaybookPromotionPolicy = Readonly<{
  recommendedSuccesses: number
  trustedSuccesses: number
  trustedSuccessRate: number
  deprecateMinimumAttempts: number
  deprecateBelowSuccessRate: number
}>

const DEFAULT_POLICY: PlaybookPromotionPolicy = Object.freeze({
  recommendedSuccesses: 5,
  trustedSuccesses: 20,
  trustedSuccessRate: 0.95,
  deprecateMinimumAttempts: 5,
  deprecateBelowSuccessRate: 0.5,
})

const STATUS_RANK: Readonly<Record<PlaybookStatus, number>> = Object.freeze({
  trusted: 4,
  recommended: 3,
  candidate: 2,
  deprecated: 1,
})

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function validatePolicy(policy: PlaybookPromotionPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid playbook policy value: ${name}`)
  }
  if (!Number.isSafeInteger(policy.recommendedSuccesses) || !Number.isSafeInteger(policy.trustedSuccesses)
    || !Number.isSafeInteger(policy.deprecateMinimumAttempts)) {
    throw new Error('Playbook count thresholds must be integers.')
  }
  if (policy.trustedSuccessRate > 1 || policy.deprecateBelowSuccessRate > 1) {
    throw new Error('Playbook success-rate thresholds must be from 0 to 1.')
  }
  if (policy.trustedSuccesses < policy.recommendedSuccesses) {
    throw new Error('Trusted success threshold cannot be lower than recommended threshold.')
  }
}

// Stable FNV-1a fingerprint keeps strategy identity deterministic without runtime-specific crypto APIs.
export function fingerprintRepairStrategy(strategyKey: string): string {
  if (!strategyKey.trim()) throw new Error('Playbook strategyKey is required.')
  let hash = 0x811c9dc5
  for (let index = 0; index < strategyKey.length; index += 1) {
    hash ^= strategyKey.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `pb-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function statusFor(strategy: RepairStrategyLearning, policy: PlaybookPromotionPolicy): PlaybookStatus {
  if (strategy.verifiedAttempts >= policy.deprecateMinimumAttempts
    && strategy.successRate < policy.deprecateBelowSuccessRate) return 'deprecated'
  if (strategy.successes >= policy.trustedSuccesses
    && strategy.successRate >= policy.trustedSuccessRate) return 'trusted'
  if (strategy.successes >= policy.recommendedSuccesses) return 'recommended'
  return 'candidate'
}

function sameMetrics(left: EnterprisePlaybookVersion, strategy: RepairStrategyLearning, status: PlaybookStatus): boolean {
  return left.status === status
    && left.verifiedAttempts === strategy.verifiedAttempts
    && left.successes === strategy.successes
    && left.failures === strategy.failures
    && left.successRate === strategy.successRate
    && left.confidence === strategy.recommendationConfidence
    && JSON.stringify(left.sampleIds) === JSON.stringify([...strategy.sampleIds].sort())
}

export function buildEnterprisePlaybookRegistry(
  organizationId: string,
  incidentClass: string,
  learning: OrganizationalRepairLearning,
  existingVersions: readonly EnterprisePlaybookVersion[] = [],
  options: { policy?: Partial<PlaybookPromotionPolicy>; createdAt?: string } = {},
): EnterprisePlaybookRegistry {
  if (!organizationId.trim()) throw new Error('Playbook registry requires organizationId.')
  if (!incidentClass.trim()) throw new Error('Playbook registry requires incidentClass.')
  if (learning.organizationId !== organizationId) throw new Error('Playbook learning organization mismatch.')

  const policy = Object.freeze({ ...DEFAULT_POLICY, ...options.policy })
  validatePolicy(policy)
  const createdAtMs = Date.parse(options.createdAt || new Date().toISOString())
  if (!Number.isFinite(createdAtMs)) throw new Error('Invalid playbook createdAt timestamp.')
  const createdAt = new Date(createdAtMs).toISOString()

  const scopedExisting = existingVersions
    .filter(item => item.organizationId === organizationId && item.incidentClass === incidentClass)
    .sort((a, b) => a.strategyFingerprint.localeCompare(b.strategyFingerprint) || a.version - b.version)
  const versions = [...scopedExisting]

  for (const strategy of learning.strategies) {
    const strategyFingerprint = fingerprintRepairStrategy(strategy.strategyKey)
    const prior = scopedExisting
      .filter(item => item.strategyFingerprint === strategyFingerprint)
      .sort((a, b) => b.version - a.version)[0]
    const status = statusFor(strategy, policy)
    if (prior && sameMetrics(prior, strategy, status)) continue

    const version = (prior?.version || 0) + 1
    versions.push(Object.freeze({
      playbookId: `${organizationId}:${incidentClass}:${strategyFingerprint}:v${version}`,
      organizationId,
      incidentClass,
      strategyFingerprint,
      strategyKey: strategy.strategyKey,
      systems: Object.freeze([...strategy.systems]),
      version,
      status,
      verifiedAttempts: strategy.verifiedAttempts,
      successes: strategy.successes,
      failures: strategy.failures,
      successRate: round(strategy.successRate),
      confidence: round(strategy.recommendationConfidence),
      sampleIds: Object.freeze([...strategy.sampleIds].sort()),
      createdAt,
    }))
  }

  const latestByFingerprint = new Map<string, EnterprisePlaybookVersion>()
  for (const version of versions) {
    const current = latestByFingerprint.get(version.strategyFingerprint)
    if (!current || version.version > current.version) latestByFingerprint.set(version.strategyFingerprint, version)
  }
  const current = [...latestByFingerprint.values()].sort((a, b) =>
    STATUS_RANK[b.status] - STATUS_RANK[a.status]
    || b.confidence - a.confidence
    || b.successRate - a.successRate
    || b.verifiedAttempts - a.verifiedAttempts
    || a.strategyFingerprint.localeCompare(b.strategyFingerprint))

  return Object.freeze({
    organizationId,
    incidentClass,
    versions: Object.freeze(versions.sort((a, b) => a.strategyFingerprint.localeCompare(b.strategyFingerprint) || a.version - b.version)),
    current: Object.freeze(current),
  })
}

export function retrieveEnterprisePlaybooks(
  registry: EnterprisePlaybookRegistry,
  options: { systems?: readonly RepairPlanStep['system'][]; includeDeprecated?: boolean; limit?: number } = {},
): readonly EnterprisePlaybookVersion[] {
  const limit = options.limit ?? 5
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('Playbook retrieval limit must be an integer from 1 to 50.')
  const systems = new Set(options.systems || [])
  return Object.freeze(registry.current
    .filter(item => options.includeDeprecated || item.status !== 'deprecated')
    .filter(item => !systems.size || [...systems].every(system => item.systems.includes(system)))
    .slice(0, limit))
}
