import assert from 'node:assert/strict'
import test from 'node:test'
import { selectApprovedCampaignReuse } from '../lib/enterprise/memory/campaignReuse.ts'

const rows = [
  {
    campaign_id: 'old-approved',
    workspace: 'campaign-studio',
    objective: 'Awareness',
    cta: 'Start free',
    creative: 'Product demo',
    approval_decision: 'approved',
    approved_at: '2026-06-01T00:00:00.000Z',
  },
  {
    campaign_id: 'new-approved',
    workspace: 'campaign-studio',
    objective: 'Conversion',
    cta: 'Start your free trial',
    creative: 'Authority and proof',
    approval_decision: 'approved',
    approved_at: '2026-07-01T00:00:00.000Z',
  },
  {
    campaign_id: 'rejected',
    workspace: 'campaign-studio',
    cta: 'Buy now',
    creative: 'Hard sell',
    approval_decision: 'rejected',
    approved_at: '2026-07-10T00:00:00.000Z',
  },
  {
    campaign_id: 'other-workspace',
    workspace: 'store',
    cta: 'Shop now',
    creative: 'Commerce',
    approval_decision: 'approved',
    approved_at: '2026-07-12T00:00:00.000Z',
  },
]

test('reuses only approved campaigns from the requested workspace', () => {
  const result = selectApprovedCampaignReuse(rows, 'campaign-studio')
  assert.deepEqual(result.map(item => item.campaignId), ['new-approved', 'old-approved'])
})

test('orders approved campaign memory newest first', () => {
  const result = selectApprovedCampaignReuse(rows, 'campaign-studio')
  assert.equal(result[0].cta, 'Start your free trial')
  assert.equal(result[1].cta, 'Start free')
})

test('ignores approved rows that contain no reusable CTA or creative', () => {
  const result = selectApprovedCampaignReuse([
    { campaign_id: 'empty', workspace: 'campaign-studio', approval_decision: 'approved' },
  ], 'campaign-studio')
  assert.deepEqual(result, [])
})

test('allows legacy approved rows with no workspace', () => {
  const result = selectApprovedCampaignReuse([
    { campaign_id: 'legacy', workspace: '', cta: 'Learn more', approval_decision: 'approved' },
  ], 'campaign-studio')
  assert.equal(result[0].campaignId, 'legacy')
})

test('enforces a bounded result limit', () => {
  assert.throws(() => selectApprovedCampaignReuse(rows, 'campaign-studio', 0))
  assert.throws(() => selectApprovedCampaignReuse(rows, 'campaign-studio', 21))
  assert.equal(selectApprovedCampaignReuse(rows, 'campaign-studio', 1).length, 1)
})
