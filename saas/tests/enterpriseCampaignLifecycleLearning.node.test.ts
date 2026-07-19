import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildApprovedLifecyclePayload,
  buildMeasuredLifecyclePayload,
  buildPublishedLifecyclePayload,
  resolveCampaignLifecycleIdentity,
} from '../lib/enterprise/memory/lifecycleLearning.ts'

const campaign = {
  id: 'campaign-1',
  title: 'Launch',
  objective: 'Increase qualified traffic',
  channel: 'linkedin',
  work_items: [{ output: { draft: 'Approved copy' } }],
  metadata: {
    enterprise: { organizationId: 'org-1', workspace: 'campaign-studio' },
    editRequests: [{ comments: 'Use a stronger CTA' }],
    tracking_url: 'https://example.test/api/track?id=1',
  },
}

test('resolves bounded Enterprise identity from campaign metadata', () => {
  assert.deepEqual(resolveCampaignLifecycleIdentity(campaign), {
    organizationId: 'org-1',
    campaignId: 'campaign-1',
    workspace: 'campaign-studio',
  })
})

test('missing Enterprise identity is a safe no-op signal', () => {
  assert.equal(resolveCampaignLifecycleIdentity({ id: 'campaign-1', metadata: {} }), null)
})

test('approval payload preserves owner edits and exact approved version', () => {
  const payload = buildApprovedLifecyclePayload(campaign)
  assert.equal(payload.executionStatus, 'approved')
  assert.equal((payload.humanEdits.editRequests as any[]).length, 1)
  assert.equal((payload.approvedVersion as any).title, 'Launch')
})

test('publication payload records live creative and CTA evidence', () => {
  const payload = buildPublishedLifecyclePayload(campaign, {
    videoUrl: 'https://cdn.example/video.mp4',
    result: { liveUrl: 'https://social.example/post/1' },
  })
  assert.equal(payload.executionStatus, 'published')
  assert.equal(payload.creative, 'https://cdn.example/video.mp4')
  assert.match(payload.cta, /api\/track/)
})

test('measurement payload aggregates only non-negative views', () => {
  const payload = buildMeasuredLifecyclePayload(campaign, {
    performance: {
      linkedin: { viewCount: 120 },
      youtube: { viewCount: -50 },
      bad: { viewCount: 'not-a-number' },
    },
    traffic: { clicks: 9 },
    cost: { total: 4 },
    measuredAt: '2026-07-18T12:00:00.000Z',
  })
  assert.equal(payload.executionStatus, 'measured')
  assert.deepEqual((payload.performanceData as any).metrics, {
    impressions: 120,
    clicks: 9,
    revenue: 0,
    cost: 4,
  })
})
