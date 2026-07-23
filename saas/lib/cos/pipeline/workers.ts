import type { Job } from 'bullmq'
import { addVoiceToCampaignVideo } from '@/lib/cos/video-voice'
import { renderBrandOverlayVideo } from '@/lib/cos/video-compose'
import { createSupabaseCampaignQueueStore, type CampaignQueueStore } from '@/lib/cos/campaign-queue/store'
import { runFFmpegRender } from './dependencies'
import { createCosWorker, queueNames, type BrandOverlayJobPayload, type VideoRenderJobPayload, type VoiceOverJobPayload } from './queues'

const VIDEO_WORKER_CONCURRENCY = Number(process.env.COS_VIDEO_WORKER_CONCURRENCY || 3)
const VOICE_WORKER_CONCURRENCY = Number(process.env.COS_VOICE_WORKER_CONCURRENCY || 5)
const BRAND_WORKER_CONCURRENCY = Number(process.env.COS_BRAND_WORKER_CONCURRENCY || 4)

// All campaign-queue data access goes through the injected store. On SignalBoost the
// default Supabase adapter applies; a buyer passes their own CampaignQueueStore to the
// create*Worker factories and these workers run unchanged on their datastore.
async function loadCampaign(store: CampaignQueueStore, campaignId: string) {
  const campaign = await store.getById(campaignId)
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)
  return campaign
}

export function createVideoRenderWorker(store: CampaignQueueStore = createSupabaseCampaignQueueStore()) {
  return createCosWorker<VideoRenderJobPayload>(queueNames.videoRender, async (job: Job<VideoRenderJobPayload>) => {
    const campaign = await loadCampaign(store, job.data.campaignId)
    const startedAt = new Date().toISOString()
    await store.update(campaign.id, { status: 'rendering', metadata: { ...(campaign.metadata || {}), video: { ...(campaign.metadata?.video || {}), status: 'rendering', renderJobId: job.id, started_at: startedAt } } })
    const rendered = await runFFmpegRender(job.data.assets)
    const metadata = (await store.getMetadata(campaign.id)) || campaign.metadata || {}
    await store.update(campaign.id, { status: 'waiting_for_voice', metadata: { ...metadata, video: { ...(metadata.video || {}), status: 'ready', renderJobId: job.id, renderedAt: new Date().toISOString(), renderResult: rendered } } })
    return { ok: true, rendered }
  }, { concurrency: Math.max(1, VIDEO_WORKER_CONCURRENCY) })
}

export function createVoiceOverWorker(store: CampaignQueueStore = createSupabaseCampaignQueueStore()) {
  return createCosWorker<VoiceOverJobPayload>(queueNames.voiceOver, async (job: Job<VoiceOverJobPayload>) => {
    const campaign = await loadCampaign(store, job.data.campaignId)
    await store.update(campaign.id, { status: 'voice_in_progress' })
    const result = await addVoiceToCampaignVideo(campaign, job.data.language)
    if (!result.ok || !result.url) throw new Error(result.error || 'Voice-over failed')
    const metadata = (await store.getMetadata(campaign.id)) || campaign.metadata || {}
    await store.update(campaign.id, { status: 'voice_done', metadata: { ...metadata, video: { ...(metadata.video || {}), voiceStatus: result.fallback ? 'COMPLETED_FALLBACK' : 'COMPLETED', unbrandedVoiced: { ...((metadata.video || {}).unbrandedVoiced || {}), [job.data.language]: result.url }, voiceError: null } } })
    return { ok: true, url: result.url, fallback: Boolean(result.fallback) }
  }, { concurrency: Math.max(1, VOICE_WORKER_CONCURRENCY) })
}

export function createBrandOverlayWorker(store: CampaignQueueStore = createSupabaseCampaignQueueStore()) {
  return createCosWorker<BrandOverlayJobPayload>(queueNames.brandOverlay, async (job: Job<BrandOverlayJobPayload>) => {
    const campaign = await loadCampaign(store, job.data.campaignId)
    const aspect = job.data.aspect || (campaign.channel === 'short_video' ? '9:16' : '16:9')
    const result = await renderBrandOverlayVideo({ campaign, sourceUrl: job.data.sourceUrl, aspect, lang: job.data.language })
    if (!result.ok || !result.url) throw new Error(result.error || 'Brand overlay failed')
    const metadata = (await store.getMetadata(campaign.id)) || campaign.metadata || {}
    await store.update(campaign.id, { status: 'waiting_approval', metadata: { ...metadata, video: { ...(metadata.video || {}), voicedUrl: result.url, voiced: { ...((metadata.video || {}).voiced || {}), [job.data.language]: result.url }, branded: true, brandedAt: new Date().toISOString(), brandDebug: result.debug || null } } })
    return { ok: true, url: result.url }
  }, { concurrency: Math.max(1, BRAND_WORKER_CONCURRENCY) })
}

export function createAllCosPipelineWorkers(store: CampaignQueueStore = createSupabaseCampaignQueueStore()) {
  return [createVideoRenderWorker(store), createVoiceOverWorker(store), createBrandOverlayWorker(store)]
}
