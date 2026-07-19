#!/usr/bin/env node
// Sync completed COSA base-video jobs back into their owning campaign rows and
// advance the current cost-safe voice stage without depending on Vercel cron.
//
// Current voice policy intentionally uses the rendered base MP4 as the
// unbranded voice/caption fallback. The GitHub brand-overlay worker then burns
// the mandatory SignalBoostAi banner and creates the final review artifact.

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const renderBucket = String(process.env.COS_VIDEO_RENDER_BUCKET || 'video-renders').trim()

if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
if (!renderBucket) throw new Error('COS_VIDEO_RENDER_BUCKET is required')

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function message(error) {
  return error?.message || error?.error || String(error || 'unknown error')
}

function primaryLang(campaign) {
  const langs = Array.isArray(campaign?.languages) ? campaign.languages.filter(Boolean) : []
  return String(langs[0] || 'en')
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

async function updateCampaign(campaign, video) {
  const metadata = { ...(campaign.metadata || {}), video }
  const { error } = await supabase
    .from('cos_campaign_queue')
    .update({ metadata })
    .eq('id', campaign.id)
  if (error) throw error
  campaign.metadata = metadata
}

const { data: campaigns, error: campaignError } = await supabase
  .from('cos_campaign_queue')
  .select('id, channel, status, languages, metadata, created_at')
  .in('channel', ['youtube', 'short_video'])
  .neq('status', 'rejected')
  .order('created_at', { ascending: false })
  .limit(50)

if (campaignError) throw new Error(`Could not load video campaigns: ${campaignError.message}`)

const rows = campaigns || []
const rendering = rows.filter((campaign) => {
  const video = campaign?.metadata?.video
  return video?.status === 'rendering' && Boolean(video?.requestId)
})

const requestIds = [...new Set(rendering.map((campaign) => String(campaign.metadata.video.requestId)))]
const jobsById = new Map()

if (requestIds.length) {
  const { data: jobs, error: jobError } = await supabase
    .from('cos_video_production_jobs')
    .select('id, status, output_url, error, queue_drop_reason, updated_at')
    .in('id', requestIds)

  if (jobError) throw new Error(`Could not load video jobs: ${jobError.message}`)
  for (const job of jobs || []) jobsById.set(String(job.id), job)
}

let ready = 0
let failed = 0
let voiceFallback = 0
let unchanged = 0

// Step 1 handoff: rendered job -> campaign base-video URL.
for (const campaign of rendering) {
  const video = campaign.metadata.video || {}
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
      await updateCampaign(campaign, updatedVideo)
      ready++
      console.log(`COSA campaign ${campaign.id}: base render ${requestId} synced.`)
    } catch (error) {
      console.error(`COSA campaign ${campaign.id}: rendered job sync failed: ${message(error)}`)
      unchanged++
    }
    continue
  }

  if (status === 'failed' || status === 'escalated' || status === 'dlq') {
    const renderError = String(job.error || job.queue_drop_reason || `render job ${status}`)
    try {
      await updateCampaign(campaign, {
        ...video,
        status: 'failed',
        error: renderError,
        failed_at: now,
        brandingLock: null,
      })
      failed++
      console.log(`COSA campaign ${campaign.id}: render ${requestId} marked failed (${status}).`)
    } catch (error) {
      console.error(`COSA campaign ${campaign.id}: failed-job sync failed: ${message(error)}`)
      unchanged++
    }
    continue
  }

  unchanged++
}

// Step 2 handoff: current cost-safe voice/caption stage simply promotes the
// base artifact into unbrandedVoiced. Do this here for both newly reconciled
// and already-ready campaigns, so old Step 2 cards self-heal immediately.
for (const campaign of rows) {
  const video = campaign?.metadata?.video || {}
  if (video.status !== 'ready' || !video.url) continue
  if (video.branded === true && video.voicedUrl) continue

  const lang = primaryLang(campaign)
  const brandedLangs = video.brandedLangs || {}
  const unbrandedVoiced = { ...(video.unbrandedVoiced || {}) }
  if (brandedLangs[lang] || unbrandedVoiced[lang]) continue

  unbrandedVoiced[lang] = String(video.url)
  try {
    await updateCampaign(campaign, {
      ...video,
      status: 'ready',
      unbrandedVoiced,
      voicedUrl: null,
      voiceLock: null,
      voiceStatus: 'COMPLETED_FALLBACK',
      voiceFallback: true,
      voiceError: null,
      voiceFallbackReason: `COST_SAFETY_FALLBACK: base video promoted for ${lang}; final brand overlay is next.`,
    })
    voiceFallback++
    console.log(`COSA campaign ${campaign.id}: Step 2 fallback prepared for ${lang}.`)
  } catch (error) {
    console.error(`COSA campaign ${campaign.id}: Step 2 fallback failed: ${message(error)}`)
    unchanged++
  }
}

console.log(`COSA campaign sync complete. Base ready: ${ready}; failed: ${failed}; Step 2 prepared: ${voiceFallback}; unchanged: ${unchanged}.`)
