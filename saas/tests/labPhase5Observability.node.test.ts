import test from 'node:test'
import assert from 'node:assert/strict'
import { assessPhase5LaunchHealth, observePhase5Cohort, type Phase5LaunchEvent } from '../lib/ai/cos/labPhase5Observability.ts'

const revision = 'abcdef1234567890'
test('synthetic events never satisfy live health', async () => {
  const events: Phase5LaunchEvent[] = []
  const { event } = await observePhase5Cohort([], { source: 'synthetic_ci', deploymentRevision: revision, now: '2026-10-08T00:00:00.000Z' }, e => { events.push(e) })
  assert.equal(event.certified, false)
  assert.equal(event.productionAuthorized, false)
  assert.equal(event.marketplaceAuthorized, false)
  assert.equal(event.eligibleForIndependentReview, false)
  assert.deepEqual(assessPhase5LaunchHealth(events, revision, Date.parse('2026-10-08T00:01:00Z')).alerts, ['phase5_no_live_evidence'])
  assert.ok(event.blockerCodes.includes('design_partner_count_must_be_2_or_3'))
  assert.ok(!JSON.stringify(event).includes('partner_0:'))
})
test('real pilot observation is advisory, incomplete cohort alerts, stale evidence alerts', async () => {
  const events: Phase5LaunchEvent[] = []
  await observePhase5Cohort([], { source: 'private_pilot', deploymentRevision: revision, now: '2026-10-08T00:00:00Z' }, e => { events.push(e) })
  const health = assessPhase5LaunchHealth(events, revision, Date.parse('2026-10-08T02:00:00Z'))
  assert.equal(health.status, 'attention')
  assert.ok(health.alerts.includes('phase5_observation_stale'))
  assert.ok(health.alerts.includes('phase5_evidence_blocked'))
  assert.ok(health.alerts.includes('phase5_partner_cohort_incomplete'))
  assert.equal(health.certified, false)
  assert.deepEqual(assessPhase5LaunchHealth(events, 'ddddddd', Date.parse('2026-10-08T00:01:00Z')).alerts, ['phase5_no_live_evidence'])
})
test('no arbitrary revision; failed telemetry export cannot be counted as observed', async () => {
  await assert.rejects(observePhase5Cohort([], {source:'private_pilot', deploymentRevision:'latest'}, async () => {}), /exact_revision/)
  await assert.rejects(observePhase5Cohort([], {source:'private_pilot', deploymentRevision:revision}, async () => {throw new Error('sink_unavailable')}), /sink_unavailable/)
})
