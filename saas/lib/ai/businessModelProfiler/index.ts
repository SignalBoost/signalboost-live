import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { safeParseJSON } from '@/lib/ai/validation'
import type { BusinessAnalyzerSummary, BusinessModelProfile } from '@/lib/outreach/types'

const ai = createPlatformAiPort()

function normalizeMaturity(value: string): 'low' | 'medium' | 'high' { if (value === 'high' || value === 'low') return value; return 'medium' }

export async function profileBusinessModel(args: { analysis: BusinessAnalyzerSummary; language?: string }): Promise<BusinessModelProfile> {
  const fallback: BusinessModelProfile = { revenue_model: 'service-based local business', pricing_style: 'quote or menu-based', customer_segments: ['local customers'], operational_style: 'appointment or walk-in service delivery', marketing_maturity: 'medium', management_style: { involvement: 'balanced', orientation: 'growth', preference: 'balanced' }, confidence: 0.62, hmi_summary: 'The business appears suited for practical growth assets: reviews, website clarity, promotions, and social consistency.' }
  const prompt = `Infer business-model metadata from public business analysis. This is NOT personal profiling. Describe business operations only. Return JSON with revenue_model, pricing_style, customer_segments, operational_style, marketing_maturity, management_style, confidence, hmi_summary.\nLanguage: ${args.language || 'en'}\nAnalysis: ${JSON.stringify(args.analysis)}`
  let raw = ''
  try { raw = await ai.generate({ modelPreference: 'openai', prompt, maxTokens: 1400 }) } catch {}
  const parsed = raw ? safeParseJSON(raw) : null
  const style = parsed?.management_style || {}
  return { revenue_model: String(parsed?.revenue_model || fallback.revenue_model), pricing_style: String(parsed?.pricing_style || fallback.pricing_style), customer_segments: Array.isArray(parsed?.customer_segments) ? parsed.customer_segments.map(String).slice(0, 8) : fallback.customer_segments, operational_style: String(parsed?.operational_style || fallback.operational_style), marketing_maturity: normalizeMaturity(String(parsed?.marketing_maturity || fallback.marketing_maturity)), management_style: { involvement: ['hands_on','balanced','hands_off'].includes(style.involvement) ? style.involvement : fallback.management_style.involvement, orientation: ['growth','stability','mixed'].includes(style.orientation) ? style.orientation : fallback.management_style.orientation, preference: ['design','speed','cost','balanced'].includes(style.preference) ? style.preference : fallback.management_style.preference }, confidence: Math.max(0, Math.min(1, Number(parsed?.confidence ?? fallback.confidence))), hmi_summary: String(parsed?.hmi_summary || fallback.hmi_summary) }
}
