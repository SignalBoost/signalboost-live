#!/usr/bin/env node
// Re-arm the existing COSA owner-approval notification only when the final
// review artifact changes. The notification route remains the single email
// sender and the email-action route remains the single decision boundary.

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim()
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

if (!url || !key) throw new Error('Supabase URL and service-role key are required')

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function isMaintenance(campaign) {
  return /(clear stuck|backup jobs?|maintenance|worker test|queue repair)/i.test(String(campaign?.title || ''))
}

function artifactIdentity(video) {
  const stableSource = [
    video?.brandDebug?.objectPath,
    video?.voiceObjectPath,
    video?.finalUrl,
    video?.voicedUrl,
    video?.brandBannerSchemaVersion,
    video?.finalSchemaVersion,
  ].filter(Boolean).join('|')

  if (!stableSource) return ''
  return createHash('sha256').update(stableSource).digest('hex')
}

const { data: campaigns, error } = await sb
  .from('cos_campaign_queue')
  .select('id, title, status, approved_at, metadata, updated_at')
  .in('channel', ['youtube', 'short_video'])
  .in('status', ['waiting_approval', 'draft'])
  .order('updated_at', { ascending: false })
  .limit(100)

if (error) throw new Error(error.message)

let rearmed = 0
let unchanged = 0
let conflicts = 0

for (const campaign of campaigns || []) {
  if (campaign?.approved_at || isMaintenance(campaign)) continue

  const metadata = campaign?.metadata || {}
  const video = metadata?.video || {}
  const finalReady = video.status === 'ready'
    && video.branded === true
    && Boolean(video.voicedUrl)

  if (!finalReady) continue

  const artifactKey = artifactIdentity(video)
  if (!artifactKey) continue

  if (String(video.approvalArtifactKey || '') === artifactKey) {
    unchanged++
    continue
  }

  const now = new Date().toISOString()
  const nextVideo = {
    ...video,
    approvalArtifactKey: artifactKey,
    approvalRequestedAt: null,
    approvalNotification: null,
    approvalEmailRearmedAt: now,
    approvalEmailRearmReason: 'final_review_artifact_changed',
  }

  let update = sb
    .from('cos_campaign_queue')
    .update({ metadata: { ...metadata, video: nextVideo } })
    .eq('id', campaign.id)
    .eq('status', campaign.status)

  if (campaign.updated_at) update = update.eq('updated_at', campaign.updated_at)

  const { data: updated, error: updateError } = await update.select('id').maybeSingle()

  if (updateError) {
    console.error(`COSA campaign ${campaign.id}: approval email re-arm failed: ${updateError.message}`)
    continue
  }

  if (!updated?.id) {
    conflicts++
    console.warn(`COSA campaign ${campaign.id}: skipped because the campaign changed concurrently.`)
    continue
  }

  rearmed++
  console.log(`COSA campaign ${campaign.id}: approval email re-armed for new final artifact.`)
}

console.log(`COSA approval-email re-arm complete. Rearmed: ${rearmed}; unchanged: ${unchanged}; conflicts: ${conflicts}.`)
