import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveStrategyProfile } from '../lib/ai/cos/strategyProfile.ts'
import { createEnterpriseMemoryCandidates } from '../lib/enterprise/memory/retriever.ts'
import { rankEnterpriseMemoryCandidates } from '../lib/enterprise/memory/retrievalRanking.ts'

function learnedProfile() {
  const measured = [
    ...Array.from({ length: 5 }, (_, index) => ({
      campaign_id: `winner-${index}`,
      channel: 'email',
      cta: 'book-demo',
      creative: 'proof-led',
      execution_status: 'measured',
      human_edits: {},
      performance_data: {
        performanceScore: 0.9,
        metrics: { impressions: 100, clicks: 20, revenue: 1000 },
      },
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      campaign_id: `runner-${index}`,
      channel: 'linkedin',
      cta: 'learn-more',
      creative: 'brand-led',
      execution_status: 'measured',
      human_edits: {},
      performance_data: {
        performanceScore: 0.5,
        metrics: { impressions: 100, clicks: 10, revenue: 500 },
      },
    })),
  ]
  return deriveStrategyProfile(measured, { now: new Date('2026-08-22T22:30:00.000Z') })
}

test('requested current strategy profile outranks a high-scoring historical campaign', () => {
  const candidates = createEnterpriseMemoryCandidates({
    strategyProfile: learnedProfile(),
    campaigns: [{
      campaign_id: 'historical-best',
      channel: 'linkedin',
      cta: 'legacy-cta',
      creative: 'legacy-creative',
      approval_decision: 'approved',
      approved_at: '2026-08-22T22:29:00.000Z',
      confidence: { copy: 1 },
      performance_data: { score: 1 },
    }],
  })

  const ranked = rankEnterpriseMemoryCandidates(candidates, {
    taskTags: ['generate', 'content', 'current', 'strategy', 'profile', 'weights', 'explain', 'heuristics'],
    now: Date.parse('2026-08-22T22:30:00.000Z'),
  })

  assert.equal(ranked[0].kind, 'strategy_profile')
  assert.ok(ranked[0].reasons.includes('current_strategy_profile'))
})

test('strategy payload exposes learned overrides and the exact behavior-change heuristics', () => {
  const strategy = createEnterpriseMemoryCandidates({ strategyProfile: learnedProfile() })
    .find(candidate => candidate.kind === 'strategy_profile')

  assert.ok(strategy)
  assert.deepEqual(strategy.payload.appliedOverrides, {
    channel: 'email',
    cta: 'book-demo',
    creative: 'proof-led',
  })
  assert.deepEqual(strategy.payload.heuristics, {
    minimumCampaignsPerVariant: 5,
    minimumRelativeMargin: 0.2,
    minimumApprovedForReworkRate: 8,
    rule: 'Apply only dimensions whose status is learned. For insufficient_evidence or no_clear_winner, keep the existing generation default.',
  })
  assert.match(String(strategy.payload.sourceOfTruth), /not provider\/base-model weights/i)
  assert.match(String(strategy.payload.generationInstruction), /generate the content now/i)

  const directive = String(strategy.payload.directive)
  assert.ok(directive.length <= 850, `strategy directive must survive the 850-character Enterprise Memory injection cap; got ${directive.length}`)
  assert.match(directive, /Generate the requested content now/i)
  assert.match(directive, /channel=email/)
  assert.match(directive, />=5 measured campaigns/)
  assert.match(directive, /winner margin >=20%/)
})

test('a strategy-profile read error is surfaced as the real failure instead of invented missing configuration', () => {
  const strategy = createEnterpriseMemoryCandidates({
    strategyProfileError: 'enterprise_campaign_memory read failed: timeout',
  }).find(candidate => candidate.kind === 'strategy_profile')

  assert.ok(strategy)
  assert.equal(strategy.payload.status, 'unavailable')
  assert.equal(strategy.payload.error, 'enterprise_campaign_memory read failed: timeout')
  assert.match(String(strategy.payload.directive), /CURRENT STRATEGY PROFILE UNAVAILABLE/)
  assert.match(String(strategy.payload.generationInstruction), /do not invent strategy weights/i)
})
