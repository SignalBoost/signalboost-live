import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { safeParseJSON } from '@/lib/ai/validation'
import type { BusinessAnalyzerSummary, ReviewStrategy } from '@/lib/outreach/types'

const ai = createPlatformAiPort()

export async function generateReviewStrategy(args: {
  analysis: BusinessAnalyzerSummary
  language?: string
}): Promise<ReviewStrategy> {
  const fallback: ReviewStrategy = {
    request_templates: [
      `Hi — thank you for choosing ${args.analysis.business_name}. If we helped, would you share a quick review? It helps local customers find us.`,
      `We appreciate your visit. A short review would mean a lot and helps us keep improving.`,
    ],
    follow_up_cadence: ['Send 2 hours after service', 'Send one friendly reminder after 3 days', 'Stop after one reminder'],
    distribution_plan: ['Google Business Profile', 'Website review page', 'Post-purchase SMS or email'],
    tone_guidelines: ['Warm', 'Brief', 'Grateful', 'No pressure'],
    hmi_summary: 'A lightweight review flow builds trust without overwhelming customers.',
  }

  const prompt = `Create a review strategy for this business. Return JSON:
{"request_templates":string[],"follow_up_cadence":string[],"distribution_plan":string[],"tone_guidelines":string[],"hmi_summary":string}
Language: ${args.language || 'en'}
Analysis: ${JSON.stringify(args.analysis)}`

  let raw = ''
  try { raw = await ai.generate({ modelPreference: 'claude', prompt, maxTokens: 1200 }) } catch {}
  const parsed = raw ? safeParseJSON(raw) : null
  return {
    request_templates: Array.isArray(parsed?.request_templates) ? parsed.request_templates.map(String).slice(0, 5) : fallback.request_templates,
    follow_up_cadence: Array.isArray(parsed?.follow_up_cadence) ? parsed.follow_up_cadence.map(String).slice(0, 5) : fallback.follow_up_cadence,
    distribution_plan: Array.isArray(parsed?.distribution_plan) ? parsed.distribution_plan.map(String).slice(0, 6) : fallback.distribution_plan,
    tone_guidelines: Array.isArray(parsed?.tone_guidelines) ? parsed.tone_guidelines.map(String).slice(0, 6) : fallback.tone_guidelines,
    hmi_summary: String(parsed?.hmi_summary || fallback.hmi_summary),
  }
}
