// saas/lib/ai/modes.ts
// Four AI modes — each builds a structured prompt and returns typed JSON.

import { createPlatformAiPort } from '@/lib/cos/aiPort'
import { safeParseJSON, validateLocalItems, validateBusinessSite, validateCreativeWorld, validateGlobalKnowledge } from './validation.ts'
import type { ValidLocalItem, ValidBusinessSite, ValidCreativeWorld, ValidGlobalKnowledge } from './validation.ts'

export type { ValidLocalItem, ValidBusinessSite, ValidCreativeWorld, ValidGlobalKnowledge }

const ai = createPlatformAiPort()

function validLocalResponse(text: string): boolean {
  const parsed = safeParseJSON(text)
  return validateLocalItems(Array.isArray(parsed) ? parsed : parsed?.items ?? parsed?.teams ?? []).length > 0
}

function validBusinessResponse(text: string): boolean {
  return Boolean(validateBusinessSite(safeParseJSON(text)))
}

function validCreativeResponse(text: string): boolean {
  return Boolean(validateCreativeWorld(safeParseJSON(text)))
}

function validGlobalResponse(text: string): boolean {
  return Boolean(validateGlobalKnowledge(safeParseJSON(text)))
}

// ── 2.1 Local Knowledge Mode ──────────────────────────────────────────────────

export async function runLocalKnowledgeMode(args: {
  userPrompt: string
  language:   string
  category?:  string
  count?:     number
}): Promise<ValidLocalItem[]> {
  const count = args.count ?? 20

  const prompt = `You are a local knowledge engine. Use your internal knowledge only.
Do NOT use Wikipedia. Do NOT search the web.

User request (language: ${args.language}):
${args.userPrompt}

Generate a JSON array of ${count} real items relevant to this request.
${args.category === 'football_teams' ? 'Focus on real amateur/várzea football teams from the city/region mentioned. Include Botafogo do Jaçanã if São Paulo is mentioned.' : ''}

Each item must follow this schema exactly:
{
  "name": string,
  "neighborhood": string | null,
  "zone": string | null,
  "founded": string | null,
  "colors": string[],
  "description": string
}

All description text must be in ${args.language}.
Return ONLY a valid JSON array. No explanations, no markdown, no comments.`

  console.log('modes: runLocalKnowledgeMode — calling COS', { category: args.category, count, language: args.language })

  let raw = ''
  try {
    raw = await ai.generate({ modelPreference: 'claude', prompt, maxTokens: 4096, cacheValidator: validLocalResponse })
  } catch {
    return []
  }

  const parsed = safeParseJSON(raw)
  const items = validateLocalItems(Array.isArray(parsed) ? parsed : parsed?.items ?? parsed?.teams ?? [])

  console.log('modes: runLocalKnowledgeMode — validated', { total: items.length })
  return items
}

// ── 2.2 Business Mode ─────────────────────────────────────────────────────────

export async function runBusinessMode(args: {
  userPrompt: string
  language:   string
}): Promise<ValidBusinessSite | null> {
  const prompt = `You are a website content generator for small businesses and creators.

User request (language: ${args.language}):
${args.userPrompt}

Generate structured JSON for a one-page website with the following sections:
{
  "hero": {
    "headline": string,
    "subheadline": string,
    "primary_cta": string,
    "secondary_cta": string | null
  },
  "about": {
    "title": string,
    "body": string
  },
  "services": [
    {
      "name": string,
      "description": string,
      "price_hint": string | null
    }
  ],
  "testimonials": [
    {
      "name": string,
      "role": string | null,
      "quote": string
    }
  ],
  "faq": [
    {
      "question": string,
      "answer": string
    }
  ],
  "contact": {
    "headline": string,
    "body": string,
    "cta": string
  }
}

All text must be in ${args.language}.
Return ONLY valid JSON. No explanations, no markdown.`

  console.log('modes: runBusinessMode — calling COS', { language: args.language })

  let raw = ''
  try {
    raw = await ai.generate({ modelPreference: 'openai', prompt, maxTokens: 2048, cacheValidator: validBusinessResponse })
  } catch {
    return null
  }

  return validateBusinessSite(safeParseJSON(raw))
}

// ── 2.3 Creative Mode ─────────────────────────────────────────────────────────

export async function runCreativeMode(args: {
  userPrompt: string
  language:   string
}): Promise<ValidCreativeWorld | null> {
  const prompt = `You are a creative world builder.

User request (language: ${args.language}):
${args.userPrompt}

Generate a JSON object with:
{
  "world_summary": string,
  "main_characters": [
    {
      "name": string,
      "role": string,
      "description": string
    }
  ],
  "locations": [
    {
      "name": string,
      "type": string,
      "description": string
    }
  ],
  "conflicts": [
    {
      "title": string,
      "description": string
    }
  ]
}

All text must be in ${args.language}.
Return ONLY valid JSON.`

  console.log('modes: runCreativeMode — calling COS', { language: args.language })

  let raw = ''
  try {
    raw = await ai.generate({ modelPreference: 'claude', prompt, maxTokens: 2048, cacheValidator: validCreativeResponse })
  } catch {
    return null
  }

  return validateCreativeWorld(safeParseJSON(raw))
}

// ── 2.4 Global Knowledge Mode ─────────────────────────────────────────────────

export async function runGlobalKnowledgeMode(args: {
  userPrompt: string
  language:   string
}): Promise<ValidGlobalKnowledge | null> {
  const prompt = `You are a global knowledge explainer.

User request (language: ${args.language}):
${args.userPrompt}

Generate a JSON object with:
{
  "topic": string,
  "summary": string,
  "key_points": string[],
  "related_entities": string[]
}

All text must be in ${args.language}.
Return ONLY valid JSON.`

  console.log('modes: runGlobalKnowledgeMode — calling COS', { language: args.language })

  let raw = ''
  try {
    raw = await ai.generate({ modelPreference: 'openai', prompt, maxTokens: 1024, cacheValidator: validGlobalResponse })
  } catch {
    return null
  }

  return validateGlobalKnowledge(safeParseJSON(raw))
}
