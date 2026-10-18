// saas/tests/cosUniversityDistillationCurriculumReplenishment.node.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMassDistillationReplenishmentGaps,
  massDistillationThroughputProfile,
} from '../lib/ai/cos/cosUniversityDistillationCurriculumPlan.ts'

// Test the curriculum plan functions

test('massDistillationThroughputProfile should return default values when env is empty', () => {
  const profile = massDistillationThroughputProfile({})
  assert.equal(profile.preparedBatchBufferTarget, 10)
  assert.equal(profile.targetSubjectsPerReplenishment, 3)
  assert.equal(profile.queriesPerSubject, 3)
  assert.equal(profile.acquisitionCandidatesPerCycle, 40)
  assert.equal(profile.corpusScanRows, 5000)
  assert.equal(profile.maxBatchesPerSweep, 20)
})

// Test buildMassDistillationReplenishmentGaps with mock data
test('buildMassDistillationReplenishmentGaps should return gaps for subjects', () => {
  const supply = [
    {
      subjectKey: 'computer_science',
      subject: 'Computer Science & Coding',
      canonicalSubjectId: 'computer_science',
      uniqueBatchableItems: 10,
      shortfallToBatch: 54,
      realSourceItems: 20,
      realSourceNeeded: 30,
    },
    {
      subjectKey: 'mathematics',
      subject: 'Mathematics',
      canonicalSubjectId: 'mathematics',
      uniqueBatchableItems: 5,
      shortfallToBatch: 59,
      realSourceItems: 10,
      realSourceNeeded: 20,
    }
  ]

  const gaps = buildMassDistillationReplenishmentGaps(supply)
  assert.ok(gaps.length > 0)
  assert.ok(gaps[0].question.includes('Computer Science & Coding'))
})

// end of saas/tests/cosUniversityDistillationCurriculumReplenishment.node.test.ts
