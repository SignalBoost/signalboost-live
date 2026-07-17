import type { Job } from 'bullmq'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'
import { renderBrandOverlayVideo } from '@/lib/cos/video-compose'
import { getAdminSupabase } from '@/utils/supabase/server'
import { runFFmpegRender } from './dependencies'
import { createCosWorker, queueNames, type BrandOverlayJobPayload, type VideoRenderJobPayload, type VoiceOverJobPayload } from './queues'

const VIDEO_WORKER_CONCURRENCY = Number(process.env.COS_VIDEO_WORKER_CONCURRENCY || 3)
const VOICE_WORKER_CONCURRENCY = Number(process.env.COS_VOICE_WORKER_CONCURRENCY || 5)
const BRAND_WORKER_CONCURRENCY = Number(process.env.COS_BRAND_WORKER_CONCURRENCY || 4)

async function loadCampaign(campaignId: string) {
  const db = getAdminSupabase()
  const { data, error } = await db.from('cos_campaign_queue').select('*').eq('id', campaignId).single()
  if (error || !data) throw new Error(error?.message || `Campaign ${campaignId} not found`)
  return { db, campaign: data }
}

export function createVideoRenderWorker() {
  return createCosWorker<VideoRenderJobPayload>(queueNames.videoRender, async (job: Job<VideoRenderJobPayload>) => {
    const { db, campaign } = await loadCampaign(job.data.campaignId)
    const startedAt = new Date().toISOString()
    await db.from('cos_campaign_queue').update({ status: 'rendering', metadata: { ...(campaign.metadata || {}), video: { ...(campaign.metadata?.video || {}), status: 'rendering', renderJobId: job.id, started_at: startedAt } } }).eq('id', campaign.id)
    const rendered = await runFFmpegRender(job.data.assets)
    const { data: fresh } = await db.from('cos_campaign_queue').select('metadata').eq('id', campaign.id).single()
    const metadata = fresh?.metadata || campaign.metadata || {}
    await db.from('cos_campaign_queue').update({ status: 'waiting_for_voice', metadata: { ...metadata, video: { ...(metadata.video || {}), status: 'ready', renderJobId: job.id, renderedAt: new Date().toISOString(), renderResult: rendered } } }).eq('id', campaign.id)
    return { ok: true, rendered }
  }, { concurrency: Math.max(1, VIDEO_WORKER_CONCURRENCY) })
}

export function createVoiceOverWorker() {
  return createCosWorker<VoiceOverJobPayload>(queueNames.voiceOver, async (job: Job<VoiceOverJobPayload>) => {
    const { db, campaign } = await loadCampaign(job.data.campaignId)
    await db.from('cos_campaign_queue').update({ status: 'voice_in_progress' }).eq('id', campaign.id)
    const result = await addVoiceToCampaignVideo(campaign, job.data.language)
    if (!result.ok || !result.url) throw new Error(result.error || 'Voice-over failed')
    const { data: fresh } = await db.from('cos_campaign_queue').select('metadata').eq('id', campaign.id).single()
    const metadata = fresh?.metadata || campaign.metadata || {}
    await db.from('cos_campaign_queue').update({ status: 'voice_done', metadata: { ...metadata, video: { ...(metadata.video || {}), voiceStatus: result.fallback ? 'COMPLETED_FALLBACK' : 'COMPLETED', unbrandedVoiced: { ...((metadata.video || {}).unbrandedVoiced || {}), [job.data.language]: result.url }, voiceError: null } } }).eq('id', campaign.id)
    return { ok: true, url: result.url, fallback: Boolean(result.fallback) }
  }, { concurrency: Math.max(1, VOICE_WORKER_CONCURRENCY) })
}

export function createBrandOverlayWorker() {
  return createCosWorker<BrandOverlayJobPayload>(queueNames.brandOverlay, async (job: Job<BrandOverlayJobPayload>) => {
    const { db, campaign } = await loadCampaign(job.data.campaignId)
    const aspect = job.data.aspect || (campaign.channel === 'short_video' ? '9:16' : '16:9')
    const result = await renderBrandOverlayVideo({ campaign, sourceUrl: job.data.sourceUrl, aspect, lang: job.data.language })
    if (!result.ok || !result.url) throw new Error(result.error || 'Brand overlay failed')
    const { data: fresh } = await db.from('cos_campaign_queue').select('metadata').eq('id', campaign.id).single()
    const metadata = fresh?.metadata || campaign.metadata || {}
    await db.from('cos_campaign_queue').update({ status: 'waiting_approval', metadata: { ...metadata, video: { ...(metadata.video || {}), voicedUrl: result.url, voiced: { ...((metadata.video || {}).voiced || {}), [job.data.language]: result.url }, branded: true, brandedAt: new Date().toISOString(), brandDebug: result.debug || null } } }).eq('id', campaign.id)
    return { ok: true, url: result.url }
  }, { concurrency: Math.max(1, BRAND_WORKER_CONCURRENCY) })
}

export function createAllCosPipelineWorkers() {
  return [createVideoRenderWorker(), createVoiceOverWorker(), createBrandOverlayWorker()]
}
