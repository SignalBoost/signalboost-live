import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export type MetacognitiveRegion = 'strong' | 'developing' | 'weak' | 'untested' | 'conflicted'

export type SkillSelectionEvidence = {
  status: 'validated' | 'learned' | 'mastered'
  similarity: number
  productionAttempts: number
  productionSuccesses: number
  retentionAttempts: number
  retentionSuccesses: number
  failureCount: number
  dependencyHealthy: boolean
}

export type SkillSelectionAssessment = {
  eligible: boolean
  evidenceReliability: number
  selectionScore: number
  reasons: string[]
}

export type CapabilityEvidence = {
  strongSkills: number
  weakenedSkills: number
  quarantinedSkills: number
  unresolvedGaps: number
  productionAttempts: number
  productionSuccesses: number
  retentionAttempts: number
  retentionSuccesses: number
  failureCount: number
}

export type CapabilityAssessment = CapabilityEvidence & {
  region: MetacognitiveRegion
  reliability: number
  reasons: string[]
}

function bounded(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function rate(successes: number, attempts: number): number | null {
  const a = bounded(attempts)
  if (!a) return null
  return Math.max(0, Math.min(1, bounded(successes) / a))
}

/**
 * Rank procedural skills by more than semantic similarity. Historical verified outcomes and delayed
 * retention can raise or lower preference, but they never turn an unhealthy dependency tree into an
 * eligible skill and never modify live answer confidence.
 */
export function assessSkillSelection(evidence: SkillSelectionEvidence): SkillSelectionAssessment {
  const similarity = Math.max(0, Math.min(1, Number(evidence.similarity) || 0))
  const reasons: string[] = []
  if (!evidence.dependencyHealthy) {
    return { eligible: false, evidenceReliability: 0, selectionScore: 0, reasons: ['A required composite-skill dependency is no longer strong.'] }
  }

  const productionRate = rate(evidence.productionSuccesses, evidence.productionAttempts)
  const retentionRate = rate(evidence.retentionSuccesses, evidence.retentionAttempts)
  const statusBase = evidence.status === 'mastered' ? 0.94 : evidence.status === 'learned' ? 0.88 : 0.80
  let reliability = statusBase
  let evidenceWeight = 0

  if (productionRate !== null) {
    reliability += (productionRate - 0.8) * 0.18
    evidenceWeight += Math.min(1, bounded(evidence.productionAttempts) / 10)
    reasons.push(`production ${(productionRate * 100).toFixed(0)}% across ${Math.floor(bounded(evidence.productionAttempts))} verified outcomes`)
  }
  if (retentionRate !== null) {
    reliability += (retentionRate - 0.8) * 0.12
    evidenceWeight += Math.min(1, bounded(evidence.retentionAttempts) / 5)
    reasons.push(`retention ${(retentionRate * 100).toFixed(0)}% across ${Math.floor(bounded(evidence.retentionAttempts))} delayed checks`)
  }

  const failurePenalty = Math.min(0.18, Math.log2(1 + bounded(evidence.failureCount)) * 0.035)
  reliability -= failurePenalty
  reliability = Math.max(0.35, Math.min(0.99, reliability))

  const historicalInfluence = Math.min(0.22, 0.10 + evidenceWeight * 0.06)
  const selectionScore = Math.max(0, Math.min(1, similarity * (1 - historicalInfluence) + reliability * historicalInfluence))
  if (!reasons.length) reasons.push('No production/retention history yet; selection relies primarily on held-out validation and semantic relevance.')
  if (failurePenalty > 0) reasons.push(`failure history penalty ${(failurePenalty * 100).toFixed(1)} points`)

  return { eligible: true, evidenceReliability: reliability, selectionScore, reasons }
}

/** Capability-map state is workload-relative evidence, not a confidence score. */
export function assessCapabilityRegion(evidence: CapabilityEvidence): CapabilityAssessment {
  const productionRate = rate(evidence.productionSuccesses, evidence.productionAttempts)
  const retentionRate = rate(evidence.retentionSuccesses, evidence.retentionAttempts)
  const reasons: string[] = []

  let region: MetacognitiveRegion
  if (evidence.quarantinedSkills > 0 && evidence.strongSkills > 0) {
    region = 'conflicted'
    reasons.push('Strong and quarantined procedures coexist in this capability region.')
  } else if (evidence.quarantinedSkills > 0 || evidence.weakenedSkills > 0) {
    region = 'weak'
    reasons.push('Previously useful procedures weakened or were quarantined.')
  } else if (evidence.strongSkills === 0 && evidence.unresolvedGaps === 0) {
    region = 'untested'
    reasons.push('No validated procedural evidence and no observed unresolved gap yet.')
  } else if (evidence.strongSkills === 0) {
    region = 'weak'
    reasons.push('Observed unresolved gaps exist without a validated procedural skill.')
  } else if (evidence.unresolvedGaps > 0) {
    region = 'developing'
    reasons.push('Validated capability exists, but unresolved gaps remain in the same problem class.')
  } else if ((productionRate !== null && productionRate < 0.8) || (retentionRate !== null && retentionRate < 0.8)) {
    region = 'developing'
    reasons.push('Validated capability exists but real-world or delayed-retention outcomes are not yet consistently strong.')
  } else {
    region = 'strong'
    reasons.push('Validated procedural capability exists without current contradictory/weakening evidence.')
  }

  const outcomeRates = [productionRate, retentionRate].filter((value): value is number => value !== null)
  const outcomeMean = outcomeRates.length ? outcomeRates.reduce((sum, value) => sum + value, 0) / outcomeRates.length : 0.8
  const base = evidence.strongSkills > 0 ? 0.75 : 0.35
  const penalties = Math.min(0.45, evidence.unresolvedGaps * 0.04 + evidence.weakenedSkills * 0.10 + evidence.quarantinedSkills * 0.20)
  const reliability = Math.max(0.05, Math.min(0.99, base + (outcomeMean - 0.8) * 0.25 - penalties))

  return { ...evidence, region, reliability, reasons }
}

function capabilityKey(value: unknown): string {
  const normalized = String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180)
  return normalized || 'general-reasoning'
}

