import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appliedStrategyOverrides,
  deriveStrategyProfile,
  MINIMUM_CAMPAIGNS_PER_VARIANT,
  MINIMUM_RELATIVE_MARGIN,
  type CampaignOutcomeRow,
} from '../lib/ai/cos/strategyProfile.ts'

const now = new Date('2026-08-19T12:00:00.000Z')

function measured(count: number, fields: { channel: string; cta: string; creative: string }, metrics: { impressions: number; clicks: number; revenue?: number; cost?: number }, score: number, idPrefix: string): CampaignOutcomeRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    campaign_id: `${idPrefix}-${index}`,
    channel: fields.channel,
    cta: fields.cta,
    creative: fields.creative,
    execution_status: 'measured',
    human_edits: {},
    performance_data: {
      metrics: { impressions: metrics.impressions, clicks: metrics.clicks, revenue: metrics.revenue ?? 0, cost: metrics.cost ?? 0 },
      performanceScore: score,
    },
  }))
}

test('no rows at all recommends nothing and says so', () => {
  const profile = deriveStrategyProfile([], { now })
  assert.equal(profile.measuredCampaigns, 0)
  assert.equal(profile.changesBehavior, false)
  assert.match(profile.summary, /NO MEASURED OUTCOMES/)
  assert.deepEqual(appliedStrategyOverrides(profile), {})
})

test('unmeasured campaigns never influence a recommendation', () => {
  const drafts: CampaignOutcomeRow[] = Array.from({ length: 40 }, (_unused, index) => ({
    campaign_id: `draft-${index}`,
    channel: 'linkedin',
    cta: 'book a demo',
    creative: 'bold',
    execution_status: 'draft',
    performance_data: {},
  }))
  const profile = deriveStrategyProfile(drafts, { now })
  assert.equal(profile.totalCampaigns, 40)
  assert.equal(profile.measuredCampaigns, 0)
  assert.equal(profile.unmeasuredCampaigns, 40)
  assert.equal(profile.changesBehavior, false)
})

test('a row flagged measured but carrying no numbers is observation, not evidence', () => {
  const empty: CampaignOutcomeRow[] = Array.from({ length: 12 }, (_unused, index) => ({
    campaign_id: `hollow-${index}`,
    channel: 'x',
    cta: 'y',
    creative: 'z',
    execution_status: 'measured',
    performance_data: { metrics: { impressions: 0, clicks: 0, revenue: 0, cost: 0 }, performanceScore: 0 },
  }))
  const profile = deriveStrategyProfile(empty, { now })
  assert.equal(profile.measuredCampaigns, 0)
})

test('one option with plenty of data and no alternative is insufficient evidence, not a winner', () => {
  const rows = measured(20, { channel: 'linkedin', cta: 'book a demo', creative: 'bold' }, { impressions: 1000, clicks: 40 }, 0.3, 'solo')
  const profile = deriveStrategyProfile(rows, { now })
  const channel = profile.dimensions.find(d => d.dimension === 'channel')
  assert.equal(channel.status, 'insufficient_evidence')
  assert.equal(channel.recommended, null)
  assert.match(channel.reason, /never tested against an alternative/)
})

test('a variant below the sample minimum cannot win however well it scored', () => {
  const rows = [
    ...measured(MINIMUM_CAMPAIGNS_PER_VARIANT + 5, { channel: 'linkedin', cta: 'a', creative: 'p' }, { impressions: 1000, clicks: 30 }, 0.30, 'many'),
    ...measured(1, { channel: 'tiktok', cta: 'b', creative: 'q' }, { impressions: 100, clicks: 60 }, 0.95, 'lucky'),
  ]
  const profile = deriveStrategyProfile(rows, { now })
  const channel = profile.dimensions.find(d => d.dimension === 'channel')
  assert.notEqual(channel.recommended, 'tiktok')
  assert.equal(channel.status, 'insufficient_evidence')
})

test('a lead too small to be a real difference is no_clear_winner, not a recommendation', () => {
  const rows = [
    ...measured(10, { channel: 'linkedin', cta: 'a', creative: 'p' }, { impressions: 1000, clicks: 32 }, 0.32, 'li'),
    ...measured(10, { channel: 'x', cta: 'b', creative: 'q' }, { impressions: 1000, clicks: 30 }, 0.30, 'x'),
  ]
  const profile = deriveStrategyProfile(rows, { now })
  const channel = profile.dimensions.find(d => d.dimension === 'channel')
  assert.equal(channel.status, 'no_clear_winner')
  assert.equal(channel.recommended, null)
  assert.ok(channel.relativeMargin < MINIMUM_RELATIVE_MARGIN)
  assert.deepEqual(appliedStrategyOverrides(profile), {})
})

test('a decisive, well-sampled difference is learned and appears in the overrides', () => {
  const rows = [
    ...measured(10, { channel: 'linkedin', cta: 'book a demo', creative: 'bold' }, { impressions: 1000, clicks: 60 }, 0.60, 'li'),
    ...measured(10, { channel: 'x', cta: 'learn more', creative: 'soft' }, { impressions: 1000, clicks: 20 }, 0.20, 'x'),
  ]
  const profile = deriveStrategyProfile(rows, { now })
  const channel = profile.dimensions.find(d => d.dimension === 'channel')
  assert.equal(channel.status, 'learned')
  assert.equal(channel.recommended, 'linkedin')
  assert.equal(profile.changesBehavior, true)
  assert.deepEqual(appliedStrategyOverrides(profile), { channel: 'linkedin', cta: 'book a demo', creative: 'bold' })
  assert.ok(channel.variants[0].campaignIds.length > 0)
})

test('a variant with no impressions reports a null click-through rate, not zero', () => {
  const rows = [
    ...measured(6, { channel: 'linkedin', cta: 'a', creative: 'p' }, { impressions: 0, clicks: 0, revenue: 500 }, 0.15, 'rev'),
    ...measured(6, { channel: 'x', cta: 'b', creative: 'q' }, { impressions: 1000, clicks: 20 }, 0.20, 'x'),
  ]
  const profile = deriveStrategyProfile(rows, { now })
  const channel = profile.dimensions.find(d => d.dimension === 'channel')
  const revenueOnly = channel.variants.find(v => v.variant === 'linkedin')
  assert.equal(revenueOnly.clickThroughRate, null)
})

test('an approved unchanged draft is not counted as rework', () => {
  const rows: CampaignOutcomeRow[] = [
    ...Array.from({ length: 10 }, (_unused, index) => ({
      campaign_id: `clean-${index}`,
      execution_status: 'approved',
      human_edits: {},
    })),
    ...Array.from({ length: 5 }, (_unused, index) => ({
      campaign_id: `edited-${index}`,
      execution_status: 'approved',
      human_edits: { cta: 'rewritten by hand' },
    })),
  ]
  const profile = deriveStrategyProfile(rows, { now })
  assert.equal(profile.rework.status, 'learned')
  assert.equal(profile.rework.approvedCampaigns, 15)
  assert.equal(profile.rework.campaignsRequiringEdits, 5)
  assert.equal(profile.rework.reworkRate, 0.3333)
})

test('a rework rate is withheld below the approved-campaign minimum', () => {
  const rows: CampaignOutcomeRow[] = [
    { campaign_id: 'a', execution_status: 'approved', human_edits: { cta: 'x' } },
    { campaign_id: 'b', execution_status: 'approved', human_edits: {} },
  ]
  const profile = deriveStrategyProfile(rows, { now })
  assert.equal(profile.rework.status, 'insufficient_evidence')
  assert.equal(profile.rework.reworkRate, null)
})
