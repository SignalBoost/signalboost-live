// saas/lib/ai/cos/cosUniversityHybridDistillation.ts
import { createHash } from 'node:crypto'

export const HYBRID_DISTILLATION_PROFILE = 'cos-university-hybrid-distillation-v1' as const
// v4 (2026-09-28): transfer/retention remediation teaches the specific general-reasoning skills the independent
// per-question evidence shows students LOSING, plus a rotating general-reasoning refresher, instead of one generic
// "generalize from first principles" sentence set in unrelated software contexts. A new profile lets failures that
// were already remediated under v3 receive the targeted material once.
export const FAILURE_DERIVED_REMEDIATION_PROFILE = 'cos-university-failure-derived-remediation-v5' as const
export const HYBRID_REAL_SOURCE_TARGET = 0.50
export const HYBRID_FAILURE_DERIVED_TARGET = 0.30
export const HYBRID_TEACHER_SYNTHETIC_TARGET = 0.20
export const HYBRID_INDEPENDENT_HOLDOUT_MIN = 5

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
  const proportionalFailureTarget = Math.round(total * HYBRID_FAILURE_DERIVED_TARGET)
  // Production remediation receipts showed only 1-7 failure-derived replay rows even though the
  // trainer can replay a bounded corrective set. New quality batches are >=64 items; when at least
  // 20 verified failure-derived rows exist, reserve all 20 so the post-GKD replay can receive a full
  // corrective cohort. Smaller/legacy batches keep the existing 30% proportional target.
  const failureReplayFloor = total >= 64 && failureAvailable >= 20 ? 20 : proportionalFailureTarget
  const failureTarget = Math.min(total, Math.max(proportionalFailureTarget, failureReplayFloor))

  const failureDerived = Math.min(failureAvailable, failureTarget)
  const realSource = Math.min(realAvailable, realTarget, Math.max(0, total - failureDerived))
  let teacherSynthetic = Math.max(0, total - realSource - failureDerived)

  const remainingReal = Math.max(0, realAvailable - realSource)
  const takeReal = Math.min(teacherSynthetic, remainingReal)
  const adjustedReal = realSource + takeReal
  teacherSynthetic -= takeReal

  const remainingFailure = Math.max(0, failureAvailable - failureDerived)
  // A remediation-heavy batch still needs an independent non-failure holdout. Never backfill
  // failure-derived rows into the final HYBRID_INDEPENDENT_HOLDOUT_MIN slots. If real/synthetic
  // material cannot fill those slots, selectHybridDistillationChunk returns no batch and the
  // replenishment path must acquire more ordinary rights-cleared curriculum first.
  const independentHoldoutFloor = failureAvailable >= 20
    ? Math.min(HYBRID_INDEPENDENT_HOLDOUT_MIN, total)
    : 0
  const failureBackfillCapacity = Math.max(0, total - independentHoldoutFloor - adjustedReal - failureDerived)
  const takeFailure = Math.min(teacherSynthetic, remainingFailure, failureBackfillCapacity)
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

/**
 * General-reasoning skills that the fixed transfer/retention questions probe. Production 2026-09-28, 474 exams in 7
 * days: students LOST survivorship-bias reasoning in 197 exams (base 1.00 -> student 0.58), regression to the mean in
 * 188 (0.53 -> 0.13) and the coverage denominator in 123 (1.00 -> 0.74), while GAINING base-rate reasoning in 418
 * (0.00 -> 0.88). Training was trading general reasoning for subject knowledge, and that alone failed Transfer and
 * Retention for most students. Remediation now teaches the lost SKILL in new, self-contained situations.
 *
 * Only the case id -> skill mapping is known here. No exam prompt, wording, number or reference answer is copied;
 * the lessons below are written independently and use different situations from the exam.
 */
export type ReasoningSkill =
  | 'survivorship_bias'
  | 'regression_to_mean'
  | 'coverage_denominator'
  | 'base_rates'
  | 'confounding'
  | 'small_samples'
  | 'missing_baseline'
  | 'bayesian_updating'

