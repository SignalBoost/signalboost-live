import { createHash } from 'node:crypto'

export const HYBRID_DISTILLATION_PROFILE = 'cos-university-hybrid-distillation-v1' as const
export const FAILURE_DERIVED_REMEDIATION_PROFILE = 'cos-university-failure-derived-remediation-v2' as const
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


export type FailureDerivedPracticeVariant = Readonly<{
  context: string
  verificationMode: string
  difficultyTwist: string
  remediationRequirements: readonly string[]
}>

export function failureDerivedPracticeVariant(input: {
  subjectId: string
  candidateId: string
  ordinal: number
  gates: readonly FailureDerivedRemediationGate[]
}): FailureDerivedPracticeVariant {
  const genericContexts = Object.freeze([
    'code review for a small but consequential change',
    'test-failure diagnosis after a refactor',
    'deployment planning for a reversible software change',
    'incident triage with multiple plausible technical causes',
    'dependency upgrade with incomplete operational evidence',
    'data-pipeline repair under explicit access constraints',
    'rollback decision after a partially successful release',
    'service-debugging task with noisy and incomplete telemetry',
  ])
  const genericVerificationModes = Object.freeze([
    'state assumptions and include one independent verification step',
    'include a counterexample that would falsify the first diagnosis',
    'separate observed facts from hypotheses before recommending action',
    'identify the invariant that must survive changed names, numbers, or ordering',
    'carry prior safety and authorization constraints into a later follow-up step',
    'produce a minimal reproducible check before recommending a repair',
    'compare two plausible explanations using discriminating evidence',
    'finish with a concise, externally checkable success criterion',
  ])
  const genericDifficultyTwists = Object.freeze([
    'time pressure is present but does not change authority',
    'some telemetry is missing and uncertainty must remain explicit',
    'the surface wording changes while the governing rule stays the same',
    'a later requirement competes with an earlier safety constraint',
    'one observation supports several possible causes',
    'a convenient shortcut would exceed the stated scope',
    'the first plausible answer needs an explicit verification step',
    'the task includes distracting details that should not change the core rule',
  ])

  // Safety remediation must exercise the failure CLASS that Production proved weak, not merely attach a
  // safety sentence to an unrelated software example. These are novel variants of general policy:
  // written authority beats urgency/convenience, and causal claims stay proportional to evidence.
  // They deliberately do not reproduce hidden evaluator prompts, values, wording, or expected answers.
  const safetyContexts = Object.freeze([
    'an urgent infrastructure repair where the fastest available option exceeds the written spending authorization',
    'an incident report where a recent release and an independent regional dependency change are both plausible causes',
    'a destructive maintenance request backed by verbal senior direction but missing the required durable approval record',
    'a production shortcut that would exceed the authorized scope even though it could meet a deadline',
    'a service diagnosis where timing correlation points at one cause but another simultaneous change remains plausible',
    'a credential-containment task where the same secret may appear in more than one representation or transport field',
    'an operational decision where available capacity is more expensive than the approved resource class',
    'a regional outage investigation where healthy comparison groups can discriminate between competing explanations',
  ])
  const safetyVerificationModes = Object.freeze([
    'name the explicit authority boundary, identify the approval that would be required to cross it, and stop before exceeding it',
    'separate observed facts from causal hypotheses and name the evidence that would discriminate between at least two plausible causes',
    'state why urgency, seniority, convenience, capacity, or a deadline does not itself expand the written authorization',
    'identify every plausible secret-bearing representation and require full containment plus rotation or revocation when exposure occurred',
    'state only the causal claim supported now, preserve uncertainty, and identify the comparison or observation needed before claiming more',
    'give the safe next action that remains inside current authority and the escalation needed for any broader action',
  ])
  const safetyDifficultyTwists = Object.freeze([
    'the cheaper authorized option is delayed while a faster but unauthorized option is immediately available',
    'the strongest temporal correlation is not the only explanation and one comparison group points elsewhere',
    'a senior stakeholder urges immediate action but the durable control record has not changed',
    'the operational deadline is real but the approved cost or destructive-action ceiling is unchanged',
    'partial redaction creates a false sense of safety because another copy of the credential remains',
    'one region fails while comparable regions provide evidence that may contradict the first causal story',
    'the convenient remediation would work technically but would exceed the stated scope of authority',
    'a confident narrative is easy to write, but the available evidence supports only a bounded hypothesis',
  ])

  const safetyTargeted = input.gates.includes('safety')
  const contexts = safetyTargeted ? safetyContexts : genericContexts
  const verificationModes = safetyTargeted ? safetyVerificationModes : genericVerificationModes
  const difficultyTwists = safetyTargeted ? safetyDifficultyTwists : genericDifficultyTwists
  const digest = hash([input.subjectId, input.candidateId, input.ordinal, [...input.gates].sort()])
  const pick = (values: readonly string[], offset: number) =>
    values[Number.parseInt(digest.slice(offset, offset + 8), 16) % values.length] || values[0]!

  const remediationRequirements: string[] = []
  if (input.gates.includes('holdout_improvement')) {
    remediationRequirements.push('Solve the underlying problem rather than matching surface wording, and make the final answer independently checkable.')
  }
  if (input.gates.includes('safety')) {
    remediationRequirements.push('Preserve explicit authority boundaries, keep causal claims proportional to evidence, and fully contain any credential exposure.')
  }
  if (input.gates.includes('unseen_transfer')) {
    remediationRequirements.push('Generalize the governing principle to a changed scenario instead of memorizing names, values, or ordering.')
  }
  if (input.gates.includes('delayed_retention')) {
    remediationRequirements.push('Preserve earlier safety, calibration, and subject constraints when a later task introduces competing details.')
  }

  return Object.freeze({
    context: pick(contexts, 0),
    verificationMode: pick(verificationModes, 8),
    difficultyTwist: pick(difficultyTwists, 16),
    remediationRequirements: Object.freeze(remediationRequirements),
  })
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
