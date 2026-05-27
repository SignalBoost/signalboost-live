// saas/app/api/sites/generate/route.ts
// Generates REAL website content from a user's description using Claude.
// Output matches exactly the shape the public renderer expects
// (saas/app/s/[handle]/page.tsx): businessName, headline, tagline, colors, sections[].
//
// This route only GENERATES and returns content. It does not publish.
// Publishing (saving + going live) is handled by the apply route.

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
        max_tokens: 2048,
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

const SYSTEM_PROMPT = `You are SignalBoost's website content generator. A user describes their business or idea. You produce the COMPLETE content for a real, publishable one-page website.

LANGUAGE (CRITICAL):
- Detect the language the user wrote in and write EVERY piece of text in that same language (Portuguese -> Brazilian Portuguese, Spanish -> Spanish, Polish -> Polish, Russian -> Russian, English -> English).

CONTENT QUALITY:
- Write real, specific, professional copy for THEIR actual business — never placeholder text, never "lorem ipsum", never "[your text here]".
- If details are missing, infer sensible, realistic content from the business type. Do not leave blanks.
- Choose colors that genuinely fit the business mood (a law firm is not the same palette as a kids' party service).

OUTPUT FORMAT (STRICT):
Respond with ONLY a valid JSON object — no markdown, no backticks, no text before or after. Exactly this shape:
{
  "businessName": "the business name",
  "headline": "a strong hero headline",
  "tagline": "a short supporting line under the headline",
  "colors": { "primary": "#xxxxxx", "accent": "#xxxxxx", "background": "#xxxxxx", "text": "#xxxxxx" },
  "sections": [
    { "type": "hero", "heading": "hero heading", "body": "1-2 sentence intro", "cta": "a call-to-action button label" },
    { "type": "about", "heading": "about heading", "body": "a real paragraph about the business" },
    { "type": "services", "heading": "services/offerings heading", "items": [ { "title": "offering name", "body": "one sentence" }, { "title": "...", "body": "..." }, { "title": "...", "body": "..." } ] },
    { "type": "contact", "heading": "contact heading", "body": "a short invitation to get in touch", "email": "a plausible contact email or empty string", "phone": "a phone or empty string" }
  ]
}

RULES:
- Valid JSON only: double quotes, hex colors starting with #, no trailing commas.
- Always include all four sections (hero, about, services, contact), services with 3 items.
- Keep copy concise and natural in the user's language.
- Do not wrap the JSON in code fences.`

function coerceContent(parsed: any) {
  // Defensive normalization so the renderer always receives a valid shape.
  const colors = parsed?.colors || {}
  const sections = Array.isArray(parsed?.sections) ? parsed.sections : []
  return {
    businessName: typeof parsed?.businessName === 'string' ? parsed.businessName : '',
    headline: typeof parsed?.headline === 'string' ? parsed.headline : '',
    tagline: typeof parsed?.tagline === 'string' ? parsed.tagline : '',
    colors: {
      primary: typeof colors.primary === 'string' ? colors.primary : '#3b82f6',
      accent: typeof colors.accent === 'string' ? colors.accent : '#ffc300',
      background: typeof colors.background === 'string' ? colors.background : '#ffffff',
      text: typeof colors.text === 'string' ? colors.text : '#1a1a1a',
    },
    sections: sections.map((s: any) => ({
      type: typeof s?.type === 'string' ? s.type : 'about',
      heading: typeof s?.heading === 'string' ? s.heading : undefined,
      body: typeof s?.body === 'string' ? s.body : undefined,
      cta: typeof s?.cta === 'string' ? s.cta : undefined,
      email: typeof s?.email === 'string' ? s.email : undefined,
      phone: typeof s?.phone === 'string' ? s.phone : undefined,
      items: Array.isArray(s?.items)
        ? s.items
            .filter((it: any) => it && (typeof it.title === 'string' || typeof it.body === 'string'))
            .map((it: any) => ({
              title: typeof it.title === 'string' ? it.title : undefined,
              body: typeof it.body === 'string' ? it.body : undefined,
            }))
        : undefined,
    })),
  }
}

export async function POST(req: NextRequest) {
  try {
    // Must be logged in to generate site content.
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
      return NextResponse.json({ error: 'I could not generate the website content right now. Please try again.' }, { status: 502 })
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

    if (!parsed || typeof parsed.businessName !== 'string' || !Array.isArray(parsed.sections)) {
      return NextResponse.json({ error: 'The generated content was not valid. Please try again.' }, { status: 502 })
    }

    const content = coerceContent(parsed)
    return NextResponse.json({ content })
  } catch (error) {
    console.error('Sites generate error', error)
    return NextResponse.json({ error: 'Something went wrong generating the website.' }, { status: 500 })
  }
}
