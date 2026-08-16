// saas/tests/cosCurriculumPriority.node.test.ts
//
// Pins the behaviour that makes COS choose its own curriculum: study what it is measurably WORST
// at on real work, not what its corpus happens to be thin about. The subject shapes below mirror
// the per-problem-class buckets produced by computeCosIndependenceMetrics.

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeCurriculumPriorities,
  curriculumSignalsFromIndependence,
} from '../lib/ai/cos/cosCurriculumPriority.ts'
import { generateKnowledgeGaps } from '../lib/cos-core/layers/learning/gaps.ts'

function subject(overrides = {}) {
  return {
    attempts: 0,
    independentAccepted: 0,
    externalRequired: 0,
    teacherInteractions: 0,
    positiveFeedback: 0,
    negativeFeedback: 0,
    userCorrections: 0,
    productionOutcomes: 0,
    productionSuccesses: 0,
    productionFailures: 0,
    ...overrides,
  }
}

function metrics(subjects: Record<string, ReturnType<typeof subject>>) {
  return { targetIndependentPassRate: 0.85, subjects } as any
}

test('a verified production failure outranks a merely low independence rate', () => {
  const priorities = computeCurriculumPriorities(metrics({
    'postgres performance': subject({ attempts: 8, independentAccepted: 8, productionOutcomes: 4, productionFailures: 2 }),
    'ci pipeline': subject({ attempts: 20, independentAccepted: 12 }),
  }))
  assert.equal(priorities[0].subject, 'postgres performance')
  assert.ok(priorities[0].pressure > priorities[1].pressure)
})

test('external teacher dependency is a curriculum signal even when every turn was accepted', () => {
  const priorities = computeCurriculumPriorities(metrics({
    'kubernetes networking': subject({ attempts: 6, independentAccepted: 6, teacherInteractions: 5, externalRequired: 5 }),
  }))
  assert.equal(priorities.length, 1)
  assert.ok(priorities[0].pressure > 0)
  assert.ok(priorities[0].reasons.some(reason => reason.startsWith('external_teacher_interactions=')))
})

test('healthy classes produce no curriculum item at all', () => {
  const priorities = computeCurriculumPriorities(metrics({
    'invoice reconciliation': subject({ attempts: 30, independentAccepted: 30, productionOutcomes: 9, productionSuccesses: 9 }),
  }))
  assert.deepEqual(priorities, [])
})

test('thin classes are ignored unless production actually failed', () => {
  const noisy = computeCurriculumPriorities(metrics({
    'one off question': subject({ attempts: 1, independentAccepted: 0, externalRequired: 1 }),
  }))
  assert.deepEqual(noisy, [])

  const real = computeCurriculumPriorities(metrics({
    'one off question': subject({ attempts: 1, independentAccepted: 0, productionOutcomes: 1, productionFailures: 1 }),
  }))
  assert.equal(real.length, 1)
})

test('unstudyable taxonomy buckets never become study targets', () => {
  const priorities = computeCurriculumPriorities(metrics({
    'general reasoning': subject({ attempts: 400, independentAccepted: 10, externalRequired: 390, productionFailures: 9 }),
    'unclassified': subject({ attempts: 50, independentAccepted: 1, externalRequired: 49 }),
  }))
  assert.deepEqual(priorities.map(priority => priority.subject), [])
})

test('business importance breaks ties between equally weak classes', () => {
  const priorities = computeCurriculumPriorities(metrics({
    'rare class': subject({ attempts: 3, independentAccepted: 1, externalRequired: 2 }),
    'busy class': subject({ attempts: 60, independentAccepted: 20, externalRequired: 40, productionOutcomes: 12 }),
  }))
  assert.equal(priorities[0].subject, 'busy class')
})

test('emitted signals survive the existing gap pipeline and carry honest evidence', () => {
  const signals = curriculumSignalsFromIndependence(metrics({
    'postgres performance': subject({ attempts: 8, independentAccepted: 2, teacherInteractions: 4, externalRequired: 4, userCorrections: 1, productionOutcomes: 3, productionFailures: 1 }),
  }))
  assert.equal(signals.length, 1)
  assert.equal(signals[0].capability, 'independent_problem_class')
  assert.equal(signals[0].escalated, true)
  assert.equal(signals[0].succeeded, false)
  assert.ok(signals[0].evidence?.includes('curriculum_source=measured_independence_metrics'))

  const gaps = generateKnowledgeGaps(signals)
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0].subject, 'postgres performance')
  assert.ok(gaps[0].urgency > 50)
})

test('curriculum output is deterministic and bounded', () => {
  const input = metrics(Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [
      `class ${index}`,
      subject({ attempts: 10 + index, independentAccepted: 1, externalRequired: 9 + index }),
    ]),
  ))
  const first = curriculumSignalsFromIndependence(input, { limit: 5 })
  const second = curriculumSignalsFromIndependence(input, { limit: 5 })
  assert.equal(first.length, 5)
  assert.deepEqual(first.map(signal => signal.subject), second.map(signal => signal.subject))
})
