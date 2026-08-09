import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { safeParseJSON } from '@/lib/ai/validation'
import type { BusinessAnalyzerSummary, BusinessModelProfile, PredictiveNeeds } from '@/lib/outreach/types'

const ai = createPlatformAiPort()
const allowedNeeds = ['reviews', 'website_redesign', 'seasonal_promotions', 'retention_campaigns', 'social_consistency'] as const

export async function predictBusinessNeeds(args: {
  analysis: BusinessAnalyzerSummary
  profile: BusinessModelProfile
  language?: string
}): Promise<PredictiveNeeds> {
  const fallback: PredictiveNeeds = {
    likely_next_needs: [
      { need: 'reviews', priority: 'high', reason: 'More social proof can improve trust before first contact.', suggested_asset: 'Review request templates and follow-up cadence' },
      { need: 'website_redesign', priority: 'medium', reason: 'A clearer conversion page can make services and calls-to-action easier to understand.', suggested_asset: 'One-page website refresh' },
      { need: 'social_consistency', priority: 'medium', reason: 'Consistent posts keep the business visible between promotions.', suggested_asset: '7-day content calendar' },
    ],
    next_best_action: 'Approve a value-first outreach message that offers the generated assets before asking for a sales call.',
    risk_flags: [],
    hmi_summary: 'Predictions prioritize near-term, low-risk marketing improvements for a public-facing business.',
  }

  const prompt = `Predict the likely next business growth needs from public analysis and a business-model profile. Return JSON:\n{\n  "likely_next_needs":[{"need":"reviews"|"website_redesign"|"seasonal_promotions"|"retention_campaigns"|"social_consistency","priority":"low"|"medium"|"high","reason":string,"suggested_asset":string}],\n  "next_best_action": string,\n  "risk_flags": string[],\n  "hmi_summary": string\n}\nLanguage: ${args.language || 'en'}\nAnalysis: ${JSON.stringify(args.analysis)}\nProfile: ${JSON.stringify(args.profile)}`

  let raw = ''
  try { raw = await ai.generate({ modelPreference: 'openai', prompt, maxTokens: 1400 }) } catch {}
  const parsed = raw ? safeParseJSON(raw) : null
  const needs = Array.isArray(parsed?.likely_next_needs) ? parsed.likely_next_needs : fallback.likely_next_needs

  return {
    likely_next_needs: needs.map((item: any) => ({
      need: allowedNeeds.includes(item?.need) ? item.need : 'website_redesign',
      priority: ['low', 'medium', 'high'].includes(item?.priority) ? item.priority : 'medium',
      reason: String(item?.reason || 'Useful next step based on public business signals.'),
      suggested_asset: String(item?.suggested_asset || 'growth asset'),
    })).slice(0, 5),
    next_best_action: String(parsed?.next_best_action || fallback.next_best_action),
    risk_flags: Array.isArray(parsed?.risk_flags) ? parsed.risk_flags.map(String).slice(0, 8) : fallback.risk_flags,
    hmi_summary: String(parsed?.hmi_summary || fallback.hmi_summary),
  }
}