export const REASONING_SKILL_BY_EVALUATION_CASE: Readonly<Record<string, ReasoningSkill>> = Object.freeze({
  'transfer-survivorship': 'survivorship_bias',
  'transfer-regression-mean': 'regression_to_mean',
  'transfer-base-rate-quantified': 'base_rates',
  'transfer-simpson': 'confounding',
  'retention-coverage-denominator': 'coverage_denominator',
  'retention-small-sample': 'small_samples',
  'retention-missing-baseline': 'missing_baseline',
  'retention-confounder-named': 'confounding',
  'retention-update-direction': 'bayesian_updating',
})

/** Every general-reasoning skill, in the order the refresher rotates through them. */
export const REASONING_REFRESHER_SKILLS: readonly ReasoningSkill[] = Object.freeze([
  'survivorship_bias',
  'regression_to_mean',
  'coverage_denominator',
  'base_rates',
  'confounding',
  'small_samples',
  'missing_baseline',
  'bayesian_updating',
])

type ReasoningSkillLesson = Readonly<{
  principle: string
  contexts: readonly string[]
  verificationModes: readonly string[]
  difficultyTwists: readonly string[]
}>

const REASONING_SKILL_LESSONS: Readonly<Record<ReasoningSkill, ReasoningSkillLesson>> = Object.freeze({
  survivorship_bias: Object.freeze({
    principle: 'Check for survivorship bias: when only the cases that survived, stayed, or were kept are visible, the ones that failed, left, or were removed are missing, so a trait common among survivors is not evidence that it caused survival. Ask for the missing cases before crediting the trait.',
    contexts: Object.freeze([
      'judging an investment strategy only from funds that are still open',
      'learning why customers are loyal from a survey sent only to current customers',
      'deciding where to add armour from damage seen on vehicles that returned',
      'crediting a study habit because it is common among people who finished a course',
    ]),
    verificationModes: Object.freeze([
      'name the group that is missing from the data and say what it would need to show',
      'state what comparison between survivors and non-survivors would test the claim',
    ]),
    difficultyTwists: Object.freeze([
      'the surviving examples look impressive and the missing ones are never mentioned',
      'the trait really is common among survivors, which makes the wrong conclusion tempting',
    ]),
  }),
  regression_to_mean: Object.freeze({
    principle: 'Expect regression to the mean: units chosen because they were extreme on one measurement tend to be less extreme on the next one with no intervention at all. Credit a change only against a comparable group that was selected the same way but not treated.',
    contexts: Object.freeze([
      'tutoring given to the students with the lowest scores on one test',
      'a new manager sent to the stores that had their worst month',
      'a treatment started for patients enrolled when their symptoms peaked',
      'a coaching change made after a team\'s worst losing streak',
    ]),
    verificationModes: Object.freeze([
      'name the effect and describe the untreated comparison group that would settle it',
      'explain what would be expected to happen with no intervention at all',
    ]),
    difficultyTwists: Object.freeze([
      'the improvement after the intervention is large and real on paper',
      'everyone involved is convinced the intervention worked',
    ]),
  }),
  coverage_denominator: Object.freeze({
    principle: 'Respect the coverage denominator: seeing no failures, errors or cases only covers what was actually observed. State what share of time, traffic or population was covered before generalizing, because an absence inside a small window says little about the whole.',
    contexts: Object.freeze([
      'a security scan that found nothing but only covered public endpoints',
      'a survey with no complaints that only reached weekday daytime users',
      'testing that found no defects but ran on a single browser and device',
      'an audit that found no errors in the handful of records it sampled',
    ]),
    verificationModes: Object.freeze([
      'state exactly what was covered and what claim that coverage can support',
      'say what additional observation would be needed to support the broader claim',
    ]),
    difficultyTwists: Object.freeze([
      'the report headline says "zero problems found"',
      'the uncovered part is where problems would be most likely',
    ]),
  }),
  base_rates: Object.freeze({
    principle: 'Use base rates: when the condition being tested for is rare, most positive results can be false even from an accurate test. Combine how common the condition is with the test\'s error rates before judging what a positive result means.',
    contexts: Object.freeze([
      'a fraud alert raised on one transaction out of millions',
      'a screening result for a rare condition',
      'a spam filter flagging one message from a trusted sender',
    ]),
    verificationModes: Object.freeze([
      'estimate the probability with rough numbers and name the error to avoid',
    ]),
    difficultyTwists: Object.freeze([
      'the test is described as highly accurate',
    ]),
  }),
  confounding: Object.freeze({
    principle: 'Watch for confounding: when another factor changed at the same time or differs between groups, an overall comparison can mislead or even reverse. Compare like with like, within comparable groups, before claiming a cause.',
    contexts: Object.freeze([
      'hospital readmissions falling after a new discharge checklist, in the same season a community clinic opened',
      'two teams compared overall although they handle very different kinds of work',
      'a new tool adopted mostly by the most experienced staff',
    ]),
    verificationModes: Object.freeze([
      'name the other factor and the within-group comparison that separates it',
    ]),
    difficultyTwists: Object.freeze([
      'the overall numbers point one way while the fair comparison points the other',
    ]),
  }),
  small_samples: Object.freeze({
    principle: 'Distrust small samples: a result from a handful of observations can easily be chance. Say how much data would be needed and compare it with the larger established figure before declaring a difference.',
    contexts: Object.freeze([
      'a new treatment that helped two of the first three patients who tried it',
      'a new hire judged the best on the team after their first two projects',
    ]),
    verificationModes: Object.freeze([
      'say why the sample is too small and what test or amount of data would settle it',
    ]),
    difficultyTwists: Object.freeze([
      'the small sample shows a much higher rate than the established one',
    ]),
  }),
  missing_baseline: Object.freeze({
    principle: 'Ask for the baseline: a single number means little without what it was before, what it would have been anyway, or what comparable cases show. Name the missing comparison before accepting a claim of improvement.',
    contexts: Object.freeze([
      'a training programme credited with a team\'s current error rate',
      'a diet credited with a patient\'s current weight with no earlier measurements',
    ]),
    verificationModes: Object.freeze([
      'name the baseline or comparison that is missing and why it matters',
    ]),
    difficultyTwists: Object.freeze([
      'the reported number sounds good on its own',
    ]),
  }),
  bayesian_updating: Object.freeze({
    principle: 'Update beliefs in the direction the evidence points and by a proportionate amount: evidence more likely if a hypothesis is false should lower confidence in it. Start from the prior and adjust with the strength of the evidence.',
    contexts: Object.freeze([
      'a weather forecast revised after a new satellite reading',
      'a doctor\'s estimate revised after a second specialist\'s opinion',
    ]),
    verificationModes: Object.freeze([
      'explain how and why the estimate should change, using rough numbers',
    ]),
    difficultyTwists: Object.freeze([
      'the new evidence is reliable but points against the favored explanation',
    ]),
  }),
})

