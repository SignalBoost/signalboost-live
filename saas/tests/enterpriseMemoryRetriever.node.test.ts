import assert from 'node:assert/strict'
import test from 'node:test'
import { createEnterpriseMemoryCandidates } from '../lib/enterprise/memory/retriever.ts'
import { rankEnterpriseMemoryCandidates } from '../lib/enterprise/memory/retrievalRanking.ts'
import { deriveStrategyProfile } from '../lib/ai/cos/strategyProfile.ts'

const NOW = Date.parse('2026-07-18T12:00:00.000Z')

test('retriever maps organization, repository, campaign, approval, and confidence memory', () => {
  const candidates = createEnterpriseMemoryCandidates({
    organization: {
      id: 'org-1',
      name: 'SignalBoostAi',
      canonical_domain: 'signalboostapp.com',
      industry: 'Marketing technology',
      confidence: 0.9,
      profile_refreshed_at: '2026-07-18T10:00:00.000Z',
      profile: { description: 'AI marketing platform' },
    },
    repositories: [{
      id: 'repo-1',
      repo_owner: 'SignalBoost',
      repo_name: 'signalboost-live',
      intelligence_confidence: 0.8,
      analyzed_at: '2026-07-18T09:00:00.000Z',
      primary_languages: ['TypeScript'],
      frameworks: ['Next.js'],
      topics: ['marketing'],
    }],
    campaigns: [{
      campaign_id: 'campaign-1',
      workspace: 'campaign-studio',
      objective: 'awareness',
      selected_audience: 'small business',
      channel: 'linkedin',
      cta: 'Start your free trial',
      creative: 'Product demonstration',
      approval_decision: 'approved',
      approved_at: '2026-07-18T11:00:00.000Z',
      confidence: { copy: 0.85 },
      performance_data: { score: 0.7 },
    }],
    approvals: [{
      id: 'approval-1',
      campaign_id: 'campaign-1',
      decision: 'approved',
      created_at: '2026-07-18T11:05:00.000Z',
      approved_version: { cta: 'Start your free trial' },
    }],
    confidence: [{
      id: 'confidence-1',
      workspace: 'campaign-studio',
      confidence: { industry: 0.9, audience: 0.8 },
      created_at: '2026-07-18T10:30:00.000Z',
    }],
  })

  assert.deepEqual(new Set(candidates.map(candidate => candidate.kind)), new Set([
    'organization', 'repository', 'campaign', 'approval', 'confidence',
  ]))
  const campaign = candidates.find(candidate => candidate.kind === 'campaign')
  assert.equal(campaign?.approved, true)
  assert.equal(campaign?.payload.cta, 'Start your free trial')
})

test('ranked unified context favors approved relevant campaign memory', () => {
  const candidates = createEnterpriseMemoryCandidates({
    campaigns: [
      {
        campaign_id: 'approved-linkedin',
        workspace: 'campaign-studio',
        channel: 'linkedin',
        objective: 'awareness',
        approval_decision: 'approved',
        approved_at: '2026-07-18T11:00:00.000Z',
        confidence: { copy: 0.8 },
      },
      {
        campaign_id: 'unapproved-email',
        workspace: 'store',
        channel: 'email',
        objective: 'sales',
        approval_decision: '',
        updated_at: '2026-07-18T11:30:00.000Z',
        confidence: { copy: 0.95 },
      },
    ],
  })

  const ranked = rankEnterpriseMemoryCandidates(candidates, {
    workspace: 'campaign-studio',
    taskTags: ['linkedin', 'awareness'],
    now: NOW,
  })

  assert.equal(ranked[0].id, 'approved-linkedin')
  assert.ok(ranked[0].reasons.includes('human_approved'))
  assert.ok(ranked[0].reasons.includes('workspace_match'))
})

test('malformed rows are sanitized and empty identities are ignored', () => {
  const candidates = createEnterpriseMemoryCandidates({
    organization: { id: '', profile: 'not-an-object' },
    repositories: [{ repo_owner: '', repo_name: '', frameworks: 'not-an-array' }],
    campaigns: [{ campaign_id: '', confidence: 'bad', performance_data: 'bad' }],
    approvals: [{ id: '', campaign_id: '', created_at: '' }],
    confidence: [{ id: '', workspace: '', created_at: '' }],
  })

  assert.deepEqual(candidates, [])
})

test('intelligence snapshots remain bounded sanitized payloads', () => {
  const candidates = createEnterpriseMemoryCandidates({
    intelligence: [{
      id: 'snapshot-1',
      workspace: 'business',
      snapshot: { classification: { industry: 'Retail' }, campaignPlan: { goal: 'sales' } },
      confidence: { industry: 2, audience: -1, goal: 0.5 },
      analyzed_at: '2026-07-18T08:00:00.000Z',
      schema_version: 2,
    }],
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'intelligence')
  assert.equal(candidates[0].confidence, 0.75)
  assert.equal(candidates[0].payload.schemaVersion, 2)
})

test('current strategy profile becomes auditable generation context', () => {
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
  const profile = deriveStrategyProfile(measured, { now: new Date('2026-07-18T12:00:00.000Z') })
  const candidates = createEnterpriseMemoryCandidates({ strategyProfile: profile })
  const strategy = candidates.find(candidate => candidate.kind === 'strategy_profile')

  assert.ok(strategy)
  assert.equal(strategy.payload.status, 'available')
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

  const ranked = rankEnterpriseMemoryCandidates(candidates, {
    taskTags: ['strategy', 'profile', 'weights', 'heuristics'],
    now: NOW,
  })
  assert.equal(ranked[0].kind, 'strategy_profile')
})

test('strategy profile read failures become concrete context rather than invented missing weights', () => {
  const candidates = createEnterpriseMemoryCandidates({
    strategyProfileError: 'enterprise_campaign_memory read failed: timeout',
  })
  const strategy = candidates.find(candidate => candidate.kind === 'strategy_profile')
  assert.equal(strategy?.payload.status, 'unavailable')
  assert.equal(strategy?.payload.error, 'enterprise_campaign_memory read failed: timeout')
})
