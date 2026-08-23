// saas/tests/cosLiveSystemState.node.test.ts
//
// Automatic-learning readiness and automatic-learning execution are different facts. Readiness
// proves the pipeline is configured; durable run health proves its scheduled loops actually ran.
// Manual directed study may grow cos_continuous_learning without proving either cron succeeded.

import assert from 'node:assert/strict'
import test from 'node:test'
import { formatCosLiveSystemState, type CosLiveSystemState } from '../lib/ai/cos/cosLiveSystemState.ts'
import { autonomousLearningReadiness } from '../lib/cos/dailyAutonomousLearning.ts'

function emptyAutomaticState(enabled = false, ready = false): CosLiveSystemState['autonomousLearning'] {
  return {
    enabled,
    ready,
    liveSourcesEnabled: true,
    liveAdapters: 8,
    approvedUrls: 0,
    warnings: enabled ? [] : ['COS_AUTONOMOUS_LEARNING_ENABLED is not true'],
    currentWorld: { run: null, fresh: null },
    daily: { run: null, fresh: null },
  }
}

function baseState(overrides: Partial<CosLiveSystemState> = {}): CosLiveSystemState {
  return {
    generatedAt: '2026-08-23T06:00:00.000Z',
    deployment: { commitSha: 'abc123', environment: 'production' },
    localReasoner: { configured: true, healthy: true, model: 'test-model', error: null },
    externalFallbackEnabled: false,
    autonomousLearning: emptyAutomaticState(),
    enterpriseMemory: { status: 'connected_scope', organizationId: 'org1', organizationRows: 1, intelligenceSnapshots: 1, repositorySnapshots: 0, campaignMemories: 0, confidenceHistory: 1, retrievableItems: 3, kinds: {} },
    knowledgeGraph: { activeFacts: 50, quarantinedFacts: 2, latestUpdatedAt: '2026-08-22T07:15:48.147Z' },
    learnedCorpus: { total: 262, relevanceRejected: 53, bySourceKind: { scientific_journal: 155 }, latestObservedAt: '2026-08-23T05:12:32.275Z' },
    cognitiveSkills: { validated: 1, latestUpdatedAt: null },
    cache: { semanticRecords: 1, exactRecords: 34 },
    userMemory: { available: true, records: 5 },
    lastTurnRecord: null,
    ...overrides,
  }
}

test('a disabled autonomous pipeline is reported as DISABLED, not silently omitted', () => {
  const text = formatCosLiveSystemState(baseState())
  assert.match(text, /Automatic Learning\s*: DISABLED/)
})

test('an enabled but not-ready pipeline states why, not just that something is wrong', () => {
  const state = emptyAutomaticState(true, false)
  state.warnings = ['YouTube learning is unavailable because YOUTUBE_API_KEY is not configured']
  const text = formatCosLiveSystemState(baseState({ autonomousLearning: state }))
  assert.match(text, /Automatic Learning\s*: NOT READY/)
  assert.match(text, /YOUTUBE_API_KEY is not configured/)
})

test('configured readiness does not pretend that either cron has actually run', () => {
  const text = formatCosLiveSystemState(baseState({ autonomousLearning: emptyAutomaticState(true, true) }))
  assert.match(text, /Automatic Learning\s*: READY/)
  assert.match(text, /Auto Current-World\s*: NO DURABLE RUN RECORD YET/)
  assert.match(text, /Auto Daily Learning\s*: NO DURABLE RUN RECORD YET/)
})

test('recent successful automatic run is distinguished from a degraded run with source errors', () => {
  const state = emptyAutomaticState(true, true)
  state.currentWorld = {
    fresh: true,
    run: {
      mode: 'current_world', status: 'learned', succeeded: true,
      startedAt: '2026-08-23T05:14:00.000Z', finishedAt: '2026-08-23T05:15:00.000Z', latencyMs: 60000,
      documentsAcquired: 8, accepted: 1, probationary: 0, indexed: 1, indexingFailed: 0,
      sourceErrors: {}, skipReason: null, deploymentSha: 'abc123', recordedAt: '2026-08-23T05:15:00.100Z',
    },
  }
  state.daily = {
    fresh: true,
    run: {
      mode: 'daily', status: 'learned', succeeded: true,
      startedAt: '2026-08-22T06:30:00.000Z', finishedAt: '2026-08-22T06:32:00.000Z', latencyMs: 120000,
      documentsAcquired: 428, accepted: 26, probationary: 0, indexed: 0, indexingFailed: 0,
      sourceErrors: { storage: 46, gdelt: 3, crossref: 1 }, skipReason: null, deploymentSha: 'abc123', recordedAt: '2026-08-22T06:32:00.100Z',
    },
  }
  const text = formatCosLiveSystemState(baseState({ autonomousLearning: state }))
  assert.match(text, /Auto Current-World\s*: HEALTHY/)
  assert.match(text, /acquired 8; accepted 1; probationary 0; indexed 1/)
  assert.match(text, /Auto Daily Learning\s*: DEGRADED/)
  assert.match(text, /source errors storage 46, gdelt 3, crossref 1/)
})

test('stale automatic run is visible even when the learned corpus is large', () => {
  const state = emptyAutomaticState(true, true)
  state.currentWorld = {
    fresh: false,
    run: {
      mode: 'current_world', status: 'learned', succeeded: true,
      startedAt: '2026-08-22T01:14:00.000Z', finishedAt: '2026-08-22T01:15:00.000Z', latencyMs: 60000,
      documentsAcquired: 20, accepted: 2, probationary: 0, indexed: 2, indexingFailed: 0,
      sourceErrors: {}, skipReason: null, deploymentSha: 'old', recordedAt: '2026-08-22T01:15:00.100Z',
    },
  }
  const text = formatCosLiveSystemState(baseState({ autonomousLearning: state }))
  assert.match(text, /Learned Corpus\s*: 262 total/)
  assert.match(text, /Auto Current-World\s*: STALE/)
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
