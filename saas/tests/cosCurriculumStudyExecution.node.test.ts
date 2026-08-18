// Proves the curriculum is LEARNED, not merely declared: a track topic must reach the real daily
// learning cycle, be acquired from a source, pass admission, and be remembered.
// Live external sources are disabled so this test is hermetic and needs no network.
import assert from 'node:assert/strict'
import test from 'node:test'

process.env.COS_AUTONOMOUS_LEARNING_ENABLED = 'true'
process.env.COS_LIVE_SOURCES_ENABLED = 'false'

import { runDailyAutonomousLearning } from '../lib/cos/dailyAutonomousLearning'
import { curriculumTrackStudyGaps } from '../lib/ai/cos/cosCurriculumPriority.ts'
import type { ContinuousLearningStore, LearningCandidate } from '../lib/cos-core/layers/learning'
import type { ContinuousLearningSourceAdapter } from '../lib/cos-core/layers/learning/cycle'

class MemoryStore implements ContinuousLearningStore {
  records = new Map<string, LearningCandidate>()
  async hasContent(hash: string) { return this.records.has(hash) }
  async remember(candidate: LearningCandidate) { this.records.set(candidate.contentHash, candidate) }
}

const summary = {
  run_id: 'curriculum-study-test',
  job: 'daily' as const,
  events_scanned: 10,
  users_processed: 2,
  features_written: 2,
  segments_written: 1,
  rules_found: 0,
}

/** Answers only curriculum-track study gaps, so anything remembered here came from the curriculum. */
const trackStudyAdapter: ContinuousLearningSourceAdapter = {
  kind: 'official_documentation',
  id: 'curriculum-study-fixture',
  async acquire(gap) {
    if (!gap.id.startsWith('curriculum:track:')) return []
    return [{
      sourceKind: 'official_documentation',
      sourceUri: `https://docs.example.test/${encodeURIComponent(gap.id)}`,
      sourceTitle: `Reference material: ${gap.subject}`,
      observedAt: '2026-08-17T00:00:00.000Z',
      subject: gap.subject,
      text: `Verified reference material about ${gap.subject}. ${gap.question} ${gap.subject} is documented with mechanisms, failure modes and checks. `.repeat(6),
      license: 'approved',
      evidence: gap.evidence,
    }]
  },
}

test('curriculum track topics reach the daily learning cycle and are remembered', async () => {
  const store = new MemoryStore()
  const result = await runDailyAutonomousLearning({
    miningSummary: summary,
    store,
    approvedUrls: [],
    adapters: [trackStudyAdapter],
  })

  assert.equal(result.status, 'learned')
  assert.equal(result.externalCostUsd, 0)
  assert.ok(result.trackStudyGaps > 0, 'no curriculum track topics were scheduled for study')

  const expected = new Set(curriculumTrackStudyGaps().map(gap => gap.subject))
  const learnedSubjects = [...store.records.values()].map(record => record.subject)
  const learnedFromCurriculum = learnedSubjects.filter(subject => expected.has(subject))
  assert.ok(learnedFromCurriculum.length > 0, `no curriculum topic was remembered; learned: ${learnedSubjects.join(' | ')}`)
})

test('a studied topic keeps its track, evaluation mode and safety boundary in the stored evidence', async () => {
  const store = new MemoryStore()
  await runDailyAutonomousLearning({
    miningSummary: summary,
    store,
    approvedUrls: [],
    adapters: [trackStudyAdapter],
  })

  const studied = [...store.records.values()].find(record =>
    (record.evidence ?? []).some(line => String(line).startsWith('curriculum_track=')))
  assert.ok(studied, 'a remembered curriculum record carried no track attribution')
  const evidence = (studied.evidence ?? []).map(String)
  assert.ok(evidence.some(line => line.startsWith('curriculum_evaluation=')))
  assert.ok(evidence.some(line => line.startsWith('curriculum_safety_boundary=')))
})
