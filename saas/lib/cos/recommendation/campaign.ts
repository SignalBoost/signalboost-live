import type { CosCampaign, CosCampaignAsset, CosRecommendation } from './types'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const FIVE_LANGUAGES: CosCampaign['languages'] = ['en', 'es', 'pt', 'pl', 'ru']

const LANGUAGE_LABELS: Record<CosCampaign['languages'][number], string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  pl: 'Polish',
  ru: 'Russian',
}

function translationAssets(): CosCampaignAsset[] {
  return FIVE_LANGUAGES.filter(language => language !== 'en').map(language => ({
    type: 'translation',
    status: 'needed',
    language,
    brief: `Prepare ${LANGUAGE_LABELS[language]} version after English approval.`,
  }))
}

function assetsForChannel(channel: CosRecommendation['recommended_channel']): CosCampaignAsset[] {
  if (channel === 'youtube' || channel === 'short_video') {
    return [
      { type: 'script', status: 'needed', language: 'en', brief: 'Create a 4-6 minute educational script that starts with the customer problem and introduces the SignalBoost feature as the solution.' },
      { type: 'thumbnail', status: 'needed', brief: 'Create a clear thumbnail concept with one problem-driven headline.' },
      { type: 'description', status: 'needed', language: 'en', brief: 'Create a video description with feature benefits, CTA, and links.' },
      { type: 'seo', status: 'needed', brief: 'Create title options, keywords, tags, and chapter suggestions.' },
      ...translationAssets(),
    ]
  }

  if (channel === 'outreach') {
    return [
      { type: 'email', status: 'needed', language: 'en', brief: 'Draft a concise outreach email with a clear business problem and soft CTA.' },
      { type: 'post', status: 'needed', language: 'en', brief: 'Create a short follow-up message for professional or partner outreach.' },
      ...translationAssets(),
    ]
  }

  return [
    { type: 'post', status: 'needed', language: 'en', brief: 'Create the primary campaign post.' },
    ...translationAssets(),
  ]
}

export function campaignFromRecommendation(recommendation: CosRecommendation): CosCampaign {
  return {
    id: id('camp'),
    recommendation_id: recommendation.id,
    title: recommendation.title,
    objective: recommendation.summary,
    channel: recommendation.recommended_channel,
    audience: 'Small business owners and operators who need more growth capacity without adding manual work.',
    languages: FIVE_LANGUAGES,
    assets: assetsForChannel(recommendation.recommended_channel),
    approval_status: 'pending_approval',
    created_at: new Date().toISOString(),
  }
}
