import { createHash } from 'node:crypto'

export const HYBRID_DISTILLATION_PROFILE = 'cos-university-hybrid-distillation-v1' as const
export const HYBRID_REAL_SOURCE_TARGET = 0.50
export const HYBRID_FAILURE_DERIVED_TARGET = 0.30
export const HYBRID_TEACHER_SYNTHETIC_TARGET = 0.20

export type HybridDistillationOrigin = 'real_source' | 'failure_derived' | 'teacher_synthetic'
export type FailureDerivedRemediationGate = 'holdout_improvement' | 'safety' | 'unseen_transfer' | 'delayed_retention'

export type HybridDistillationMix = Readonly<{
  total: number
  realSource: number
  failureDerived: number
  teacherSynthetic: number
}>

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function safeCount(value: unknown): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function planHybridDistillationMix(input: {
  batchSize: number
  realSourceAvailable: number
  failureDerivedAvailable: number
}): HybridDistillationMix {
  const total = Math.max(1, safeCount(input.batchSize))
  const realAvailable = safeCount(input.realSourceAvailable)
  const failureAvailable = safeCount(input.failureDerivedAvailable)

  const realTarget = Math.round(total * HYBRID_REAL_SOURCE_TARGET)
  const failureTarget = Math.round(total * HYBRID_FAILURE_DERIVED_TARGET)

  const realSource = Math.min(realAvailable, realTarget)
  const failureDerived = Math.min(failureAvailable, failureTarget)
  let teacherSynthetic = Math.max(0, total - realSource - failureDerived)

  const remainingReal = Math.max(0, realAvailable - realSource)
  const takeReal = Math.min(teacherSynthetic, remainingReal)
  const adjustedReal = realSource + takeReal
  teacherSynthetic -= takeReal

  const remainingFailure = Math.max(0, failureAvailable - failureDerived)
  const takeFailure = Math.min(teacherSynthetic, remainingFailure)
  const adjustedFailure = failureDerived + takeFailure
  teacherSynthetic -= takeFailure

  return Object.freeze({ total, realSource: adjustedReal, failureDerived: adjustedFailure, teacherSynthetic })
}

export function failureDerivedSourceHash(subjectId: string, ordinal: number, remediationKey?: string): string {
  const identity: Record<string, unknown> = {
    profile: HYBRID_DISTILLATION_PROFILE,
    origin: 'failure_derived',
    subjectId,
    ordinal,
  }
  if (remediationKey) identity.remediationKey = remediationKey
  return hash(identity)
}

export function failedEvaluationRemediationGates(input: {
  holdoutImproved: unknown
  safetyPassed: unknown
  unseenTransferPassed: unknown
  delayedRetentionPassed: unknown
}): readonly FailureDerivedRemediationGate[] {
  const gates: FailureDerivedRemediationGate[] = []
  if (input.holdoutImproved !== true) gates.push('holdout_improvement')
  if (input.safetyPassed !== true) gates.push('safety')
  if (input.unseenTransferPassed !== true) gates.push('unseen_transfer')
  if (input.delayedRetentionPassed !== true) gates.push('delayed_retention')
  return Object.freeze(gates)
}

export function failureDerivedRemediationPrinciples(
  gates: readonly FailureDerivedRemediationGate[],
): readonly string[] {
  const principles: string[] = []
  const add = (value: string) => {
    if (!principles.includes(value)) principles.push(value)
  }

  if (gates.includes('holdout_improvement')) {
    add('Solve the underlying task correctly rather than matching surface wording; preserve concise, checkable final answers and do not memorize private evaluation material.')
  }
  if (gates.includes('safety')) {
    add('Preserve explicit authorization boundaries: urgency, deadlines, seniority, convenience, or available capacity never expand spend, destructive-action, data-access, deployment, or Production-traffic authority.')
    add('Separate observation from causal attribution: when multiple explanations remain plausible, identify discriminating evidence, state uncertainty, and do not assert a cause before the evidence supports it.')
    add('Treat secrets as exposed if any copy remains in logs, URLs, headers, traces, or derived material; remove all copies and rotate or revoke the credential when exposure occurred.')
  }
  if (gates.includes('unseen_transfer')) {
    add('Generalize from first principles to novel variants: preserve the governing rule when names, numbers, ordering, or surface context changes, and state uncertainty instead of inventing missing facts.')
  }
  if (gates.includes('delayed_retention')) {
    add('Retain the corrected behavior across later contexts: do not trade away prior safety, authorization, calibration, or core subject knowledge while learning a new example.')
  }

  return Object.freeze(principles)
}

export function teacherSyntheticSourceHash(subjectId: string, ordinal: number, generationKey?: string): string {
  const identity: Record<string, unknown> = {
    profile: HYBRID_DISTILLATION_PROFILE,
    origin: 'teacher_synthetic',
    subjectId,
    ordinal,
  }
  if (generationKey) identity.generationKey = generationKey
  return hash(identity)
}

export function teacherSyntheticPrompt(subjectId: string, ordinal: number): Readonly<{ id: string; prompt: string }> {
  const id = teacherSyntheticSourceHash(subjectId, ordinal)
  return Object.freeze({
    id,
    prompt: [
      `Standalone teacher-generated practice case for ${subjectId}.`,
      `Generate one diverse training example number ${ordinal + 1} for this subject.`,
      'Choose a concept or realistic problem within the subject, then produce the final teaching response that a strong expert would want a smaller model to imitate.',
      'The example must be self-contained and must not claim access to current events, private data, hidden exams, production prompts, user memories, or external sources.',
      'Do not invent citations. Do not reveal hidden chain-of-thought. Return only the final teaching response and concise supporting explanation.',
    ].join('\n\n'),
  })
}

export function syntheticOrdinalForHash(subjectId: string, sourceHash: string, maxOrdinal = 128): number | null {
  for (let ordinal = 0; ordinal < maxOrdinal; ordinal += 1) {
    if (teacherSyntheticSourceHash(subjectId, ordinal) === sourceHash) return ordinal
  }
  return null
}


export function failureDerivedOrdinalForHash(subjectId: string, sourceHash: string, maxOrdinal = 128): number | null {
  for (let ordinal = 0; ordinal < maxOrdinal; ordinal += 1) {
    if (failureDerivedSourceHash(subjectId, ordinal) === sourceHash) return ordinal
  }
  return null
}
