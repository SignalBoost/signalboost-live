import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeEnterpriseEvidenceEvent } from '../lib/enterprise/memory/evidenceBus.ts'
import { correlateEnterpriseEvidenceEvents } from '../lib/enterprise/memory/evidenceCorrelation.ts'
import { reconstructEnterpriseEvidenceTimeline } from '../lib/enterprise/memory/evidenceTimeline.ts'
import { analyzeEnterpriseEvidenceRootCause } from '../lib/enterprise/memory/rootCauseAnalysis.ts'

function event(input: Record<string, unknown>) {
  return normalizeEnterpriseEvidenceEvent({
    organizationId: 'org-1',
    workspace: 'ops',
    occurredAt: '2026-07-18T12:00:00.000Z',
    confidence: 0.9,
    payload: {},
    ...input,
  } as any, { now: '2026-07-18T12:10:00.000Z' })
}

test('ranks a correlated deployment before a browser observation as primary hypothesis', () => {
  const events = [
    event({ eventId: 'deploy', type: 'deployment.succeeded', agent: 'vercel', occurredAt: '2026-07-18T12:00:00.000Z', entities: { deploymentId: 'dep-1', commitSha: 'abc' } }),
    event({ eventId: 'browser', type: 'browser.observation_recorded', agent: 'browser', occurredAt: '2026-07-18T12:02:00.000Z', entities: { deploymentId: 'dep-1', commitSha: 'abc' } }),
  ]
  const correlation = correlateEnterpriseEvidenceEvents(events)
  const timeline = reconstructEnterpriseEvidenceTimeline(correlation)!
  const analysis = analyzeEnterpriseEvidenceRootCause(timeline, correlation.links, { targetEventId: 'browser' })

  assert.equal(analysis.status, 'supported')
  assert.equal(analysis.primaryHypothesis?.eventId, 'deploy')
  assert.ok(analysis.primaryHypothesis!.supportingEvidence.some(item => item.includes('deployment id')))
  assert.ok(analysis.primaryHypothesis!.contradictingEvidence.includes('The deployment event itself was recorded as successful.'))
})

test('stronger exact identifiers outrank broad repository-only evidence', () => {
  const events = [
    event({ eventId: 'repo', type: 'repository.analysis_completed', agent: 'repository', occurredAt: '2026-07-18T11:59:00.000Z', entities: { repository: 'SignalBoost/signalboost-live' } }),
    event({ eventId: 'deploy', type: 'deployment.failed', agent: 'vercel', occurredAt: '2026-07-18T12:00:00.000Z', entities: { deploymentId: 'dep-1', repository: 'SignalBoost/signalboost-live' } }),
    event({ eventId: 'browser', type: 'browser.observation_recorded', agent: 'browser', occurredAt: '2026-07-18T12:01:00.000Z', entities: { deploymentId: 'dep-1', repository: 'SignalBoost/signalboost-live' } }),
  ]
  const correlation = correlateEnterpriseEvidenceEvents(events)
  const timeline = reconstructEnterpriseEvidenceTimeline(correlation)!
  const analysis = analyzeEnterpriseEvidenceRootCause(timeline, correlation.links, { targetEventId: 'browser' })

  assert.equal(analysis.primaryHypothesis?.eventId, 'deploy')
  assert.equal(analysis.alternateHypotheses[0]?.eventId, 'repo')
})

test('returns insufficient evidence instead of inventing a cause', () => {
  const events = [event({ eventId: 'browser', type: 'browser.observation_recorded', agent: 'browser' })]
  const correlation = correlateEnterpriseEvidenceEvents(events)
  const timeline = reconstructEnterpriseEvidenceTimeline(correlation)!
  const analysis = analyzeEnterpriseEvidenceRootCause(timeline, correlation.links)

  assert.equal(analysis.status, 'insufficient_evidence')
  assert.equal(analysis.primaryHypothesis, null)
  assert.ok(analysis.unknowns.length > 0)
})

test('ignores candidate events that occur after the target', () => {
  const events = [
    event({ eventId: 'browser', type: 'browser.observation_recorded', agent: 'browser', occurredAt: '2026-07-18T12:00:00.000Z', entities: { deploymentId: 'dep-1' } }),
    event({ eventId: 'deploy', type: 'deployment.failed', agent: 'vercel', occurredAt: '2026-07-18T12:01:00.000Z', entities: { deploymentId: 'dep-1' } }),
  ]
  const correlation = correlateEnterpriseEvidenceEvents(events)
  const timeline = reconstructEnterpriseEvidenceTimeline(correlation)!
  const analysis = analyzeEnterpriseEvidenceRootCause(timeline, correlation.links, { targetEventId: 'browser' })

  assert.equal(analysis.status, 'insufficient_evidence')
})

test('requires a valid target effect and validates options', () => {
  const events = [event({ eventId: 'deploy', type: 'deployment.failed', agent: 'vercel' })]
  const correlation = correlateEnterpriseEvidenceEvents(events)
  const timeline = reconstructEnterpriseEvidenceTimeline(correlation)!

  assert.equal(analyzeEnterpriseEvidenceRootCause(timeline, correlation.links).status, 'insufficient_evidence')
  assert.throws(() => analyzeEnterpriseEvidenceRootCause(timeline, correlation.links, { maxHypotheses: 0 }))
  assert.throws(() => analyzeEnterpriseEvidenceRootCause(timeline, correlation.links, { minimumConfidence: 2 }))
})
