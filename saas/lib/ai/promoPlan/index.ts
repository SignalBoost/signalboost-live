import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { safeParseJSON } from '@/lib/ai/validation'
import type { BusinessAnalyzerSummary, PredictiveNeeds, PromoPlan } from '@/lib/outreach/types'

const ai = createPlatformAiPort()

export async function generatePromoPlan(args: {
  analysis: BusinessAnalyzerSummary
  predictiveNeeds: PredictiveNeeds
  language?: string
}): Promise<PromoPlan> {
  const fallback: PromoPlan = {
    promotional_ideas: ['New customer welcome offer', 'Review-and-return loyalty offer', 'Seasonal service bundle'],
    email_campaign: {
      subject: `${args.analysis.business_name}: a timely offer for local customers`,
      body: `Introduce a clear, friendly promotion connected to ${args.analysis.services[0] || 'your core service'} and invite customers to reply or book.`
    },
    sms_campaign: `${args.analysis.business_name}: limited-time local offer. Reply to learn more or book today.`,
    flyer_message: `Fresh local offer from ${args.analysis.business_name}. Simple, helpful, and easy to redeem.`,
    hmi_summary: 'Promotions are designed to be practical, respectful, and easy for the business to approve.',
  }

  const prompt = `Create a promotional campaign plan. Return JSON:
{"promotional_ideas":string[],"email_campaign":{"subject":string,"body":string},"sms_campaign":string,"flyer_message":string,"hmi_summary":string}
Need 3 promotional ideas, 1 email, 1 SMS, 1 flyer-style message.
Language: ${args.language || 'en'}
Analysis: ${JSON.stringify(args.analysis)}
Predicted needs: ${JSON.stringify(args.predictiveNeeds)}`

  let raw = ''
  try { raw = await ai.generate({ prompt, maxTokens: 1400 }) } catch {}
  const parsed = raw ? safeParseJSON(raw) : null
  return {
    promotional_ideas: Array.isArray(parsed?.promotional_ideas) ? parsed.promotional_ideas.map(String).slice(0, 3) : fallback.promotional_ideas,
    email_campaign: {
      subject: String(parsed?.email_campaign?.subject || fallback.email_campaign.subject),
      body: String(parsed?.email_campaign?.body || fallback.email_campaign.body),
    },
    sms_campaign: String(parsed?.sms_campaign || fallback.sms_campaign).slice(0, 320),
    flyer_message: String(parsed?.flyer_message || fallback.flyer_message),
    hmi_summary: String(parsed?.hmi_summary || fallback.hmi_summary),
  }
}
