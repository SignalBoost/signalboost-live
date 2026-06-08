import { callModel } from '@/lib/ai/modelRouter'
import { assertSafeOutreachMessage } from '@/lib/ai/guardrails'
import type { OutreachAssets } from '@/lib/outreach/types'

export type OutreachCategory = 'affiliate' | 'company' | 'media'

export type OutreachMessageSet = {
  email_subject: string
  email: string
  linkedin: string
  social_dm: string
}

// Factual, shared description of BOTH live platforms — used to ground every message.
const PLATFORM_CONTEXT = `SignalBoost is two live platforms working together:
1) signalboostapp.com — a digital AI shopping mall with 125+ affiliates (e.g. Trivago, Expedia, Booking.com). Every customer purchase or booking through the mall generates commission payouts for affiliates. Includes Cowork tools (calendar, spreadsheets).
2) saas.signalboostapp.com — a full SaaS platform: AI website builder, Review → branded content generator, image/video/audio studios, multilingual support (English, Spanish, Portuguese, Polish, Russian), and Cowork tools.`

// Category-specific angle, taken from the outreach kit.
function categoryAngle(category: OutreachCategory): string {
  switch (category) {
    case 'affiliate':
      return `AUDIENCE: Affiliate / partner brand.
Emphasize: commissions — every booking or purchase through SignalBoost generates payouts for affiliates. Visibility — their offers are showcased in the AI mall alongside 125+ partners. Added SaaS value — SignalBoost amplifies their listings with branded content, websites, and multilingual campaigns.`
    case 'media':
      return `AUDIENCE: Media / social platform.
Emphasize: integration potential — SignalBoost generates ready-to-publish content tailored for social platforms. Collaboration — it helps businesses create posts, campaigns, and websites that drive engagement on the platform. Position SignalBoost as a partner, not a competitor.`
    case 'company':
    default:
      return `AUDIENCE: Business / company.
Emphasize: growth tools — SignalBoost turns reviews into branded posts, builds AI websites, and automates campaigns. Multilingual reach. Hybrid positioning — SignalBoost is both a digital mall and a full SaaS platform.`
  }
}

function fallbackSet(businessName: string, category: OutreachCategory): OutreachMessageSet {
  const name = businessName || 'there'
  const commissionLine =
    category === 'affiliate'
      ? ' At signalboostapp.com, our AI mall hosts 125+ affiliates where every customer purchase generates commission payouts.'
      : ''
  const email = `Hi ${name},

I'm with SignalBoost, a hybrid AI platform — part digital shopping mall, part full SaaS solution.${commissionLine} At saas.signalboostapp.com we provide a full SaaS suite: an AI website builder, a review-to-branded-content generator, image/video/audio studios, multilingual support, and Cowork tools.

We prepared a tailored preview showing how SignalBoost can help you grow visibility, automate content, and reach customers in multiple languages. If helpful, I can send it over for you to review, edit, or approve — no pressure, just something we thought you'd find useful.

Best regards,
The SignalBoost Team`

  const linkedin = `Hi ${name}, I'm with SignalBoost, a hybrid AI platform — part digital mall with 125+ affiliates, part full SaaS solution. We help businesses create branded content, websites, and campaigns in multiple languages while also driving commissionable sales. Would love to connect and share a preview tailored for your brand.`

  const social_dm = `Hey ${name}! I'm with SignalBoost — we're both a digital mall (125+ affiliates, commissionable sales) and a full SaaS platform (AI websites, branded content, multilingual campaigns). We built a quick preview showing how SignalBoost can help your business grow — want me to send it over?`

  return {
    email_subject: 'SignalBoost — AI Mall + SaaS Growth Preview',
    email,
    linkedin,
    social_dm,
  }
}

export async function generateOutreachMessage(args: {
  assets: Omit<OutreachAssets, 'outreach_message'>
  language?: string
  category?: OutreachCategory
}): Promise<string> {
  const analysis = args.assets.analyzer_summary
  const businessName = analysis?.business_name || ''
  const category: OutreachCategory = args.category || 'company'
  const language = args.language || 'en'

  const fallback = fallbackSet(businessName, category)

  const prompt = `You write outreach for SignalBoost. Produce THREE messages introducing SignalBoost to a prospect, grounded ONLY in the factual platform context below. Do not invent features beyond it.

${PLATFORM_CONTEXT}

${categoryAngle(category)}

Tone: professional, friendly, respectful, value-first. No hard sell. No guarantees of results. No claim of private/inside data access — only public info was reviewed. Personalize using the business analysis.

Reference that a tailored preview (website concept, review strategy, social plan, promo ideas) was already prepared and can be sent for review/edit/approval.

Write in this language: ${language}

Business analysis (public info): ${JSON.stringify(analysis)}
Predicted needs: ${JSON.stringify(args.assets.predictive_needs)}

Return ONLY valid JSON, no markdown, in exactly this shape:
{
  "email_subject": string,
  "email": string,
  "linkedin": string,
  "social_dm": string
}`

  const raw = await callModel({ modelPreference: 'claude', prompt, maxTokens: 1400 })

  // Parse the model's JSON; fall back to the kit-based default set on any failure.
  let set: OutreachMessageSet = fallback
  if (raw) {
    try {
      let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
      const start = cleaned.indexOf('{')
      const end = cleaned.lastIndexOf('}')
      if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1)
      const parsed = JSON.parse(cleaned)
      set = {
        email_subject: String(parsed.email_subject || fallback.email_subject),
        email: String(parsed.email || fallback.email),
        linkedin: String(parsed.linkedin || fallback.linkedin),
        social_dm: String(parsed.social_dm || fallback.social_dm),
      }
    } catch {
      set = fallback
    }
  }

  // Run the primary (email) message through the existing safety guardrail.
  // If it blocks, fall back to the safe kit default for the email body only.
  const safe = assertSafeOutreachMessage(set.email)
  const emailBody = safe.ok ? set.email : fallback.email

  // The pipeline stores a single string. Return a combined, structured text block
  // containing all three messages so nothing is lost and the UI can show them.
  return [
    `SUBJECT: ${set.email_subject}`,
    ``,
    `--- EMAIL ---`,
    emailBody,
    ``,
    `--- LINKEDIN ---`,
    set.linkedin,
    ``,
    `--- SOCIAL DM ---`,
    set.social_dm,
  ].join('\n')
}
