#!/usr/bin/env node
// Re-arm the existing COSA final-video approval notifier after a newer final
// artifact replaces the version that was previously emailed to the owner.
//
// This worker never sends email and never publishes. It only clears the two
// existing video-level notification markers when a bounded, recent, branded
// artifact is provably newer than approvalRequestedAt. The existing Vercel
// notifier remains the only approval-email sender.

import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const VIDEO_CHANNELS = new Set(['youtube', 'short_video'])
const REARMABLE_STATUSES = new Set(['draft', 'waiting_approval'])
const DEFAULT_SCAN_LIMIT = 50
const DEFAULT_REARM_LIMIT = 2
const DEFAULT_MAX_AGE_HOURS = 14 * 24

function text(value) {
  return String(value || '').trim()
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(parsed, maximum)
}

function timeMs(value) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  return Date.parse(String(value || ''))
}

function normalizeUrlIdentity(value) {
  const raw = text(value)
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return raw.split(/[?#]/, 1)[0]
  }
}

export function stableArtifactDescriptor(video = {}) {
  const candidates = [
    ['brandDebug.objectPath', video?.brandDebug?.objectPath, false],
    ['voiceObjectPath', video?.voiceObjectPath, false],
    ['finalObjectPath', video?.finalObjectPath, false],
    ['finalUrl', video?.finalUrl, true],
    ['voicedUrl', video?.voicedUrl, true],
  ]

  for (const [field, candidate, isUrl] of candidates) {
    const value = isUrl ? normalizeUrlIdentity(candidate) : text(candidate)
    if (value) return { field, value }
  }

  return { field: '', value: '' }
}

export function approvalArtifactKey(video = {}) {
  const source = stableArtifactDescriptor(video)
  if (!source.value) return null

  const finalSchema = text(video?.finalSchemaVersion || video?.brandSchemaVersion)
  const bannerSchema = text(video?.brandBannerSchemaVersion || video?.brandDebug?.bannerSchema)
  return createHash('sha256')
    .update([source.field, source.value, finalSchema, bannerSchema].join('\u0000'))
    .digest('hex')
}

export function approvalArtifactTimestamp(video = {}) {
  const candidates = [
    ['brandBannerUpgradedAt', video?.brandBannerUpgradedAt],
    ['brandedAt', video?.brandedAt],
    ['voiceCompletedAt', video?.voiceCompletedAt],
  ]
    .map(([field, raw]) => ({ field, raw: text(raw), time: Date.parse(String(raw || '')) }))
    .filter(candidate => candidate.raw && Number.isFinite(candidate.time))
    .sort((left, right) => right.time - left.time)

  return candidates[0] || { field: '', raw: '', time: Number.NaN }
}

export function evaluateCampaignForApprovalRearm(
  campaign,
  { now = Date.now(), maxAgeHours = DEFAULT_MAX_AGE_HOURS } = {},
) {
  if (!campaign || typeof campaign !== 'object') return { eligible: false, reason: 'invalid_campaign' }
  if (!VIDEO_CHANNELS.has(text(campaign.channel))) return { eligible: false, reason: 'not_video_channel' }

  const status = text(campaign.status)
  if (!REARMABLE_STATUSES.has(status)) return { eligible: false, reason: `status_${status || 'missing'}` }
  if (campaign.approved_at || campaign.approved_by) return { eligible: false, reason: 'already_approved' }

  const metadata = campaign.metadata && typeof campaign.metadata === 'object' ? campaign.metadata : {}
  if (metadata.video_archived_at) return { eligible: false, reason: 'archived' }
  if (metadata.emailApproval?.state === 'approved') return { eligible: false, reason: 'already_approved' }

  const video = metadata.video && typeof metadata.video === 'object' ? metadata.video : {}
  if (video.status !== 'ready' || video.branded !== true || !text(video.voicedUrl)) {
    return { eligible: false, reason: 'final_video_not_ready' }
  }

  const approvalAt = Date.parse(String(video.approvalRequestedAt || ''))
  if (!Number.isFinite(approvalAt)) return { eligible: false, reason: 'approval_not_previously_sent' }

  const artifactTimestamp = approvalArtifactTimestamp(video)
  if (!Number.isFinite(artifactTimestamp.time)) return { eligible: false, reason: 'artifact_timestamp_missing' }
  if (artifactTimestamp.time <= approvalAt) return { eligible: false, reason: 'artifact_not_newer' }

  const nowValue = timeMs(now)
  if (!Number.isFinite(nowValue)) return { eligible: false, reason: 'invalid_clock' }
  const maxAgeMs = Math.max(1, Number(maxAgeHours) || DEFAULT_MAX_AGE_HOURS) * 60 * 60 * 1000
  if (artifactTimestamp.time < nowValue - maxAgeMs) return { eligible: false, reason: 'artifact_too_old' }
  if (artifactTimestamp.time > nowValue + 5 * 60 * 1000) return { eligible: false, reason: 'artifact_timestamp_in_future' }

  const source = stableArtifactDescriptor(video)
  const artifactKey = approvalArtifactKey(video)
  if (!source.value || !artifactKey) return { eligible: false, reason: 'artifact_identity_missing' }
  if (video.approvalRearm?.artifactKey === artifactKey) return { eligible: false, reason: 'artifact_already_rearmed' }

  return {
    eligible: true,
    reason: 'new_final_artifact_after_approval_request',
    artifactKey,
    sourceField: source.field,
    approvalAt,
    artifactAt: artifactTimestamp.time,
    artifactTimestampField: artifactTimestamp.field,
  }
}

export function buildRearmedVideo(video, evaluation, now = new Date()) {
  if (!evaluation?.eligible || !evaluation.artifactKey) throw new Error('Eligible approval re-arm evaluation is required')
  const { approvalRequestedAt: _approvalRequestedAt, approvalNotification: _approvalNotification, ...remaining } = video || {}
  const nowIso = new Date(timeMs(now)).toISOString()

  return {
    ...remaining,
    approvalRearm: {
      ...(video?.approvalRearm && typeof video.approvalRearm === 'object' ? video.approvalRearm : {}),
      artifactKey: evaluation.artifactKey,
      artifactTimestamp: new Date(evaluation.artifactAt).toISOString(),
      artifactTimestampField: evaluation.artifactTimestampField,
      sourceField: evaluation.sourceField,
      finalSchemaVersion: text(video?.finalSchemaVersion || video?.brandSchemaVersion) || null,
      brandBannerSchemaVersion: text(video?.brandBannerSchemaVersion || video?.brandDebug?.bannerSchema) || null,
      rearmedAt: nowIso,
      reason: 'new_final_artifact_after_previous_approval_email',
    },
  }
}

export async function runApprovalRearm({
  client,
  now = new Date(),
  scanLimit = DEFAULT_SCAN_LIMIT,
  rearmLimit = DEFAULT_REARM_LIMIT,
  maxAgeHours = DEFAULT_MAX_AGE_HOURS,
} = {}) {
  if (!client?.from) throw new Error('Supabase client is required')

  const boundedScanLimit = positiveInteger(scanLimit, DEFAULT_SCAN_LIMIT, 100)
  const boundedRearmLimit = positiveInteger(rearmLimit, DEFAULT_REARM_LIMIT, 10)
  const clock = new Date(timeMs(now))
  if (!Number.isFinite(clock.getTime())) throw new Error('A valid clock is required')

  const { data: campaigns, error } = await client
    .from('cos_campaign_queue')
    .select('*')
    .in('channel', [...VIDEO_CHANNELS])
    .in('status', [...REARMABLE_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(boundedScanLimit)

  if (error) throw new Error(error.message)

  const candidates = (campaigns || [])
    .map(campaign => ({ campaign, evaluation: evaluateCampaignForApprovalRearm(campaign, { now: clock, maxAgeHours }) }))
    .filter(item => item.evaluation.eligible)
    .slice(0, boundedRearmLimit)

  const results = []
  for (const item of candidates) {
    const { data: fresh, error: readError } = await client
      .from('cos_campaign_queue')
      .select('*')
      .eq('id', item.campaign.id)
      .single()

    if (readError || !fresh) {
      results.push({ campaign: item.campaign.id, rearmed: false, reason: readError?.message || 'campaign_not_found' })
      continue
    }

    const evaluation = evaluateCampaignForApprovalRearm(fresh, { now: clock, maxAgeHours })
    if (!evaluation.eligible) {
      results.push({ campaign: fresh.id, rearmed: false, reason: evaluation.reason })
      continue
    }

    const metadata = fresh.metadata && typeof fresh.metadata === 'object' ? fresh.metadata : {}
    const video = metadata.video && typeof metadata.video === 'object' ? metadata.video : {}
    const rearmedVideo = buildRearmedVideo(video, evaluation, clock)
    const updateQuery = client
      .from('cos_campaign_queue')
      .update({ metadata: { ...metadata, video: rearmedVideo } })
      .eq('id', fresh.id)

    // updated_at is maintained by the table trigger. Matching it prevents this
    // worker from clearing markers written concurrently by the Vercel notifier.
    const guardedQuery = fresh.updated_at ? updateQuery.eq('updated_at', fresh.updated_at) : updateQuery
    const { data: updated, error: updateError } = await guardedQuery.select('id')

    if (updateError) {
      results.push({ campaign: fresh.id, rearmed: false, reason: updateError.message })
      continue
    }
    if (!Array.isArray(updated) || updated.length !== 1) {
      results.push({ campaign: fresh.id, rearmed: false, reason: 'concurrent_update_detected' })
      continue
    }

    results.push({ campaign: fresh.id, rearmed: true, artifactKey: evaluation.artifactKey })
  }

  return {
    ok: results.every(result => result.rearmed || result.reason === 'concurrent_update_detected'),
    scanned: campaigns?.length || 0,
    eligible: candidates.length,
    rearmed: results.filter(result => result.rearmed).length,
    results,
  }
}

async function main() {
  const url = text(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!url || !key) throw new Error('Supabase URL and service-role key are required')

  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const summary = await runApprovalRearm({
    client,
    scanLimit: process.env.COS_VIDEO_APPROVAL_REARM_SCAN_LIMIT,
    rearmLimit: process.env.COS_VIDEO_APPROVAL_REARM_LIMIT,
    maxAgeHours: process.env.COS_VIDEO_APPROVAL_REARM_MAX_AGE_HOURS,
  })
  console.log(JSON.stringify(summary, null, 2))
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : ''
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
