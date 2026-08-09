import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { safeParseJSON } from '@/lib/ai/validation'
import type { BusinessAnalyzerSummary, SocialPlan } from '@/lib/outreach/types'

const ai = createPlatformAiPort()

export async function generateSocialPlan(args: {
  analysis: BusinessAnalyzerSummary
  language?: string
}): Promise<SocialPlan> {
  const fallbackCalendar = Array.from({ length: 7 }, (_, i) => ({
    day: i + 1,
    theme: ['Trust', 'Service', 'Behind the scenes', 'Offer', 'Education', 'Customer story', 'Community'][i],
    caption: `${args.analysis.business_name}: ${args.analysis.opportunities[i % Math.max(1, args.analysis.opportunities.length)] || 'helpful local update'}.`,
    hashtags: ['#localbusiness', '#signalboost', `#${args.analysis.business_type.replace(/\s+/g, '')}`],
  }))

  const fallback: SocialPlan = {
    brand_tone_summary: args.analysis.tone,
    seven_day_calendar: fallbackCalendar,
    post_ideas: ['Customer spotlight', 'Before-and-after', 'Service explainer', 'FAQ post', 'Limited-time offer', 'Team introduction', 'Local community post', 'Review highlight', 'Process video', 'Seasonal tip'],
    hmi_summary: 'The plan turns public business strengths into one week of consistent, low-friction content.',
  }

  const prompt = `Create a social content plan. Return JSON:
{"brand_tone_summary":string,"seven_day_calendar":[{"day":number,"theme":string,"caption":string,"hashtags":string[]}],"post_ideas":string[],"hmi_summary":string}
Need exactly 7 calendar days and 10 post ideas.
Language: ${args.language || 'en'}
Analysis: ${JSON.stringify(args.analysis)}`

  let raw = ''
  try { raw = await ai.generate({ modelPreference: 'claude', prompt, maxTokens: 1800 }) } catch {}
  const parsed = raw ? safeParseJSON(raw) : null
  return {
    brand_tone_summary: String(parsed?.brand_tone_summary || fallback.brand_tone_summary),
    seven_day_calendar: Array.isArray(parsed?.seven_day_calendar) ? parsed.seven_day_calendar.map((item: any, i: number) => ({
      day: Number(item?.day || i + 1),
      theme: String(item?.theme || fallbackCalendar[i % 7].theme),
      caption: String(item?.caption || fallbackCalendar[i % 7].caption),
      hashtags: Array.isArray(item?.hashtags) ? item.hashtags.map(String).slice(0, 8) : fallbackCalendar[i % 7].hashtags,
    })).slice(0, 7) : fallback.seven_day_calendar,
    post_ideas: Array.isArray(parsed?.post_ideas) ? parsed.post_ideas.map(String).slice(0, 10) : fallback.post_ideas,
    hmi_summary: String(parsed?.hmi_summary || fallback.hmi_summary),
  }
}