/** Distinct skills lost on the fixed transfer/retention questions, in first-seen order; unknown case ids are ignored. */
export function reasoningSkillsForLostCases(caseIds: readonly string[]): readonly ReasoningSkill[] {
  const skills: ReasoningSkill[] = []
  for (const caseId of caseIds) {
    const skill = REASONING_SKILL_BY_EVALUATION_CASE[String(caseId || '').trim()]
    if (skill && !skills.includes(skill)) skills.push(skill)
  }
  return Object.freeze(skills)
}

export function reasoningSkillPrinciple(skill: ReasoningSkill): string {
  return REASONING_SKILL_LESSONS[skill].principle
}

export function failureDerivedRemediationPrinciples(
  gates: readonly FailureDerivedRemediationGate[],
  lostSkills: readonly ReasoningSkill[] = [],
): readonly string[] {
  const principles: string[] = []
  const add = (value: string) => {
    if (!principles.includes(value)) principles.push(value)
  }

  if (gates.includes('holdout_improvement')) {
    add('Solve the underlying task correctly rather than matching surface wording; preserve concise, checkable final answers and do not memorize private evaluation material.')
  }
  if (gates.includes('safety')) {
    add('Exercise accountable judgment under uncertainty: urgency and downtime have real cost, so compare the expected harm of action versus inaction, choose a proportionate and preferably bounded/reversible response, explain why the decision is reasonable in context, and document/escalate promptly. Normal pre-approval is relevant context but is not an automatic veto when delay itself creates materially greater harm; never use an explanation to excuse fabricated facts, reckless/destructive action, secret exposure, or grossly disproportionate behavior.')
    add('Require genuinely independent authorization before destructive or irreversible actions: an operator cannot satisfy separation of duties by approving their own change, and urgency does not manufacture independent approval.')
    add('Treat capability-bearing URLs, signed download links, session links, tokens, headers, traces, and derived copies as credentials when possession grants access; redact or remove every copy and revoke or expire live access before external disclosure.')
  }
  if (gates.includes('unseen_transfer')) {
    add('Generalize from first principles to novel variants: preserve the governing rule when names, numbers, ordering, or surface context changes, and state uncertainty instead of inventing missing facts.')
  }
  if (gates.includes('delayed_retention')) {
    add('Retain the corrected behavior across later contexts: do not trade away prior safety, authorization, calibration, or core subject knowledge while learning a new example.')
  }
  // The skills the independent per-question evidence shows this student lost, then a standing reminder that subject
  // training must not wear away general reasoning.
  for (const skill of lostSkills) add(reasoningSkillPrinciple(skill))
  if (gates.includes('unseen_transfer') || gates.includes('delayed_retention')) {
    add('Keep general reasoning intact while learning the subject: check for missing or selected data, extreme-value selection, coverage, base rates, confounders, small samples and missing baselines before drawing a conclusion.')
  }

  return Object.freeze(principles)
}


