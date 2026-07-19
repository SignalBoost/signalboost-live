import assert from 'node:assert/strict'
import test from 'node:test'

import {
  approvalArtifactKey,
  buildRearmedVideo,
  evaluateCampaignForApprovalRearm,
  stableArtifactDescriptor,
} from '../scripts/cos-video-approval-rearm.mjs'

const NOW = new Date('2026-07-19T12:00:00.000Z')

function campaign(overrides = {}) {
  const video = {
    status: 'ready',
    branded: true,
    voicedUrl: 'https://storage.test/object.mp4?token=old',
    finalUrl: 'https://storage.test/object.mp4?token=old',
    approvalRequestedAt: '2026-07-19T10:00:00.000Z',
    approvalNotification: { ok: true, email: 'owner@example.test' },
    brandBannerUpgradedAt: '2026-07-19T11:00:00.000Z',
    finalSchemaVersion: 'final-v2',
    brandBannerSchemaVersion: 'banner-v2',
    brandDebug: { objectPath: 'cos-final/campaign/pt-prominent-banner-1.mp4' },
    ...(overrides.video || {}),
  }

  return {
    id: 'campaign-1',
    channel: 'youtube',
    status: 'waiting_approval',
    approved_at: null,
    approved_by: null,
    updated_at: '2026-07-19T11:00:01.000Z',
    metadata: { video, ...(overrides.metadata || {}) },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['video', 'metadata'].includes(key))),
  }
}

test('stable artifact identity prefers object path and ignores signed URL rotation', () => {
  const first = campaign().metadata.video
  const second = { ...first, finalUrl: 'https://storage.test/object.mp4?token=new', voicedUrl: 'https://storage.test/object.mp4?token=new' }
  assert.equal(stableArtifactDescriptor(first).field, 'brandDebug.objectPath')
  assert.equal(approvalArtifactKey(first), approvalArtifactKey(second))
})

test('same permanent path has one identity when its metadata field changes', () => {
  const first = campaign().metadata.video
  const moved = {
    ...first,
    brandDebug: {},
    voiceObjectPath: first.brandDebug.objectPath,
  }
  assert.equal(stableArtifactDescriptor(first).field, 'brandDebug.objectPath')
  assert.equal(stableArtifactDescriptor(moved).field, 'voiceObjectPath')
  assert.equal(approvalArtifactKey(first), approvalArtifactKey(moved))
})

test('URL fallback removes signed query and fragment from artifact identity', () => {
  const first = campaign({ video: { brandDebug: {}, finalUrl: 'https://storage.test/cos-final/item.mp4?token=one#x' } }).metadata.video
  const second = { ...first, finalUrl: 'https://storage.test/cos-final/item.mp4?token=two#y' }
  assert.equal(stableArtifactDescriptor(first).value, 'https://storage.test/cos-final/item.mp4')
  assert.equal(approvalArtifactKey(first), approvalArtifactKey(second))
})

test('unchanged or older final artifacts do not re-arm approval email', () => {
  const row = campaign({ video: { brandBannerUpgradedAt: '2026-07-19T09:00:00.000Z' } })
  assert.deepEqual(evaluateCampaignForApprovalRearm(row, { now: NOW }), { eligible: false, reason: 'artifact_not_newer' })
})

test('the newest valid artifact timestamp wins over a retained stale banner timestamp', () => {
  const row = campaign({
    video: {
      brandBannerUpgradedAt: '2026-07-19T09:00:00.000Z',
      brandedAt: '2026-07-19T11:15:00.000Z',
      voiceCompletedAt: '2026-07-19T11:10:00.000Z',
      brandDebug: { objectPath: 'cos-final/campaign/pt-regenerated-final.mp4' },
    },
  })
  const evaluation = evaluateCampaignForApprovalRearm(row, { now: NOW })
  assert.equal(evaluation.eligible, true)
  assert.equal(evaluation.artifactTimestampField, 'brandedAt')
  assert.equal(evaluation.artifactAt, Date.parse('2026-07-19T11:15:00.000Z'))
})

test('new final artifact clears stale notification fields exactly once', () => {
  const row = campaign()
  const evaluation = evaluateCampaignForApprovalRearm(row, { now: NOW })
  assert.equal(evaluation.eligible, true)

  const patched = buildRearmedVideo(row.metadata.video, evaluation, NOW)
  assert.equal('approvalRequestedAt' in patched, false)
  assert.equal('approvalNotification' in patched, false)
  assert.equal(patched.approvalRearm.artifactKey, evaluation.artifactKey)

  const secondEvaluation = evaluateCampaignForApprovalRearm(
    { ...row, metadata: { ...row.metadata, video: patched } },
    { now: NOW },
  )
  assert.deepEqual(secondEvaluation, { eligible: false, reason: 'approval_not_previously_sent' })
})

test('same artifact cannot be re-armed again even if stale fields are restored', () => {
  const row = campaign()
  const artifactKey = approvalArtifactKey(row.metadata.video)
  row.metadata.video.approvalRearm = { artifactKey }
  assert.deepEqual(evaluateCampaignForApprovalRearm(row, { now: NOW }), { eligible: false, reason: 'artifact_already_rearmed' })
})

test('missing prior approval request is left for the existing notifier', () => {
  const row = campaign({ video: { approvalRequestedAt: null, approvalNotification: null } })
  assert.deepEqual(evaluateCampaignForApprovalRearm(row, { now: NOW }), { eligible: false, reason: 'approval_not_previously_sent' })
})

test('approved, rejected, and archived campaigns are never re-armed', () => {
  assert.equal(evaluateCampaignForApprovalRearm(campaign({ status: 'approved', approved_at: '2026-07-19T10:30:00.000Z', approved_by: 'owner-1' }), { now: NOW }).eligible, false)
  assert.equal(evaluateCampaignForApprovalRearm(campaign({ status: 'rejected' }), { now: NOW }).eligible, false)
  assert.deepEqual(
    evaluateCampaignForApprovalRearm(campaign({ metadata: { video_archived_at: '2026-07-19T10:30:00.000Z' } }), { now: NOW }),
    { eligible: false, reason: 'archived' },
  )
})

test('old artifacts are bounded out to prevent historical email backfill', () => {
  const row = campaign({
    video: {
      approvalRequestedAt: '2026-06-01T10:00:00.000Z',
      brandBannerUpgradedAt: '2026-06-01T11:00:00.000Z',
    },
  })
  assert.deepEqual(evaluateCampaignForApprovalRearm(row, { now: NOW, maxAgeHours: 72 }), { eligible: false, reason: 'artifact_too_old' })
})
