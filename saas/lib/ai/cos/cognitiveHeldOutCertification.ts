// saas/lib/ai/cos/cognitiveHeldOutCertification.ts
//
// Item 4 (measure actual independence): the per-skill counters already exist
// (cos_cognitive_skills.holdout_attempts/holdout_successes/distinct_holdout_variants, maintained
// atomically by cos_record_cognitive_practice_result). What was missing is the standing report that
// certifies a skill against the target independent pass rate — not "it passed once" but "it has
// enough independent, non-self-generated evidence to trust". This module is pure and DB-free so it
// stays testable without Supabase; the API route does the one query and calls it.
//
// A holdout row can only exist with generation_source in ('frontier_teacher','curated',
// 'production_replay') — the schema CHECK forbids 'local_generator' holdouts. This module trusts
// that invariant rather than re-deriving it; it only aggregates and thresholds.

export const DEFAULT_TARGET_INDEPENDENT_PASS_RATE = 0.85
export const MIN_HOLDOUT_ATTEMPTS_FOR_CERTIFICATION = 3
export const MIN_DISTINCT_HOLDOUT_VARIANTS_FOR_CERTIFICATION = 2

export type CognitiveSkillLifecycleStatus =
  | 'encountered' | 'evaluated' | 'understood' | 'practiced'
  | 'validated' | 'learned' | 'mastered' | 'weakened' | 'quarantined'

export type SkillHoldoutRow = {
  skillKey: string
  subject: string
  status: CognitiveSkillLifecycleStatus | string
  evaluatorApproved: boolean
  understandingApproved: boolean
  holdoutAttempts: number
  holdoutSuccesses: number
  distinctHoldoutVariants: number
  quarantinedAt: string | null
  lastValidatedAt: string | null
}

export type SkillCertificationReason =
  | 'certified'
  | 'no_holdout_coverage'
  | 'insufficient_holdout_attempts'
  | 'insufficient_distinct_variants'
  | 'below_target_pass_rate'
  | 'quarantined'
  | 'evaluator_not_approved'
  | 'understanding_not_approved'

export type SkillCertification = {
  skillKey: string
  subject: string
  status: string
  holdoutAttempts: number
  holdoutSuccesses: number
  distinctHoldoutVariants: number
  passRate: number
  certified: boolean
  reason: SkillCertificationReason
  lastValidatedAt: string | null
}

export type SubjectCertificationBucket = {
  subject: string
  skills: number
  skillsCertified: number
  holdoutAttempts: number
  holdoutSuccesses: number
  passRate: number
}

export type HeldOutCertificationReport = {
  generatedAt: string
  targetPassRate: number
  minHoldoutAttempts: number
  minDistinctVariants: number
  totalSkills: number
  skillsWithHoldoutCoverage: number
  skillsCertified: number
  overallHoldoutAttempts: number
  overallHoldoutSuccesses: number
  overallPassRate: number
  meetsTarget: boolean
  bySubject: SubjectCertificationBucket[]
  skills: SkillCertification[]
  uncertifiedReasons: Record<SkillCertificationReason, number>
}

function certifySkill(
  row: SkillHoldoutRow,
  targetPassRate: number,
  minAttempts: number,
  minVariants: number,
): SkillCertification {
  const attempts = Math.max(0, Number(row.holdoutAttempts) || 0)
  const successes = Math.max(0, Math.min(attempts, Number(row.holdoutSuccesses) || 0))
  const variants = Math.max(0, Number(row.distinctHoldoutVariants) || 0)
  const passRate = attempts > 0 ? successes / attempts : 0

  let reason: SkillCertificationReason = 'certified'
  if (row.quarantinedAt) reason = 'quarantined'
  else if (!row.evaluatorApproved) reason = 'evaluator_not_approved'
  else if (!row.understandingApproved) reason = 'understanding_not_approved'
  else if (attempts === 0) reason = 'no_holdout_coverage'
  else if (attempts < minAttempts) reason = 'insufficient_holdout_attempts'
  else if (variants < minVariants) reason = 'insufficient_distinct_variants'
  else if (passRate < targetPassRate) reason = 'below_target_pass_rate'

  return {
    skillKey: row.skillKey,
    subject: row.subject,
    status: row.status,
    holdoutAttempts: attempts,
    holdoutSuccesses: successes,
    distinctHoldoutVariants: variants,
    passRate,
    certified: reason === 'certified',
    reason,
    lastValidatedAt: row.lastValidatedAt,
  }
}

