// saas/tests/universityCurriculumAlignedAdmission.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { gapCurriculumAligned, generateKnowledgeGaps, type KnowledgeGapSignal } from '../lib/cos-core/layers/learning/gaps.ts'
import { classifyTieredAdmission } from '../lib/ai/cos/tieredLearningAdmission.ts'

function universitySignal(overrides: Partial<KnowledgeGapSignal> = {}): KnowledgeGapSignal {
  return {
    taskId: 'university:0b268e3dd437ddcbce0b4d71fd8b6463',
    subject: 'Computer Science & Coding',
    capability: 'cos_university.computer_science',
    objective: 'restore independent exam competence in computer science',
    confidence: 0,
    escalated: true,
    succeeded: false,
    missingFacts: ['algorithm complexity analysis', 'concurrency correctness'],
    portableIds: ['cos'],
    ...overrides,
  }
}

test('a declared University study gap is curriculum aligned even though its id is not prefixed curriculum:', () => {
  const [gap] = generateKnowledgeGaps([universitySignal({ curriculumAligned: true })])
  assert.ok(gap)
  assert.ok(gap.id.startsWith('auto-gap:university:'), gap.id)
  assert.equal(gap.curriculumAligned, true)
  assert.equal(gapCurriculumAligned(gap), true)
})

test('an undeclared gap keeps the legacy prefix behaviour', () => {
  const [gap] = generateKnowledgeGaps([universitySignal()])
  assert.ok(gap)
  assert.equal(gap.curriculumAligned, undefined)
  assert.equal(gapCurriculumAligned(gap), false)
  assert.equal(gapCurriculumAligned({ ...gap, id: 'curriculum:computer_science' }), true)
})

test('the probationary tier holds a University metadata candidate once the lane is declared aligned', () => {
  // Representative of the band that production rejected on every cycle: relevant enough to clear the
  // 0.12 admission floor, confident enough for the probationary floor, below the 0.72 durable floor.
  const measurement = { rawRelevance: 0.3, confidence: 0.68, sourceFloor: 0.6 }
  assert.equal(classifyTieredAdmission({ ...measurement, gapAligned: false }).tier, 'rejected')
  const aligned = classifyTieredAdmission({ ...measurement, gapAligned: true })
  assert.equal(aligned.tier, 'probationary')
  assert.equal(aligned.corroborationRequired, false)
  // Alignment routes evidence; it never rewrites the measured numbers.
  assert.equal(aligned.rawRelevance, 0.3)
  assert.equal(aligned.confidence, 0.68)
})

test('alignment does not admit evidence that fails the confidence floor on its own merits', () => {
  const weak = classifyTieredAdmission({ rawRelevance: 0.3, confidence: 0.5, sourceFloor: 0.6, gapAligned: true })
  assert.equal(weak.tier, 'rejected')
  const unsourced = classifyTieredAdmission({ rawRelevance: 0.9, confidence: 0.9, sourceFloor: 0.2, gapAligned: true })
  assert.equal(unsourced.tier, 'rejected')
})
