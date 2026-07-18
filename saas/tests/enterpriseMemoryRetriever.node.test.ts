import assert from 'node:assert/strict'
import test from 'node:test'
import { createEnterpriseMemoryCandidates } from '../lib/enterprise/memory/retriever.ts'
import { rankEnterpriseMemoryCandidates } from '../lib/enterprise/memory/retrievalRanking.ts'

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
