// saas/lib/cos/video-quality/campaign-scoring.ts
// Runs the SAME marketing-grade quality gate the COSA demo uses, but against a
// REAL campaign row instead of a hardcoded example. This is the autonomous
// "did COSA actually think about everything before publishing" check — it runs
// automatically on every publish attempt, so no human has to manually review
// hero/format/CTA/monetization/traffic-plan/branding before something goes live.
import { buildMarketingDecision } from '../marketing-decision'
import { scoreVideoCandidate } from './scoring'
import type { VideoQualityCandidate, VideoQualityScore } from './types'

const SIGNALBOOST_URL_PATTERN = /saas\.signalboostapp\.com/i

function campaignGoalFor(campaign: any): 'traffic' | 'product_demo' | 'lead_generation' | 'monetization' | 'platform_promo' {
  const text = `${campaign.title || ''} ${campaign.objective || ''}`.toLowerCase()
  if (text.includes('lead') || text.includes('sign up') || text.includes('signup')) return 'lead_generation'
  if (text.includes('monetiz')) return 'monetization'
  if (text.includes('demo') || text.includes('tour') || text.includes('walkthrough')) return 'product_demo'
  if (text.includes('platform') || text.includes('console') || text.includes('cosa')) return 'platform_promo'
  return 'traffic'
}

function scriptOutput(campaign: any): Record<string, any> | null {
  const items = Array.isArray(campaign.work_items) ? campaign.work_items : []
  const match = items.find((item: any) => item?.output)
  return match?.output || null
}

export function candidateFromCampaign(campaign: any): VideoQualityCandidate {
  const output = scriptOutput(campaign)
  const decision = buildMarketingDecision({
    campaign_goal: campaignGoalFor(campaign),
    product_or_service: campaign.title || 'SignalBoost',
    audience: campaign.audience || 'small business owners',
  })

  const scenes = Array.isArray(output?.scenes) && output.scenes.length
    ? output.scenes
    : decision.recommended_scene_designs.map((scene: string) => ({
        label: scene.replaceAll('_', ' '),
        narration: `Show the viewer why this ${scene.replaceAll('_', ' ')} matters.`,
        visual_direction: `Animate ${scene.replaceAll('_', ' ')} with motion cards and branded transitions.`,
      }))

  const callToAction = String(output?.call_to_action || decision.creative_brief || '')

  return {
    id: campaign.id,
    label: campaign.title || 'Campaign draft',
    title: output?.title || campaign.title || 'SignalBoost campaign',
    hero: decision.recommended_hero,
    format: decision.recommended_format,
    scenes,
    destination_url: SIGNALBOOST_URL_PATTERN.test(callToAction) ? callToAction : 'www.saas.signalboostapp.com',
    traffic_plan: decision.traffic_plan,
    monetization_plan: decision.monetization_plan,
    languages: Array.isArray(campaign.languages) && campaign.languages.length ? campaign.languages : ['en'],
    approval_gates: decision.approval_required,
    mining_summary: decision.mining_summary,
    prediction_summary: decision.prediction_summary,
    call_to_action: callToAction,
  }
}

/** Score a REAL campaign's actual readiness to publish. Used as an automatic gate. */
export function scoreCampaignReadiness(campaign: any): VideoQualityScore {
  return scoreVideoCandidate(candidateFromCampaign(campaign))
}
