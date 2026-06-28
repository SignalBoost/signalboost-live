import { campaignFromRecommendation } from '../recommendation/campaign'
import type { CosCampaign, CosRecommendation } from '../recommendation/types'
import type { CosCampaignQueueItem, CosCampaignRiskLevel, CosCampaignWorkItem } from './types'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function riskForCampaign(campaign: CosCampaign): CosCampaignRiskLevel {
  if (campaign.channel === 'outreach' || campaign.channel === 'email') return 'medium'
  if (campaign.channel === 'youtube' || campaign.channel === 'short_video') return 'medium'
  return 'low'
}

function workItemsForCampaign(campaign: CosCampaign): CosCampaignWorkItem[] {
  const timestamp = new Date().toISOString()
  const scriptAsset = campaign.assets.find(asset => asset.type === 'script')

  if (!scriptAsset) return []

  return [
    {
      id: id('work_script'),
      kind: 'script_worker',
      status: 'waiting_approval',
      input: {
        campaign_id: campaign.id,
        recommendation_id: campaign.recommendation_id,
        channel: campaign.channel,
        language: scriptAsset.language || 'en',
        brief: scriptAsset.brief,
      },
      created_at: timestamp,
      updated_at: timestamp,
    },
  ]
}

export function queueItemFromRecommendation(recommendation: CosRecommendation): CosCampaignQueueItem {
  const campaign = campaignFromRecommendation(recommendation)
  const timestamp = new Date().toISOString()
  const riskLevel = riskForCampaign(campaign)

  return {
    id: campaign.id,
    recommendation_id: recommendation.id,
    department: recommendation.department,
    title: campaign.title,
    objective: campaign.objective,
    channel: campaign.channel,
    audience: campaign.audience,
    languages: campaign.languages,
    assets: campaign.assets,
    work_items: workItemsForCampaign(campaign),
    recommendation,
    status: 'waiting_approval',
    risk_level: riskLevel,
    approval_required: riskLevel !== 'low',
    created_at: timestamp,
    updated_at: timestamp,
    metadata: {
      source: 'cos_recommendation',
      operating_rule: 'Recommendation becomes campaign work. Humans approve before publishing, sending, or spending.',
    },
  }
}
