#!/usr/bin/env node
// Sync completed COSA base-video jobs back into their owning campaign rows.
//
// The production worker writes the MP4 to Supabase Storage and marks
// cos_video_production_jobs rendered. The Video Studio, however, reads
// cos_campaign_queue.metadata.video. This bridge makes that handoff explicit
// and idempotent so a completed render cannot remain stuck on Step 1 merely
// because a separate Vercel polling cron was delayed or unavailable.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const renderBucket = String(process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders').trim()

if (!url || !key) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
}
if (!renderBucket) throw new Error('COS_VIDEO_RENDER_BUCKET is required')

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function message(error) {
  return error?.message || error?.error || String(error || 'unknown error')
}

async function usableVideoUrl(outputUrl) {
  const output = String(outputUrl || '').trim()
  if (!output) throw new Error('Rendered job has no output_url')
  if (/^https?:\/\//i.test(output)) return output

  const { data, error } = await supabase.storage
    .from(renderBucket)
    .createSignedUrl(output, 60 * 60 * 24 * 7)

  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign rendered video ${output}: ${message(error)}`)
  }
  return data.signedUrl
}

const { data: campaigns, error: campaignError } = await supabase
  .from('cos_campaign_queue')
  .select('id, metadata')
  .filter('metadata->video->>status', 'eq', 'rendering')
  .limit(50)

if (campaignError) throw new Error(`Could not load rendering campaigns: ${campaignError.message}`)

const candidates = (campaigns || []).filter((campaign) => {
  const video = campaign?.metadata?.video
  return Boolean(video?.requestId)
})

if (!candidates.length) {
  console.log('COSA campaign sync: no rendering campaigns need reconciliation.')
  process.exit(0)
}

const requestIds = [...new Set(candidates.map((campaign) => String(campaign.metadata.video.requestId)))]
const { data: jobs, error: jobError } = await supabase
  .from('cos_video_production_jobs')
  .select('id, status, output_url, error, queue_drop_reason, updated_at')
  .in('id', requestIds)

if (jobError) throw new Error(`Could not load video jobs: ${jobError.message}`)

const jobsById = new Map((jobs || []).map((job) => [String(job.id), job]))
let ready = 0
let failed = 0
let unchanged = 0

for (const campaign of candidates) {
  const metadata = campaign.metadata || {}
  const video = metadata.video || {}
  const requestId = String(video.requestId)
  const job = jobsById.get(requestId)

  if (!job) {
    unchanged++
    continue
  }

  const status = String(job.status || '').toLowerCase()
  const now = new Date().toISOString()

  if (status === 'rendered' || status === 'completed') {
    try {
      const videoUrl = await usableVideoUrl(job.output_url)
      const updatedVideo = {
        ...video,
        status: 'ready',
        url: videoUrl,
        ready_at: now,
        error: null,
        voicedUrl: video.branded === true ? video.voicedUrl || null : null,
        voiced: video.voiced || {},
        branded: video.branded === true,
        brandedLangs: video.brandedLangs || {},
        unbrandedVoiced: video.unbrandedVoiced || {},
        brandingLock: null,
      }

      const { error } = await supabase
        .from('cos_campaign_queue')
        .update({ metadata: { ...metadata, video: updatedVideo } })
        .eq('id', campaign.id)
        .filter('metadata->video->>requestId', 'eq', requestId)

      if (error) throw error
      ready++
      console.log(`COSA campaign ${campaign.id}: base render ${requestId} synced to Step 2.`)
    } catch (error) {
      console.error(`COSA campaign ${campaign.id}: rendered job sync failed: ${message(error)}`)
      unchanged++
    }
    continue
  }

  if (status === 'failed' || status === 'escalated' || status === 'dlq') {
    const renderError = String(job.error || job.queue_drop_reason || `render job ${status}`)
    const updatedVideo = {
      ...video,
      status: 'failed',
      error: renderError,
      failed_at: now,
      brandingLock: null,
    }

    const { error } = await supabase
      .from('cos_campaign_queue')
      .update({ metadata: { ...metadata, video: updatedVideo } })
      .eq('id', campaign.id)
      .filter('metadata->video->>requestId', 'eq', requestId)

    if (error) {
      console.error(`COSA campaign ${campaign.id}: failed-job sync failed: ${error.message}`)
      unchanged++
    } else {
      failed++
      console.log(`COSA campaign ${campaign.id}: render ${requestId} marked failed (${status}).`)
    }
    continue
  }

  unchanged++
}

console.log(`COSA campaign sync complete. Ready: ${ready}; failed: ${failed}; unchanged: ${unchanged}.`)
