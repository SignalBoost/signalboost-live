import type { CosYouTubeReleaseJob } from './types'

export function youtubeJobFromCampaign(campaign: any): Omit<CosYouTubeReleaseJob, 'id' | 'created_at' | 'updated_at'> {
  const output = Array.isArray(campaign.work_items)
    ? campaign.work_items.find((item: any) => item?.output)?.output
    : null

  const title = String(output?.title || campaign.title || 'SignalBoost campaign').slice(0, 95)
  const description = String(output?.opening || campaign.objective || 'SignalBoost campaign prepared by COSA.')

  return {
    campaign_id: campaign.id,
    title,
    description,
    tags: ['signalboost', 'business', 'ai', 'marketing'],
    category_id: '28',
    visibility: 'private',
    release_at: null,
    thumbnail_prompt: title,
    video_asset_url: null,
    video_asset_path: null,
    youtube_video_id: null,
    youtube_watch_url: null,
    status: 'waiting_final_approval',
    approval_required: true,
    approved_by: null,
    approved_at: null,
    metadata: { source: 'cosa_campaign_queue' },
  }
}
