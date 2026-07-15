// saas/tests/approvalBinding.node.test.ts
//
// Issue #205 Section 6.2 — approval version-binding guarantees.
// Pins the security property that a campaign approved with content C1 cannot be
// published after being changed to C2 while the approved flag is left in place.
// Volatile production bookkeeping (render status, attempt counts) must NOT break
// a valid approval. Pure functions, no DB, no network.
//
// Run: node --test tests/approvalBinding.node.test.ts

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  computeCampaignContentHash,
  verifyApprovalBinding,
  withApprovalBinding,
} from '../lib/cos/campaign-queue/approvalBinding.ts'

function baseCampaign() {
  return {
    objective: 'Explain the problem then present the solution.',
    title: 'Launch announcement',
    channel: 'linkedin',
    languages: ['en', 'es'],
    work_items: [
      { input: { language: 'en' }, output: { draft: 'English draft', title: 'EN title' } },
      { input: { language: 'es' }, output: { draft: 'Spanish draft', title: 'ES title' } },
    ],
    metadata: {},
  }
}

function approve(campaign: any) {
  const contentHash = computeCampaignContentHash(campaign)
  return { ...campaign, metadata: withApprovalBinding(campaign.metadata, { approvedBy: 'owner-1', contentHash }) }
}

test('approved-then-unchanged content passes the gate', () => {
  const approved = approve(baseCampaign())
  assert.equal(verifyApprovalBinding(approved).ok, true)
})

test('editing a draft after approval invalidates the binding', () => {
  const approved = approve(baseCampaign())
  approved.work_items[0].output.draft = 'SNEAKY replaced draft'
  const check = verifyApprovalBinding(approved)
  assert.equal(check.ok, false)
  assert.match((check as any).reason, /changed after approval/i)
})

test('swapping the final video URL after approval invalidates the binding', () => {
  const c = baseCampaign()
  c.channel = 'youtube'
  c.languages = ['en']
  c.work_items = [{ input: { language: 'en' }, output: { draft: 'd', title: 't' } }]
  c.metadata = { video: { branded: true, voicedUrl: 'https://cdn/good.mp4' } }
  const approved = approve(c)
  assert.equal(verifyApprovalBinding(approved).ok, true)
  approved.metadata.video.voicedUrl = 'https://cdn/EVIL.mp4'
  assert.equal(verifyApprovalBinding(approved).ok, false)
})

test('volatile production bookkeeping does NOT break a valid approval', () => {
  const approved = approve(baseCampaign())
  // Pipeline updates that must not invalidate approval:
  approved.metadata.video = { ...(approved.metadata.video || {}), status: 'ready', brandAttempts: { en: 3 }, brandedAt: '2026-07-14T00:00:00Z' }
  approved.metadata.readiness = { score: 9 }
  assert.equal(verifyApprovalBinding(approved).ok, true)
})

test('a campaign with no approval binding is refused', () => {
  const check = verifyApprovalBinding(baseCampaign())
  assert.equal(check.ok, false)
  assert.match((check as any).reason, /no approval binding/i)
})

test('changing objective or channel after approval invalidates the binding', () => {
  const a = approve(baseCampaign())
  a.objective = 'Different objective'
  assert.equal(verifyApprovalBinding(a).ok, false)
  const b = approve(baseCampaign())
  b.channel = 'youtube'
  assert.equal(verifyApprovalBinding(b).ok, false)
})
