// saas/lib/ai/cos/cosUniversityFrontierDistillation.ts
//
// Frontier-grade adaptive distillation policy for COS University.
//
// This module does not grant training, spend, promotion, or Production authority. It only produces
// a deterministic training recipe that existing governed dispatch/evaluation paths may consume.

export const COS_UNIVERSITY_FRONTIER_DISTILLATION_PROFILE =
  'cos-university-frontier-adaptive-distillation-v1' as const

export type FrontierDistillationOptimizer =
  | 'gkd_on_policy'
  | 'legacy_bootstrap_sft'

export type FrontierDistillationPlan = Readonly<{
  profile: typeof COS_UNIVERSITY_FRONTIER_DISTILLATION_PROFILE
  optimizer: FrontierDistillationOptimizer
  sourceSupervision: 'frontier_faculty_plus_dense_teacher' | 'dense_teacher_only'
  studentModelId: string
  denseTeacherModelId: string
  denseTeacherRevision: string
  denseTeacherLicense: string
  frontierFaculty: readonly string[]
  onPolicyFraction: number
  offPolicyAnchorFraction: number
  beta: number
  temperature: number
  maxNewTokens: number
  tokenizerCompatibilityRequired: true
  studentGeneratedRolloutsRequired: true
  independentEvaluationRequired: true
  baselineComparisonRequired: true
  failureDerivedRemediationRequired: true
  safetyRegressionRequired: true
  unseenTransferRequired: true
  delayedRetentionRequired: true
  exactArtifactCanaryRequired: true
  rollbackProofRequired: true
  automaticPromotionAuthorized: false
  authorityExpanded: false
}>

type Env = Record<string, string | undefined>

const MODEL = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/
const REVISION = /^[a-f0-9]{40}$/i

function clean(value: unknown, max = 240): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function boundedFloat(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.floor(parsed)))
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map(value => clean(value, 80)).filter(Boolean))])
}

/**
 * Build the default mass-distillation training plan.
 *
 * High on-policy GKD is the primary optimizer. A bounded off-policy fraction remains only as an
 * anchor so frontier-faculty examples can seed behavior the student does not yet visit by itself.
 * Independent University evaluation, not the planner, decides whether the resulting artifact wins.
 */
export function buildFrontierDistillationPlan(input: {
  studentModelId: string
  denseTeacherModelId: string
  denseTeacherRevision: string
  denseTeacherLicense: string
  frontierFaculty?: readonly string[]
  env?: Env
}): FrontierDistillationPlan {
  const env = input.env || process.env
  const studentModelId = clean(input.studentModelId)
  const denseTeacherModelId = clean(input.denseTeacherModelId)
  const denseTeacherRevision = clean(input.denseTeacherRevision, 40).toLowerCase()
  const denseTeacherLicense = clean(input.denseTeacherLicense, 80).toLowerCase()
  if (!MODEL.test(studentModelId) || !MODEL.test(denseTeacherModelId)) {
    throw new Error('frontier_distillation_model_id_invalid')
  }
  if (studentModelId === denseTeacherModelId) {
    throw new Error('frontier_distillation_teacher_student_identity_invalid')
  }
  if (!REVISION.test(denseTeacherRevision)) {
    throw new Error('frontier_distillation_teacher_revision_invalid')
  }
  if (denseTeacherLicense !== 'apache-2.0') {
    throw new Error('frontier_distillation_teacher_rights_invalid')
  }

  // GKD literature and TRL both support mixing on-policy student generations with a smaller
  // off-policy anchor fraction. Keep on-policy dominant; evaluation may later tune this empirically.
  // Stable Production distillation is fully on-policy. The frontier faculty still provides
  // curriculum/critique supervision, but the paid optimizer must not depend on the experimental
  // mixed-rollout GKD surface. A future off-policy anchor can be reintroduced only after its own
  // independently validated executor exists.
  const onPolicyFraction = 1.0
  const beta = boundedFloat(env.COS_UNIVERSITY_GKD_BETA, 0.50, 0.00, 1.00)
  const temperature = boundedFloat(env.COS_UNIVERSITY_GKD_TEMPERATURE, 0.80, 0.10, 1.50)
  const maxNewTokens = boundedInt(env.COS_UNIVERSITY_GKD_MAX_NEW_TOKENS, 256, 64, 512)
  const frontierFaculty = unique(input.frontierFaculty || [])

  return Object.freeze({
    profile: COS_UNIVERSITY_FRONTIER_DISTILLATION_PROFILE,
    optimizer: 'gkd_on_policy',
    sourceSupervision: frontierFaculty.length > 0
      ? 'frontier_faculty_plus_dense_teacher'
      : 'dense_teacher_only',
    studentModelId,
    denseTeacherModelId,
    denseTeacherRevision,
    denseTeacherLicense,
    frontierFaculty,
    onPolicyFraction,
    offPolicyAnchorFraction: Number((1 - onPolicyFraction).toFixed(6)),
    beta,
    temperature,
    maxNewTokens,
    tokenizerCompatibilityRequired: true,
    studentGeneratedRolloutsRequired: true,
    independentEvaluationRequired: true,
    baselineComparisonRequired: true,
    failureDerivedRemediationRequired: true,
    safetyRegressionRequired: true,
    unseenTransferRequired: true,
    delayedRetentionRequired: true,
    exactArtifactCanaryRequired: true,
    rollbackProofRequired: true,
    automaticPromotionAuthorized: false,
    authorityExpanded: false,
  })
}

/**
 * Legacy/one-time distillation jobs that have not yet been migrated may explicitly ask for bootstrap
 * SFT. Mass distillation must send a frontier plan and therefore never silently lands here.
 */
export function legacyBootstrapPlan(input: {
  studentModelId: string
  denseTeacherModelId: string
  denseTeacherRevision: string
  denseTeacherLicense: string
}): FrontierDistillationPlan {
  const plan = buildFrontierDistillationPlan(input)
  return Object.freeze({
    ...plan,
    optimizer: 'legacy_bootstrap_sft',
    onPolicyFraction: 0,
    offPolicyAnchorFraction: 1,
  })
}
