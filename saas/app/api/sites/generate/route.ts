// saas/app/api/sites/generate/route.ts
// Generates a REAL, fully-designed website from a user's description using Claude.
// The AI acts as a designer: it chooses a theme (light/dark), a distinctive
// font pairing, a cohesive palette, and composes a rich, varied set of sections
// (multiple heroes, feature grids, stats, gallery, video, testimonials, CTA,
// contact) — all in the user's language. Output matches the design-engine
// renderer at saas/app/s/[handle]/page.tsx.

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

async function callClaude(systemPrompt: string, userContent: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })
    if (!response.ok) {
      const errorBody = await response.text()
      console.error('Sites generate Anthropic:', response.status, errorBody)
      return null
    }
    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    console.error('Sites generate Claude error', err)
    return null
  }
}

const DISPLAY_FONTS = ['Fraunces', 'Playfair Display', 'Bricolage Grotesque', 'Space Grotesk', 'Syne', 'Sora', 'DM Serif Display', 'Archivo', 'Unbounded']
const BODY_FONTS = ['DM Sans', 'Manrope', 'Work Sans', 'Outfit', 'Spline Sans', 'Newsreader', 'IBM Plex Sans']

const SYSTEM_PROMPT = `You are an elite brand and web designer working inside SignalBoost. From a short description, you design a COMPLETE, visually striking one-page website and return it as structured JSON.

LANGUAGE (CRITICAL):
- Detect the language the user wrote in and write EVERY visible text value in that same language (Brazilian Portuguese, Spanish, Polish, Russian, or English).

DESIGN LIKE A SENIOR DESIGNER (no generic "AI slop"):
- Commit to a BOLD, cohesive aesthetic that fits THIS specific business. A nightclub, a law firm, a bakery, and a fintech app must each look clearly different.
- Choose theme intentionally: "dark" for dramatic, premium, nightlife, tech, creative brands; "light" for clean, friendly, wellness, food, professional services. Decide per business.
- Pick a distinctive FONT PAIRING. Display font from: ${DISPLAY_FONTS.join(', ')}. Body font from: ${BODY_FONTS.join(', ')}. Pair a characterful display with a clean body. Vary your choices between businesses — do not always pick the same fonts.
- Choose a cohesive PALETTE with a dominant color and a sharp accent (hex values). Dark themes need a deep background (e.g. #0a0a12) and luminous accents; light themes need a clean background and confident color. Avoid cliché purple-on-white.
- Compose a RICH, VARIED page: a strong hero, then a deliberate sequence of sections. Use MULTIPLE heroes when it fits, and mix section types for visual rhythm. A flat list of plain text blocks is a failure.

SECTION TYPES YOU CAN USE (compose 5-8 sections in a deliberate order):
- "hero": full-bleed atmospheric hero. Fields: eyebrow, heading, subheading, cta, ctaSecondary.
- "hero-split": hero with a side panel. Same fields + body (shown in the side panel).
- "feature-grid": fields: eyebrow, heading, subheading, items[] each {icon (1 emoji), title, body}. Use 3-6 items.
- "stats": fields: heading (optional), stats[] each {value, label}. Use 3-4 punchy stats.
- "gallery": fields: heading, items[] each {title}. Use 3-6 tiles.
- "video": fields: eyebrow, heading, subheading, videoUrl (leave videoUrl as "" — the platform fills it). Include a video section when it suits the business.
- "testimonials": fields: heading, testimonials[] each {quote, author, role}. Use 2-3.
- "cta": a bold call-to-action band. Fields: heading, subheading, cta.
- "contact": fields: eyebrow, heading, body, email, phone, address. Invent plausible contact details if none given.
- "about" / "text": fields: eyebrow, heading, body. A rich paragraph.

OUTPUT FORMAT (STRICT):
Return ONLY valid JSON — no markdown, no backticks, no text before or after. Exactly this shape:
{
  "businessName": "string",
  "theme": "light" | "dark",
  "fonts": { "display": "one of the display fonts", "body": "one of the body fonts" },
  "palette": { "primary": "#xxxxxx", "accent": "#xxxxxx", "background": "#xxxxxx", "surface": "#xxxxxx or rgba", "text": "#xxxxxx", "muted": "#xxxxxx or rgba" },
  "sections": [ { "type": "hero", "eyebrow": "...", "heading": "...", "subheading": "...", "cta": "...", "ctaSecondary": "..." }, ...more sections... ]
}

RULES:
- Valid JSON only: double quotes, hex colors start with #, no trailing commas.
- Real, specific, professional copy — never placeholder text, never lorem ipsum, never "[your text]".
- 5 to 8 sections, always starting with a hero and ending with a contact (and usually a cta before contact).
- Pick fonts and palette that genuinely fit the business; vary them across different businesses.
- Keep copy concise and natural in the user's language.`

function isValidContent(p: any): boolean {
  return p && typeof p.businessName === 'string' && Array.isArray(p.sections) && p.sections.length > 0
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to generate a website.' }, { status: 401 })
    }

    const body = await req.json()
    const description = body?.description
    if (!description || typeof description !== 'string' || description.trim().length < 4) {
      return NextResponse.json({ error: 'Please describe the website you want.' }, { status: 400 })
    }

    const raw = await callClaude(SYSTEM_PROMPT, description.trim())
    if (!raw) {
      return NextResponse.json({ error: 'I could not generate the website right now. Please try again.' }, { status: 502 })
    }

    let parsed: any = null
    try {
      const firstBrace = raw.indexOf('{')
      const lastBrace = raw.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
      }
    } catch {
      parsed = null
    }

    if (!isValidContent(parsed)) {
      // Don't hand the user broken output — return a clear error rather than a placeholder site.
      return NextResponse.json({ error: 'The generated design was not valid. Please try again.' }, { status: 502 })
    }

    // Normalize theme to allowed values.
    if (parsed.theme !== 'dark' && parsed.theme !== 'light') parsed.theme = 'light'

    return NextResponse.json({ content: parsed })
  } catch (error) {
    console.error('Sites generate error', error)
    return NextResponse.json({ error: 'Something went wrong generating the website.' }, { status: 500 })
  }
}
