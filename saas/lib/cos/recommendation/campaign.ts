import type { CosCampaign, CosCampaignAsset, CosRecommendation } from './types'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const FIVE_LANGUAGES: CosCampaign['languages'] = ['en', 'es', 'pt', 'pl', 'ru']
const DEFAULT_AUDIENCE = 'Small business owners and operators who need more growth capacity without adding manual work.'

const LANGUAGE_LABELS: Record<CosCampaign['languages'][number], string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  pl: 'Polish',
  ru: 'Russian',
}

function cleanBrief(value: string, maxLength = 520) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function signalValue(recommendation: CosRecommendation, metric: string) {
  const signal = recommendation.signals.find(item => item.metric === metric)
  return typeof signal?.value === 'string' && signal.value.trim() ? signal.value.trim() : null
}

function audienceForRecommendation(recommendation: CosRecommendation) {
  return signalValue(recommendation, 'target_audience') || DEFAULT_AUDIENCE
}

function requestedLanguageForRecommendation(recommendation: CosRecommendation): CosCampaign['languages'][number] {
  const language = signalValue(recommendation, 'requested_language')
  return FIVE_LANGUAGES.includes(language as CosCampaign['languages'][number]) ? language as CosCampaign['languages'][number] : 'en'
}

function translationAssets(primaryLanguage: CosCampaign['languages'][number]): CosCampaignAsset[] {
  return FIVE_LANGUAGES
    .filter(language => language !== primaryLanguage)
    .map(language => ({
      type: 'translation',
      status: 'needed',
      language,
      brief: `Prepare ${LANGUAGE_LABELS[language]} version after ${LANGUAGE_LABELS[primaryLanguage]} approval.`,
    }))
}

function assetsForChannel(recommendation: CosRecommendation, primaryLanguage: CosCampaign['languages'][number]): CosCampaignAsset[] {
  const channel = recommendation.recommended_channel
  const objective = cleanBrief(recommendation.summary)

  if (channel === 'youtube' || channel === 'short_video') {
    const lengthGuidance = channel === 'short_video' ? '45-90 second short-form script' : '4-6 minute educational script'
    return [
      { type: 'script', status: 'needed', language: primaryLanguage, brief: `Create a ${lengthGuidance} that starts with the customer problem and introduces SignalBoost as the solution. Campaign objective: ${objective}` },
      { type: 'thumbnail', status: 'needed', brief: `Create a clear thumbnail concept with one problem-driven headline. Campaign objective: ${objective}` },
      { type: 'description', status: 'needed', language: primaryLanguage, brief: `Create a video description with feature benefits, CTA, links, and compliance-safe wording. Campaign objective: ${objective}` },
      { type: 'seo', status: 'needed', brief: `Create title options, keywords, tags, and chapter suggestions. Campaign objective: ${objective}` },
      ...translationAssets(primaryLanguage),
    ]
  }

  if (channel === 'outreach' || channel === 'email') {
    return [
      { type: 'email', status: 'needed', language: primaryLanguage, brief: `Draft a concise outreach email with a clear business problem, value-drop opening, and soft CTA. Campaign objective: ${objective}` },
      { type: 'post', status: 'needed', language: primaryLanguage, brief: `Create a short follow-up message for professional or partner outreach. Campaign objective: ${objective}` },
      ...translationAssets(primaryLanguage),
    ]
  }

  return [
    { type: 'post', status: 'needed', language: primaryLanguage, brief: `Create the primary campaign post. Campaign objective: ${objective}` },
    ...translationAssets(primaryLanguage),
  ]
}

export function campaignFromRecommendation(recommendation: CosRecommendation): CosCampaign {
  const primaryLanguage = requestedLanguageForRecommendation(recommendation)

  return {
    id: id('camp'),
    recommendation_id: recommendation.id,
    title: recommendation.title,
    objective: recommendation.summary,
    channel: recommendation.recommended_channel,
    audience: audienceForRecommendation(recommendation),
    languages: FIVE_LANGUAGES,
    assets: assetsForChannel(recommendation, primaryLanguage),
    approval_status: 'pending_approval',
    created_at: new Date().toISOString(),
  }
}