/**
 * Pure aggregation over the skills table's existing holdout counters. No network, no randomness —
 * safe to unit test with fixture rows and safe to call from an API route with a real Supabase read.
 */
export function computeHeldOutCertification(
  rows: SkillHoldoutRow[],
  targetPassRate: number = DEFAULT_TARGET_INDEPENDENT_PASS_RATE,
  minAttempts: number = MIN_HOLDOUT_ATTEMPTS_FOR_CERTIFICATION,
  minVariants: number = MIN_DISTINCT_HOLDOUT_VARIANTS_FOR_CERTIFICATION,
): HeldOutCertificationReport {
  const clampedTarget = Math.max(0, Math.min(1, Number(targetPassRate) || DEFAULT_TARGET_INDEPENDENT_PASS_RATE))
  const skills = rows.map((row) => certifySkill(row, clampedTarget, minAttempts, minVariants))

  const overallHoldoutAttempts = skills.reduce((sum, s) => sum + s.holdoutAttempts, 0)
  const overallHoldoutSuccesses = skills.reduce((sum, s) => sum + s.holdoutSuccesses, 0)
  const overallPassRate = overallHoldoutAttempts > 0 ? overallHoldoutSuccesses / overallHoldoutAttempts : 0
  const skillsWithHoldoutCoverage = skills.filter((s) => s.holdoutAttempts > 0).length
  const skillsCertified = skills.filter((s) => s.certified).length

  const subjectMap = new Map<string, SubjectCertificationBucket>()
  for (const s of skills) {
    const bucket = subjectMap.get(s.subject) ?? {
      subject: s.subject, skills: 0, skillsCertified: 0, holdoutAttempts: 0, holdoutSuccesses: 0, passRate: 0,
    }
    bucket.skills += 1
    if (s.certified) bucket.skillsCertified += 1
    bucket.holdoutAttempts += s.holdoutAttempts
    bucket.holdoutSuccesses += s.holdoutSuccesses
    subjectMap.set(s.subject, bucket)
  }
  const bySubject = Array.from(subjectMap.values())
    .map((bucket) => ({ ...bucket, passRate: bucket.holdoutAttempts > 0 ? bucket.holdoutSuccesses / bucket.holdoutAttempts : 0 }))
    .sort((a, b) => a.passRate - b.passRate)

  const uncertifiedReasons: Record<SkillCertificationReason, number> = {
    certified: 0,
    no_holdout_coverage: 0,
    insufficient_holdout_attempts: 0,
    insufficient_distinct_variants: 0,
    below_target_pass_rate: 0,
    quarantined: 0,
    evaluator_not_approved: 0,
    understanding_not_approved: 0,
  }
  for (const s of skills) uncertifiedReasons[s.reason] += 1

  return {
    generatedAt: new Date().toISOString(),
    targetPassRate: clampedTarget,
    minHoldoutAttempts: minAttempts,
    minDistinctVariants: minVariants,
    totalSkills: skills.length,
    skillsWithHoldoutCoverage,
    skillsCertified,
    overallHoldoutAttempts,
    overallHoldoutSuccesses,
    overallPassRate,
    meetsTarget: skills.length > 0 && overallHoldoutAttempts >= minAttempts && overallPassRate >= clampedTarget,
    bySubject,
    skills: skills.sort((a, b) => a.passRate - b.passRate),
    uncertifiedReasons,
  }
}
