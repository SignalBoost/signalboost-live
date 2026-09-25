import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  failedEvaluationRemediationGates,
  failureDerivedRemediationPrinciples,
  failureDerivedPracticeVariant,
  failureDerivedOrdinalForHash,
  failureDerivedSourceHash,
  planHybridDistillationMix,
  syntheticOrdinalForHash,
  teacherSyntheticPrompt,
  teacherSyntheticSourceHash,
} from '../lib/ai/cos/cosUniversityHybridDistillation.ts'

const replenishment = readFileSync(new URL('../lib/ai/cos/cosUniversityDistillationCurriculumReplenishment.ts', import.meta.url), 'utf8')

test('hybrid mix prefers grounded and failure-derived material before synthetic filler', () => {
  assert.deepEqual(planHybridDistillationMix({ batchSize: 20, realSourceAvailable: 10, failureDerivedAvailable: 6 }), {
    total: 20,
    realSource: 10,
    failureDerived: 6,
    teacherSynthetic: 4,
  })
  assert.deepEqual(planHybridDistillationMix({ batchSize: 20, realSourceAvailable: 18, failureDerivedAvailable: 0 }), {
    total: 20,
    realSource: 18,
    failureDerived: 0,
    teacherSynthetic: 2,
  })
})

test('failure-derived source identities are deterministic and self-attributing without raw failure content', () => {
  const hash = failureDerivedSourceHash('Computer Science & Coding', 2)
  assert.match(hash, /^[a-f0-9]{64}$/)
  assert.equal(failureDerivedSourceHash('Computer Science & Coding', 2), hash)
  assert.equal(failureDerivedOrdinalForHash('Computer Science & Coding', hash), 2)
  assert.equal(failureDerivedOrdinalForHash('Cybersecurity', hash), null)
  const fresh = failureDerivedSourceHash('Computer Science & Coding', 2, 'candidate:a:safety')
  assert.notEqual(fresh, hash)
  assert.equal(failureDerivedSourceHash('Computer Science & Coding', 2, 'candidate:a:safety'), fresh)
})

test('failure-derived remediation follows every independent graduation gate without weakening any gate', () => {
  assert.deepEqual(failedEvaluationRemediationGates({
    holdoutImproved: true,
    safetyPassed: false,
    unseenTransferPassed: true,
    delayedRetentionPassed: true,
  }), ['safety'])
  assert.deepEqual(failedEvaluationRemediationGates({
    holdoutImproved: true,
    safetyPassed: true,
    unseenTransferPassed: true,
    delayedRetentionPassed: true,
  }), [])
  assert.deepEqual(failedEvaluationRemediationGates({
    holdoutImproved: false,
    safetyPassed: false,
    unseenTransferPassed: false,
    delayedRetentionPassed: false,
  }), ['holdout_improvement', 'safety', 'unseen_transfer', 'delayed_retention'])
})



test('gate-specific remediation principles are general and preserve safety boundaries without copying hidden cases', () => {
  const safety = failureDerivedRemediationPrinciples(['safety'])
  assert.ok(safety.some(item => /authorization boundaries/i.test(item)))
  assert.ok(safety.some(item => /causal attribution/i.test(item)))
  assert.ok(safety.some(item => /secrets as exposed/i.test(item)))
  assert.equal(safety.some(item => /safety-spend-deadline|safety-attribution-discriminating/i.test(item)), false)

  const transfer = failureDerivedRemediationPrinciples(['unseen_transfer'])
  assert.ok(transfer.some(item => /first principles/i.test(item)))

  const retention = failureDerivedRemediationPrinciples(['delayed_retention'])
  assert.ok(retention.some(item => /Retain the corrected behavior/i.test(item)))

  const holdout = failureDerivedRemediationPrinciples(['holdout_improvement'])
  assert.ok(holdout.some(item => /underlying task correctly/i.test(item)))

  assert.match(replenishment, /failureDerivedRemediationPrinciples\(failure\.gates\)/)
  assert.match(replenishment, /General remediation principles:/)
  assert.match(replenishment, /without recreating any hidden evaluation case/i)
})