function skillProblemClass(row: any): string {
  const procedure = row?.procedure && typeof row.procedure === 'object' ? row.procedure : {}
  return String(procedure.problemClass || row?.subject || 'general reasoning')
}

/**
 * Deterministically rebuild the durable capability map from current skills and unresolved learning
 * gaps. No model call is required; this is metacognitive bookkeeping over existing evidence.
 */
export async function refreshMetacognitiveCapabilityMap(): Promise<{ refreshed: number; regions: Record<MetacognitiveRegion, number> }> {
  const db = cosServiceDb()
  const regions: Record<MetacognitiveRegion, number> = { strong: 0, developing: 0, weak: 0, untested: 0, conflicted: 0 }
  if (!db) return { refreshed: 0, regions }

  const [skillsResult, gapsResult] = await Promise.all([
    db.from('cos_cognitive_skills').select('subject,procedure,status,production_attempts,production_successes,retention_attempts,retention_successes,failure_count'),
    db.from('cos_learning_gaps').select('capability,subject,status').in('status', ['pending', 'learning', 'failed']),
  ])
  if (skillsResult.error) throw skillsResult.error
  if (gapsResult.error) throw gapsResult.error

  const buckets = new Map<string, { label: string; evidence: CapabilityEvidence }>()
  const ensure = (raw: unknown) => {
    const key = capabilityKey(raw)
    if (!buckets.has(key)) buckets.set(key, { label: String(raw ?? key).slice(0, 300), evidence: { strongSkills: 0, weakenedSkills: 0, quarantinedSkills: 0, unresolvedGaps: 0, productionAttempts: 0, productionSuccesses: 0, retentionAttempts: 0, retentionSuccesses: 0, failureCount: 0 } })
    return buckets.get(key)!
  }

  for (const row of skillsResult.data ?? []) {
    const bucket = ensure(skillProblemClass(row))
    const status = String((row as any).status)
    if (status === 'validated' || status === 'learned' || status === 'mastered') bucket.evidence.strongSkills += 1
    if (status === 'weakened') bucket.evidence.weakenedSkills += 1
    if (status === 'quarantined') bucket.evidence.quarantinedSkills += 1
    bucket.evidence.productionAttempts += Number((row as any).production_attempts || 0)
    bucket.evidence.productionSuccesses += Number((row as any).production_successes || 0)
    bucket.evidence.retentionAttempts += Number((row as any).retention_attempts || 0)
    bucket.evidence.retentionSuccesses += Number((row as any).retention_successes || 0)
    bucket.evidence.failureCount += Number((row as any).failure_count || 0)
  }
  for (const row of gapsResult.data ?? []) {
    const bucket = ensure((row as any).subject || (row as any).capability)
    bucket.evidence.unresolvedGaps += 1
  }

  const now = new Date().toISOString()
  for (const [key, bucket] of buckets.entries()) {
    const assessment = assessCapabilityRegion(bucket.evidence)
    regions[assessment.region] += 1
    const write = await db.from('cos_metacognitive_capabilities').upsert({
      capability_key: key,
      label: bucket.label,
      region: assessment.region,
      reliability: assessment.reliability,
      evidence: assessment,
      last_assessed_at: now,
      updated_at: now,
    }, { onConflict: 'capability_key' })
    if (write.error) throw write.error
  }
  return { refreshed: buckets.size, regions }
}
