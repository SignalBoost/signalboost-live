import assert from 'node:assert/strict'
import test from 'node:test'
import { pressCampaignBucketOf } from '@/lib/marketing/pressCampaignBuckets'

test('submitted and scheduled campaigns are sent, not merely approved', () => {
  assert.equal(pressCampaignBucketOf({ status: 'approved', dispatch_state: 'submitted' }), 'sent')
  assert.equal(pressCampaignBucketOf({ status: 'approved', dispatch_state: 'scheduled' }), 'sent')
})

test('published campaigns have their own bucket', () => {
  assert.equal(pressCampaignBucketOf({ status: 'published', dispatch_state: 'published' }), 'published')
  assert.equal(pressCampaignBucketOf({ status: 'approved', published_url: 'https://example.com/story' }), 'published')
})

test('approved but undispatched campaigns remain approved', () => {
  assert.equal(pressCampaignBucketOf({ status: 'approved' }), 'approved')
})

test('pending and rejected states remain unchanged', () => {
  assert.equal(pressCampaignBucketOf({ status: 'pending_owner_review' }), 'pending')
  assert.equal(pressCampaignBucketOf({ status: 'rejected' }), 'rejected')
})
