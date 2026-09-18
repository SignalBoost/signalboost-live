import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
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
})

test('teacher synthetic source identities are deterministic and reversible within bounded batch ordinals', () => {
  const hash = teacherSyntheticSourceHash('Software Testing', 7)
  assert.match(hash, /^[a-f0-9]{64}$/)
  assert.equal(teacherSyntheticSourceHash('Software Testing', 7), hash)
  assert.equal(syntheticOrdinalForHash('Software Testing', hash), 7)
  assert.equal(syntheticOrdinalForHash('Different Subject', hash), null)
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
  assert.match(replenishment, /\.eq\('holdout_improved', false\)/)
  assert.match(replenishment, /no_raw_chat_no_private_holdout_no_hidden_exam/)
  assert.match(replenishment, /source_kind: 'teacher_synthetic_curriculum'/)
  assert.match(replenishment, /origin: 'teacher_synthetic'/)
  assert.match(replenishment, /fallbackOnly: true/)
  assert.match(replenishment, /sourceMix: \['real_source', 'failure_derived', 'teacher_synthetic'\]/)
})
