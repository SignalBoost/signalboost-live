import { analyzeBusiness, extractPublicBusinessText } from '@/lib/ai/businessAnalyzer'
import { profileBusinessModel } from '@/lib/ai/businessModelProfiler'
import { predictBusinessNeeds } from '@/lib/ai/predictiveIntelligence'
import { generateReviewStrategy } from '@/lib/ai/reviewStrategy'
import { generateSocialPlan } from '@/lib/ai/socialPlan'
import { generatePromoPlan } from '@/lib/ai/promoPlan'
import { generateOutreachMessage } from '@/lib/ai/outreachMessage'
import { runBusinessMode } from '@/lib/ai/modes'
import type { OutreachAssets } from '@/lib/outreach/types'
import { PARTNER_INTENT_GROUPS } from '@/lib/outreach/serviceIntents'

export async function generateOutreachAssets(args: {
  sourceUrl: string
  businessName?: string
  sourcePlatform?: string
  language?: string
  publicText?: string
}): Promise<OutreachAssets> {
  const extracted = args.publicText
    ? { url: args.sourceUrl, text: args.publicText }
    : await extractPublicBusinessText(args.sourceUrl)

  const analyzer_summary = await analyzeBusiness({
    sourceUrl: extracted.url,
    publicText: args.businessName ? `${args.businessName}\n${extracted.text}` : extracted.text,
    language: args.language,
  })

  const business_model_profile = await profileBusinessModel({ analysis: analyzer_summary, language: args.language })
  const predictive_needs = await predictBusinessNeeds({ analysis: analyzer_summary, profile: business_model_profile, language: args.language })
  const website_json = await runBusinessMode({
    userPrompt: `Generate a custom SignalBoost website for ${analyzer_summary.business_name}. Type: ${analyzer_summary.business_type}. Services: ${analyzer_summary.services.join(', ')}. Tone: ${analyzer_summary.tone}. Opportunities: ${analyzer_summary.opportunities.join(', ')}.`,
    language: args.language || 'en',
  })
  const review_strategy = await generateReviewStrategy({ analysis: analyzer_summary, language: args.language })
  const social_plan = await generateSocialPlan({ analysis: analyzer_summary, language: args.language })
  const promo_plan = await generatePromoPlan({ analysis: analyzer_summary, predictiveNeeds: predictive_needs, language: args.language })
  const partnerIntentContext = PARTNER_INTENT_GROUPS
    .map((group) => `${group.label}: ${group.signals.join(', ')}`)
    .join(' | ')
  const messageAssets = {
    analyzer_summary,
    business_model_profile,
    predictive_needs,
    website_json,
    review_strategy,
    social_plan,
    promo_plan,
  }
  const outreach_message = await generateOutreachMessage({
    assets: {
      ...messageAssets,
      promo_plan: {
        ...promo_plan,
        hmi_summary: `${promo_plan.hmi_summary} Partner intent groups: ${partnerIntentContext}`,
      },
    },
    language: args.language,
  })

  return { ...messageAssets, outreach_message }
}
