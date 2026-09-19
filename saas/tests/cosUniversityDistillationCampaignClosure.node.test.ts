// saas/tests/cosUniversityDistillationCampaignClosure.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decideDistillationCampaignClosures, DISTILLATION_CAMPAIGN_CLOSURE_PROFILE } from '../lib/ai/cos/cosUniversityDistillationCampaignClosure.ts'

const now = new Date('2026-09-17T20:00:00.000Z')
const campaign = (id: string, status: string, expiresAt: string, authorizedAt = '2026-09-17T10:00:00.000Z') =>
  ({ id, status, expiresAt, authorizedAt })

test('an expired campaign is closed by what its runs actually did', () => {
  const closures = decideDistillationCampaignClosures({
    now,
    campaigns: [
      campaign('all-complete', 'active', '2026-09-17T19:00:00.000Z', '2026-09-17T09:00:00.000Z'),
      campaign('partial', 'authorized', '2026-09-17T19:00:00.000Z', '2026-09-17T09:30:00.000Z'),
      campaign('none', 'authorized', '2026-09-17T19:00:00.000Z', '2026-09-17T09:45:00.000Z'),
    ],
    runs: [
      { campaignId: 'all-complete', stage: 'complete' },
      { campaignId: 'partial', stage: 'complete' },
      { campaignId: 'partial', stage: 'training_dispatched' },
      { campaignId: 'none', stage: 'failed' },
    ],
  })
  assert.deepEqual(closures.map(closure => [closure.campaignId, closure.status, closure.reason]), [
    ['all-complete', 'completed', 'all_runs_complete_at_expiry'],
    ['partial', 'expired', 'expired_with_partial_runs'],
    ['none', 'failed', 'expired_without_a_complete_run'],
  ])
})

test('live campaigns and already-terminal campaigns are never touched', () => {
  const closures = decideDistillationCampaignClosures({
    now,
    campaigns: [
      campaign('live', 'active', '2026-09-17T23:00:00.000Z'),
      campaign('done', 'completed', '2026-09-17T18:00:00.000Z'),
      campaign('cancelled', 'cancelled', '2026-09-17T18:00:00.000Z'),
      campaign('malformed', 'active', 'not-a-date'),
    ],
    runs: [],
  })
  assert.deepEqual(closures, [])
})

test('a campaign with no run at all is closed as failed, and the batch limit is respected', () => {
  const many = Array.from({ length: 12 }, (_, index) => campaign(`c${index}`, 'authorized', '2026-09-17T19:00:00.000Z', `2026-09-17T0${index % 10}:00:00.000Z`))
  const closures = decideDistillationCampaignClosures({ now, campaigns: many, runs: [], maxClosures: 4 })
  assert.equal(closures.length, 4)
  assert.ok(closures.every(closure => closure.status === 'failed' && closure.runs === 0))
})

test('closure runs in the workflow, records why, and authorizes no retry or traffic', () => {
  const consumer = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationConsumer.ts', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationWorkflow.ts', import.meta.url), 'utf8')
  const terminalCleanup = readFileSync(new URL('../lib/ai/cos/cosUniversityMassDistillationTerminalCleanup.ts', import.meta.url), 'utf8')
  assert.match(consumer, /export async function closeExpiredMassDistillationCampaigns/)
  assert.match(consumer, /\.in\('status', \['authorized', 'active'\]\)\n\s+\.lt\('expires_at', now\.toISOString\(\)\)/)
  assert.match(consumer, /claim: 'mass_distillation_campaign_closed'/)
  assert.match(consumer, /retryAuthorized: false,\n\s+trafficAuthorized: false,/)
  assert.match(workflow, /const campaignClosure = await isolatedStep\('campaign_closure', \(\) =>\s*closeExpiredMassDistillationCampaigns\(\{ now, maxCampaigns: 10 \}\)\)/)
  assert.ok(workflow.indexOf("isolatedStep('campaign_closure'") < workflow.indexOf("isolatedStep('provider_reconciliation'"), 'campaign closure must run before provider reconciliation')
  assert.match(workflow, /async function isolatedStep/)
  assert.match(workflow, /\[cos-university-mass-distillation-step\]/)
  assert.match(workflow, /&& campaignClosure\.ok === true/)
  assert.match(terminalCleanup, /\.eq\('status', 'failed'\)/)
  assert.match(terminalCleanup, /\.not\('stage', 'in', '\(\"complete\",\"failed\"\)'\)/)
  assert.match(terminalCleanup, /failure_reason: reason/)
  assert.match(terminalCleanup, /retryAuthorized: false/)
  assert.match(terminalCleanup, /dispatchAuthorized: false/)
  assert.match(terminalCleanup, /productionTrafficAuthorized: false/)
  assert.match(workflow, /const terminalCleanup = await isolatedStep\('terminal_cleanup', \(\) =>\s*terminalizeFailedMassDistillationCampaignRuns\(\{ maxCampaigns: 5 \}\)\)/)
  assert.ok(workflow.indexOf('authorizeNextUniversityMassDistillationCampaign') < workflow.indexOf("isolatedStep('semantic_reconciliation'"), 'authorization must precede semantic maintenance')
  assert.ok(workflow.indexOf('runMassDistillationCampaignConsumer({ now, maxDispatches: 3 })') < workflow.indexOf("isolatedStep('semantic_reconciliation'"), 'provider dispatch must precede semantic maintenance')
  assert.ok(workflow.indexOf('runMassDistillationCampaignConsumer({ now, maxDispatches: 3 })') < workflow.indexOf('prepareUniversityMassDistillationCurriculum(now'), 'provider dispatch must precede curriculum maintenance')
  assert.match(workflow, /&& terminalCleanup\.ok === true/)
  assert.equal(DISTILLATION_CAMPAIGN_CLOSURE_PROFILE, 'cos-university-distillation-campaign-closure-v1')
})


test('terminal cleanup quarantines already-consumed prepared batches from failed campaigns', () => {
  const cleanup = source('../lib/ai/cos/cosUniversityMassDistillationTerminalCleanup.ts')
  assert.match(cleanup, /mass_distillation_failed_batch_quarantined/)
  assert.match(cleanup, /\.eq\('stage', 'failed'\)/)
  assert.match(cleanup, /status: 'quarantined'/)
  assert.match(cleanup, /\.eq\('status', 'prepared'\)/)
  assert.match(cleanup, /reusablePreparedInventory: false/)
  assert.match(cleanup, /quarantinedBatches/)
  assert.doesNotMatch(cleanup, /dispatch_authorized:\s*true/)
})
