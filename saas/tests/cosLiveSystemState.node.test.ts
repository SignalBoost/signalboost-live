// saas/tests/cosLiveSystemState.node.test.ts
//
// The automatic learning pipeline (mining/dailyAutonomousLearning at 06:30 UTC daily, plus the
// hourly current-world-learning cron) has always reported its own readiness via
// autonomousLearningReadiness() — enabled/ready plus WHY not, if not. Nothing ever surfaced it.
// So whether automatic acquisition was running at all was invisible without reading code — the
// exact blind spot Luis found when he pointed out that tonight's corpus growth came from his own
// manual directed study, not automatic learning (2026-08-23). This wires that existing readiness
// check into the LIVE SYSTEM STATE block already shown on every provenance check, so the question
// answers itself next time instead of needing an investigation.

import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCosLiveSystemState, type CosLiveSystemState } from '../lib/ai/cos/cosLiveSystemState.ts'
import { autonomousLearningReadiness } from '../lib/cos/dailyAutonomousLearning.ts'

function baseState(overrides: Partial<CosLiveSystemState> = {}): CosLiveSystemState {
  return {
    generatedAt: '2026-08-23T06:00:00.000Z',
    deployment: { commitSha: 'abc123', environment: 'production' },
    localReasoner: { configured: true, healthy: true, model: 'test-model', error: null },
    externalFallbackEnabled: false,
    enterpriseMemory: { status: 'connected_scope', organizationId: 'org1', organizationRows: 1, intelligenceSnapshots: 1, repositorySnapshots: 0, campaignMemories: 0, confidenceHistory: 1, retrievableItems: 3, kinds: {} },
    knowledgeGraph: { activeFacts: 50, quarantinedFacts: 2, latestUpdatedAt: '2026-08-22T07:15:48.147Z' },
    learnedCorpus: { total: 262, relevanceRejected: 53, bySourceKind: { scientific_journal: 155 }, latestObservedAt: '2026-08-23T05:12:32.275Z' },
    autonomousLearning: { enabled: false, ready: false, warnings: ['COS_AUTONOMOUS_LEARNING_ENABLED is not true'] },
    cognitiveSkills: { validated: 1, latestUpdatedAt: null },
    cache: { semanticRecords: 1, exactRecords: 34 },
    userMemory: { available: true, records: 5 },
    lastTurnRecord: null,
    ...overrides,
  }
}

test('a disabled autonomous pipeline is reported as DISABLED, not silently omitted', () => {
  const text = formatCosLiveSystemState(baseState())
  assert.match(text, /Autonomous Learning\s*: DISABLED/)
})

test('an enabled but not-ready pipeline states why, not just that something is wrong', () => {
  const text = formatCosLiveSystemState(baseState({
    autonomousLearning: { enabled: true, ready: false, warnings: ['YouTube learning is unavailable because YOUTUBE_API_KEY is not configured'] },
  }))
  assert.match(text, /Autonomous Learning\s*: ENABLED — not ready/)
  assert.match(text, /YOUTUBE_API_KEY is not configured/)
})

test('a running pipeline reports ENABLED — running with no warning clutter', () => {
  const text = formatCosLiveSystemState(baseState({
    autonomousLearning: { enabled: true, ready: true, warnings: [] },
  }))
  assert.match(text, /Autonomous Learning\s*: ENABLED — running/)
  assert.doesNotMatch(text.split('Autonomous Learning')[1]!.split('\n')[0]!, /;/)
})

test('readiness is false whenever the master flag is off, regardless of other configuration', () => {
  const readiness = autonomousLearningReadiness({ COS_AUTONOMOUS_LEARNING_ENABLED: 'false', COS_APPROVED_LEARNING_URLS: 'https://example.com/feed' } as NodeJS.ProcessEnv)
  assert.equal(readiness.autonomousEnabled, false)
  assert.equal(readiness.ready, false)
  assert.ok(readiness.warnings.some(w => w.includes('COS_AUTONOMOUS_LEARNING_ENABLED')))
})

test('readiness is true once the master flag is on and at least one source is configured', () => {
  const readiness = autonomousLearningReadiness({ COS_AUTONOMOUS_LEARNING_ENABLED: 'true', COS_APPROVED_LEARNING_URLS: 'https://example.com/feed' } as NodeJS.ProcessEnv)
  assert.equal(readiness.autonomousEnabled, true)
  assert.equal(readiness.ready, true)
})
