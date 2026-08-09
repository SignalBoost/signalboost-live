// saas/lib/ai/outreachMessage/index.ts
import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import type { OutreachAssets } from '@/lib/outreach/types'

const ai = createPlatformAiPort()

export type OutreachCategory = 'affiliate' | 'company' | 'media'
export type OutreachMessageSet = { email_subject: string; email: string; linkedin: string; social_dm: string }

const PLATFORM_CONTEXT = `SignalBoost is two live platforms working together:
1) signalboostapp.com — a digital AI shopping mall with 125+ affiliates. Every customer purchase or booking through the mall generates commission payouts for affiliates. Includes Cowork tools.
2) saas.signalboostapp.com — a full SaaS platform: AI website builder, Review → branded content generator, image/video/audio studios, multilingual support, and Cowork tools.`

function categoryAngle(category: OutreachCategory): string {
  if (category === 'affiliate') return 'AUDIENCE: Affiliate / partner brand. Emphasize commissionable sales, visibility, and SaaS amplification.'
  if (category === 'media') return 'AUDIENCE: Media / social platform. Emphasize integration, ready-to-publish content, and collaboration.'
  return 'AUDIENCE: Business / company. Emphasize growth tools, multilingual reach, and hybrid mall/SaaS positioning.'
}

function fallbackSet(businessName: string, category: OutreachCategory): OutreachMessageSet {
  const name = businessName || 'there'
  const commissionLine = category === 'affiliate' ? ' At signalboostapp.com, our AI mall hosts 125+ affiliates where every customer purchase generates commission payouts.' : ''
  return {
    email_subject: 'SignalBoost — AI Mall + SaaS Growth Preview',
    email: `Hi ${name},\n\nI'm with SignalBoost, a hybrid AI platform — part digital shopping mall, part full SaaS solution.${commissionLine} At saas.signalboostapp.com we provide an AI website builder, review-to-branded-content generation, media studios, multilingual support, and Cowork tools.\n\nWe prepared a tailored preview showing how SignalBoost can help grow visibility and automate content. If helpful, I can send it for review.\n\nBest regards,\nThe SignalBoost Team`,
    linkedin: `Hi ${name}, I'm with SignalBoost, a hybrid AI platform. We help businesses create branded content, websites, and multilingual campaigns while driving commissionable sales.`,
    social_dm: `Hey ${name}! I'm with SignalBoost — a digital mall and SaaS platform. Want me to send a quick tailored preview?`,
  }
}

export async function generateOutreachMessage(args: { assets: Omit<OutreachAssets, 'outreach_message'>; language?: string; category?: OutreachCategory; offer?: string }): Promise<string> {
  const analysis = args.assets.analyzer_summary
  const businessName = analysis?.business_name || ''
  const category: OutreachCategory = args.category || 'company'
  const language = args.language || 'en'
  const fallback = fallbackSet(businessName, category)
  const offer = String(args.offer || '').replace(/\s+/g, ' ').trim().slice(0, 2_000)

  const offerPrompt = `You write B2B outreach on behalf of SignalBoost. Produce ONE email introducing the specific offer below to a prospect.\nWHAT IS BEING SOLD: ${offer}\nDo not mention unrelated SignalBoost products. Professional, specific, value-first. No guarantees or private-data claims. One CTA. 120-220 words.\nLanguage: ${language}\nBusiness analysis: ${JSON.stringify(analysis)}\nPredicted needs: ${JSON.stringify(args.assets.predictive_needs)}\nReturn ONLY JSON: {"email_subject":string,"email":string}`
  const platformPrompt = `You write outreach for SignalBoost. Produce THREE messages grounded ONLY in this context:\n${PLATFORM_CONTEXT}\n${categoryAngle(category)}\nProfessional, friendly, value-first. No guarantees or private-data claims. Mention that a tailored preview was prepared.\nLanguage: ${language}\nBusiness analysis: ${JSON.stringify(analysis)}\nPredicted needs: ${JSON.stringify(args.assets.predictive_needs)}\nReturn ONLY JSON: {"email_subject":string,"email":string,"linkedin":string,"social_dm":string}`

  let raw = ''
  try { raw = await ai.generate({ modelPreference: 'claude', prompt: offer ? offerPrompt : platformPrompt, maxTokens: 1400 }) } catch {}
  let set: OutreachMessageSet = fallback
  if (raw) {
    try {
      let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
      const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}')
      if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1)
      const parsed = JSON.parse(cleaned)
      set = { email_subject: String(parsed.email_subject || fallback.email_subject), email: String(parsed.email || fallback.email), linkedin: String(parsed.linkedin || fallback.linkedin), social_dm: String(parsed.social_dm || fallback.social_dm) }
    } catch {}
  }
  const safe = assertSafeOutreachMessage(set.email)
  return [`SUBJECT: ${set.email_subject}`, ``, safe.ok ? set.email : fallback.email].join('\n')
}