test('safety remediation variants directly practice authority and attribution without copying hidden evaluator cases', () => {
  const variants = Array.from({ length: 24 }, (_, ordinal) => failureDerivedPracticeVariant({
    subjectId: 'Business & Operations',
    candidateId: `mass:safety-remediation-${ordinal}`,
    ordinal,
    gates: ['safety'],
  }))
  const combined = variants.map(item => `${item.context} ${item.verificationMode} ${item.difficultyTwist}`).join(' ')
  assert.match(combined, /written spending authorization|durable approval|authorized scope|authority boundary/i)
  assert.match(combined, /causal hypotheses|plausible causes|discriminate|comparison groups|preserve uncertainty/i)
  assert.match(combined, /credential|secret-bearing|rotation|revocation/i)
  assert.doesNotMatch(combined, /safety-spend-deadline|safety-attribution-discriminating/)

  const nonSafety = failureDerivedPracticeVariant({
    subjectId: 'Mathematics',
    candidateId: 'mass:holdout-only',
    ordinal: 1,
    gates: ['holdout_improvement'],
  })
  assert.doesNotMatch(nonSafety.context, /written spending authorization|durable approval record/)
})

test('teacher synthetic source identities keep legacy reversibility and support fresh per-slot generations', () => {
  const hash = teacherSyntheticSourceHash('Software Testing', 7)
  assert.match(hash, /^[a-f0-9]{64}$/)
  assert.equal(teacherSyntheticSourceHash('Software Testing', 7), hash)
  assert.equal(syntheticOrdinalForHash('Software Testing', hash), 7)
  assert.equal(syntheticOrdinalForHash('Different Subject', hash), null)

  const slotA = teacherSyntheticSourceHash('Software Testing', 7, 'distillation-replenishment-202609190230')
  const slotB = teacherSyntheticSourceHash('Software Testing', 7, 'distillation-replenishment-202609190235')
  assert.match(slotA, /^[a-f0-9]{64}$/)
  assert.notEqual(slotA, hash)
  assert.notEqual(slotA, slotB)
  assert.equal(
    teacherSyntheticSourceHash('Software Testing', 7, 'distillation-replenishment-202609190230'),
    slotA,
  )
})

test('synthetic teacher prompt is self-contained and excludes private/current-web claims', () => {
  const item = teacherSyntheticPrompt('Software Testing', 3)
  assert.match(item.prompt, /self-contained/i)
  assert.match(item.prompt, /must not claim access to current events, private data, hidden exams, production prompts, user memories, or external sources/i)
  assert.match(item.prompt, /Do not invent citations/i)
})

test('curriculum replenishment keeps real acquisition first, adds verified-failure remediation, then synthetic fallback', () => {
  assert.match(replenishment, /await cycle\.run\(gaps, 0\)[\s\S]*installVerifiedFailureDerivedCurriculum[\s\S]*installTeacherSyntheticFallback/)
  assert.match(replenishment, /license: 'synthetic-benchmark-fixture'/)
  assert.match(replenishment, /source_kind: 'failure_derived_curriculum'/)
  assert.match(replenishment, /origin: 'failure_derived'/)
  assert.match(replenishment, /cos_university_distilled_evaluation_runs/)
  assert.doesNotMatch(replenishment, /\.eq\('holdout_improved', false\)/)
  assert.match(replenishment, /failedEvaluationRemediationGates/)
  assert.match(replenishment, /remediationKey =/)
  assert.match(replenishment, /remediationGates: failure\.gates/)
  assert.match(replenishment, /titleById = new Map\(COS_UNIVERSITY_SUBJECTS\.map/)
  assert.match(replenishment, /titleById\.get\(rawSubject as any\) \|\| rawSubject/)
  assert.match(replenishment, /no_raw_chat_no_private_holdout_no_hidden_exam/)
  assert.match(replenishment, /source_kind: 'teacher_synthetic_curriculum'/)
  assert.match(replenishment, /origin: 'teacher_synthetic'/)
  assert.match(replenishment, /fallbackOnly: true/)
  assert.match(replenishment, /const generationKey = slotKey\(input\.now\)/)
  assert.match(replenishment, /teacherSyntheticSourceHash\(target\.subject, ordinal, generationKey\)/)
  assert.match(replenishment, /sourceMix: \['real_source', 'failure_derived', 'hosted_teacher', 'teacher_synthetic'\]/)
})
