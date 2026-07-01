import { campaignFromRecommendation } from '../recommendation/campaign'
import type { CosCampaign, CosRecommendation } from '../recommendation/types'
import type { CosCampaignQueueItem, CosCampaignRiskLevel, CosCampaignWorkItem } from './types'

// CFO duty folded into COS: no CEO lets meaningful spend go out ungoverned.
// Any recommendation whose estimated cost crosses this line gets escalated to
// 'high' risk automatically — which forces human approval regardless of
// channel, even for channels normally treated as low-risk. Cost can only
// ESCALATE risk, never lower it. Override via COS_HIGH_COST_THRESHOLD_USD.
const HIGH_COST_THRESHOLD_USD = Number(process.env.COS_HIGH_COST_THRESHOLD_USD || 250)

const RISK_ORDER: Record<CosCampaignRiskLevel, number> = { low: 0, medium: 1, high: 2 }

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function channelRisk(campaign: CosCampaign): CosCampaignRiskLevel {
  if (campaign.channel === 'outreach' || campaign.channel === 'email') return 'medium'
  if (campaign.channel === 'youtube' || campaign.channel === 'short_video') return 'medium'
  return 'low'
}

function riskForCampaign(campaign: CosCampaign, recommendation: CosRecommendation): {
  riskLevel: CosCampaignRiskLevel
  estimatedCostUsd: number
  escalatedForCost: boolean
} {
  const base = channelRisk(campaign)
  const estimatedCostUsd = Number(recommendation.estimated_cost_usd || 0)
  const costEscalated: CosCampaignRiskLevel = estimatedCostUsd > HIGH_COST_THRESHOLD_USD ? 'high' : 'low'
  const riskLevel = RISK_ORDER[costEscalated] > RISK_ORDER[base] ? costEscalated : base
  return { riskLevel, estimatedCostUsd, escalatedForCost: riskLevel === 'high' && costEscalated === 'high' }
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
  const { riskLevel, estimatedCostUsd, escalatedForCost } = riskForCampaign(campaign, recommendation)

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
      financial_review: {
        estimated_cost_usd: estimatedCostUsd,
        high_cost_threshold_usd: HIGH_COST_THRESHOLD_USD,
        escalated_for_cost: escalatedForCost,
        note: escalatedForCost
          ? `Escalated to high risk: estimated cost $${estimatedCostUsd.toFixed(2)} exceeds the $${HIGH_COST_THRESHOLD_USD.toFixed(2)} auto-approval threshold.`
          : `Within the $${HIGH_COST_THRESHOLD_USD.toFixed(2)} auto-approval threshold.`,
      },
    },
  }
}