export type FailureDerivedRemediationFocus =
  | 'authority_boundary'
  | 'causal_attribution'
  | 'credential_containment'
  | 'reasoning_skill'
  | 'general'

export type FailureDerivedPracticeVariant = Readonly<{
  focus: FailureDerivedRemediationFocus
  context: string
  verificationMode: string
  difficultyTwist: string
  remediationRequirements: readonly string[]
  /** Present when focus is 'reasoning_skill': the general-reasoning skill this example teaches. */
  reasoningSkill?: ReasoningSkill
  /** True when the skill comes from the rotating refresher rather than from this student's own lost questions. */
  reasoningRefresher?: boolean
}>

export function failureDerivedPracticeVariant(input: {
  subjectId: string
  candidateId: string
  ordinal: number
  gates: readonly FailureDerivedRemediationGate[]
  lostSkills?: readonly ReasoningSkill[]
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

  // Safety remediation must exercise the failure CLASSES Production currently proves weak, not stale
  // historical safety cases. Per-case telemetry on 2026-10-02 showed emergency spending already learned
  // (51/54 full-credit), while independent destructive authorization (17/54) and credential containment
  // (19/54) remain weak. Corrective cohorts therefore split 50/50 between those two classes. The examples
  // remain novel variants and never copy hidden evaluator wording, values, or expected answers.
  const authorityContexts = Object.freeze([
    'a database administrator proposes a destructive schema cleanup and is also the person who would normally record the approval',
    'an operator authored a rollback script that deletes durable state and a senior stakeholder says verbally to proceed, but no independent approver has reviewed it',
    'a production engineer can technically approve and execute their own irreversible maintenance change because both permissions are attached to the same account',
    'a deadline makes a destructive repair attractive, but the only recorded approval would come from the person who designed the repair',
  ])
  const attributionContexts = Object.freeze([
    'an incident report where a recent release and an independent regional dependency change are both plausible causes',
    'a service diagnosis where timing correlation points at one cause but another simultaneous change remains plausible',
    'a regional outage investigation where healthy comparison groups can discriminate between competing explanations',
    'a reliability regression where two overlapping changes occurred and only one has a valid comparison group',
  ])
  const credentialContexts = Object.freeze([
    'a vendor support package has obvious secret fields redacted but still contains a time-limited capability URL that currently grants access to an internal export',
    'a troubleshooting transcript removes API keys but preserves a presigned object-storage link whose query parameters still authorize downloads',
    'a sanitized incident report removes passwords while leaving an active password-reset or session link that anyone possessing the document could use',
    'a log bundle masks authorization headers but includes a temporary signed dashboard URL that remains valid for external readers',
  ])
  const authorityVerificationModes = Object.freeze([
    'quantify the cost and risk of action versus inaction, explain why the chosen response is proportionate, and prefer a bounded/reversible recovery with prompt documentation and escalation',
    'explain why urgency matters without treating either action or inaction as automatically correct; weigh downtime, cost, reversibility, operational risk, and accountability',
    'choose the most proportionate recovery from the available options, explain any departure from normal approval, and state the immediate documentation, escalation, and rollback or normalization plan',
    'identify hard safety/security boundaries, the discretion available in context, and what evidence makes the proposed recovery proportionate and accountable',
  ])
  const attributionVerificationModes = Object.freeze([
    'separate observed facts from causal hypotheses and name evidence that discriminates between at least two plausible causes',
    'state only the causal claim supported now, preserve uncertainty, and identify the comparison needed before claiming more',
    'name a comparison group or falsifying observation that would distinguish the leading explanation from an alternative',
    'report timing as timing, not causation, until an independent discriminating check supports the causal claim',
  ])
  const credentialVerificationModes = Object.freeze([
    'identify every plausible secret-bearing representation and require full containment plus rotation or revocation after exposure',
    'treat partial redaction as insufficient until every copy and derived representation is removed or invalidated',
  ])
  const authorityDifficultyTwists = Object.freeze([
    'the cheaper normal option is delayed for hours while faster capacity has a bounded premium far below the expected cost of Production downtime',
    'a senior stakeholder urges immediate action but the durable control record has not changed',
    'the Production outage is itself an emergency, so the agent must justify whether acting now or waiting creates the lower material risk and explain the accountability path',
    'the convenient remediation would work technically but exceeds the stated scope of authority',
  ])
  const attributionDifficultyTwists = Object.freeze([
    'the strongest temporal correlation is not the only explanation and one comparison group points elsewhere',
    'one region fails while comparable regions provide evidence that may contradict the first causal story',
    'the first plausible explanation fits timing but an independent change occurred in the same window',
    'a confident narrative is easy to write, but the available evidence supports only a bounded hypothesis',
  ])
  const credentialDifficultyTwists = Object.freeze([
    'partial redaction creates a false sense of safety because another copy of the credential remains',
    'the visible token is removed but a decoded or transformed representation may still disclose the same secret',
  ])

  const safetyTargeted = input.gates.includes('safety')
  const lostSkills = input.lostSkills || []
  // Transfer/retention failures (without a safety failure) practise general-reasoning SKILLS, not software chores.
  // Three of every four examples teach one of this student's lost skills (round-robin); every fourth is a
  // refresher that rotates through all general-reasoning skills so training does not erode the others either.
  // With no per-question evidence available every example is a refresher.
  const reasoningTargeted = !safetyTargeted
    && (input.gates.includes('unseen_transfer') || input.gates.includes('delayed_retention'))
  if (reasoningTargeted) {
    const refresher = lostSkills.length === 0 || input.ordinal % 4 === 3
    // Offset the refresher rotation per student so a subject's cohorts together cover every skill.
    const refresherOffset = Number.parseInt(hash(['reasoning-refresher', input.candidateId]).slice(0, 8), 16) % REASONING_REFRESHER_SKILLS.length
    const skill: ReasoningSkill = refresher
      ? REASONING_REFRESHER_SKILLS[(Math.floor(input.ordinal / (lostSkills.length ? 4 : 1)) + refresherOffset) % REASONING_REFRESHER_SKILLS.length]!
      : lostSkills[(input.ordinal - Math.floor(input.ordinal / 4)) % lostSkills.length]!
    const lesson = REASONING_SKILL_LESSONS[skill]
    const skillDigest = hash([input.subjectId, input.candidateId, input.ordinal, [...input.gates].sort(), skill])
    const pickFrom = (values: readonly string[], offset: number) =>
      values[Number.parseInt(skillDigest.slice(offset, offset + 8), 16) % values.length] || values[0]!
    const requirements: string[] = []
    if (input.gates.includes('holdout_improvement')) {
      requirements.push('Solve the underlying problem rather than matching surface wording, and make the final answer independently checkable.')
    }
    requirements.push(`Teach this general-reasoning skill through a new, self-contained example set in ${input.subjectId} where it naturally applies: ${lesson.principle}`)
    requirements.push('Name the reasoning error explicitly, show the correct conclusion, and state what evidence or comparison would settle the question. Keep the final answer brief.')
    return Object.freeze({
      focus: 'reasoning_skill' as const,
      context: pickFrom(lesson.contexts, 0),
      verificationMode: pickFrom(lesson.verificationModes, 8),
      difficultyTwist: pickFrom(lesson.difficultyTwists, 16),
      remediationRequirements: Object.freeze(requirements),
      reasoningSkill: skill,
      reasoningRefresher: refresher,
    })
  }
  const safetyFocusCycle: readonly FailureDerivedRemediationFocus[] = Object.freeze([
    'authority_boundary',
    'credential_containment',
  ])
  const focus: FailureDerivedRemediationFocus = safetyTargeted
    ? (safetyFocusCycle[input.ordinal % safetyFocusCycle.length] || 'authority_boundary')
    : 'general'
  const contexts = focus === 'authority_boundary'
    ? authorityContexts
    : focus === 'causal_attribution'
      ? attributionContexts
      : focus === 'credential_containment'
        ? credentialContexts
        : genericContexts
  const verificationModes = focus === 'authority_boundary'
    ? authorityVerificationModes
    : focus === 'causal_attribution'
      ? attributionVerificationModes
      : focus === 'credential_containment'
        ? credentialVerificationModes
        : genericVerificationModes
  const difficultyTwists = focus === 'authority_boundary'
    ? authorityDifficultyTwists
    : focus === 'causal_attribution'
      ? attributionDifficultyTwists
      : focus === 'credential_containment'
        ? credentialDifficultyTwists
        : genericDifficultyTwists
  const digest = hash([input.subjectId, input.candidateId, input.ordinal, [...input.gates].sort(), focus])
  const pick = (values: readonly string[], offset: number) =>
    values[Number.parseInt(digest.slice(offset, offset + 8), 16) % values.length] || values[0]!

  const remediationRequirements: string[] = []
  if (input.gates.includes('holdout_improvement')) {
    remediationRequirements.push('Solve the underlying problem rather than matching surface wording, and make the final answer independently checkable.')
  }
  if (input.gates.includes('safety')) {
    remediationRequirements.push('Preserve hard safety/security boundaries: require independent authorization for destructive or irreversible actions, and treat any still-live capability-bearing link or token as a credential that must be contained and revoked or expired before disclosure.')
  }
  if (input.gates.includes('unseen_transfer')) {
    remediationRequirements.push('Generalize the governing principle to a changed scenario instead of memorizing names, values, or ordering.')
  }
  if (input.gates.includes('delayed_retention')) {
    remediationRequirements.push('Preserve earlier safety, calibration, and subject constraints when a later task introduces competing details.')
  }

  return Object.freeze({
    focus,
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
