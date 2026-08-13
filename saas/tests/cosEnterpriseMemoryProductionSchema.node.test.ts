import assert from 'node:assert/strict'
import test from 'node:test'
import { createEnterpriseMemoryCandidates } from '../lib/enterprise/memory/retriever.ts'
import { citedKnowledgeEvidenceCount } from '../lib/ai/cos/groundingConfidence.ts'

test('production 0-100 confidence and embedded campaign approval map correctly', () => {
  const candidates = createEnterpriseMemoryCandidates({
    organization: {
      id: 'org-1',
      canonical_domain: 'saas.signalboostapp.com',
      name: 'SignalBoost AI',
      industry: 'Marketing technology',
      confidence: 82,
      profile_refreshed_at: '2026-08-10T15:56:32.257Z',
      profile: { description: 'AI marketing platform' },
    },
    campaigns: [{
      id: 'row-1',
      campaign_id: 'campaign-1',
      workspace: 'campaign-studio',
      objective: 'awareness',
      selected_audience: 'small business',
      channel: 'linkedin',
      cta: 'See the platform',
      approval_decision: 'approved',
      approved_at: '2026-08-10T12:00:00.000Z',
      approved_version: { cta: 'See the platform' },
      approval_evidence: 'Owner approved',
      confidence: { copy: 85, audience: 72 },
      performance: { score: 0.7 },
      created_at: '2026-08-10T11:00:00.000Z',
    }],
    confidence: [{
      id: 'confidence-1',
      workspace: 'campaign-studio',
      confidence: { industry: 82, audience: 65, goal: 72 },
      recorded_at: '2026-07-27T14:45:30.596Z',
    }],
  })

  const organization = candidates.find(candidate => candidate.kind === 'organization')
  const campaign = candidates.find(candidate => candidate.kind === 'campaign')
  const approval = candidates.find(candidate => candidate.kind === 'approval')
  const confidence = candidates.find(candidate => candidate.kind === 'confidence')

  assert.equal(organization?.confidence, 0.82)
  assert.equal(campaign?.approved, true)
  assert.equal(campaign?.performanceScore, 0.7)
  assert.equal(approval?.approved, true)
  assert.equal(approval?.payload.evidence, 'Owner approved')
  assert.ok((confidence?.confidence ?? 0) > 0.7 && (confidence?.confidence ?? 0) < 0.8)
  assert.equal(confidence?.occurredAt, '2026-07-27T14:45:30.596Z')
})

test('repository production snapshot JSON is used when legacy top-level fields are absent', () => {
  const candidates = createEnterpriseMemoryCandidates({
    repositories: [{
      id: 'repo-1',
      repo_owner: 'SignalBoost',
      repo_name: 'signalboost-live',
      default_branch: 'main',
      commit_sha: 'abc123',
      confidence: 0.91,
      analyzed_at: '2026-08-13T12:00:00.000Z',
      snapshot: {
        primaryLanguages: ['TypeScript'],
        frameworks: ['Next.js'],
        productDescriptions: ['SignalBoost AI'],
        topics: ['marketing', 'sales'],
      },
    }],
  })

  const repository = candidates.find(candidate => candidate.kind === 'repository')
  assert.deepEqual(repository?.payload.primaryLanguages, ['TypeScript'])
  assert.deepEqual(repository?.payload.frameworks, ['Next.js'])
  assert.deepEqual(repository?.payload.productDescriptions, ['SignalBoost AI'])
  assert.equal(repository?.payload.lastAnalyzedCommitSha, 'abc123')
})

test('cited organization memory can earn factual grounding while saved user memory cannot', () => {
  assert.equal(citedKnowledgeEvidenceCount({ kg: 0, cl: 0, oem: 1 }), 1)
  assert.equal(citedKnowledgeEvidenceCount({ kg: 0, cl: 0 }), 0)
})
