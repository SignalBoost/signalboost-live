// saas/lib/ai/modes.ts
// Four AI modes — each builds a structured prompt and returns typed JSON.

import { callModel } from './modelRouter'
import { safeParseJSON, validateLocalItems, validateBusinessSite, validateCreativeWorld, validateGlobalKnowledge } from './validation'
import type { ValidLocalItem, ValidBusinessSite, ValidCreativeWorld, ValidGlobalKnowledge } from './validation'

export type { ValidLocalItem, ValidBusinessSite, ValidCreativeWorld, ValidGlobalKnowledge }

// ── 2.1 Local Knowledge Mode ──────────────────────────────────────────────────

export async function runLocalKnowledgeMode(args: {
  userPrompt: string
  language:   string
  category?:  string
  count?:     number
  extraContext?: unknown
}): Promise<ValidLocalItem[]> {
  const count = args.count ?? 30

  const prompt = `You are a local knowledge engine. Use your internal knowledge only.
Do NOT use Wikipedia. Do NOT search the web.

User request (language: ${args.language}):
${args.userPrompt}

Generate a JSON array of ${Math.min(40, Math.max(20, count))} items relevant to this request.
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

  console.log('modes: runLocalKnowledgeMode — calling Claude', { category: args.category, count, language: args.language })

  const raw = await callModel({ intent: 'local_knowledge', prompt, maxTokens: 4096 })
  const parsed = safeParseJSON(raw)
  console.log('modes: runLocalKnowledgeMode — JSON parsing', { success: parsed !== null })
  const items  = validateLocalItems(Array.isArray(parsed) ? parsed : parsed?.items ?? parsed?.teams ?? [])

  console.log('modes: runLocalKnowledgeMode — validated', { total: items.length })
  return items
}

// ── 2.2 Business Mode ─────────────────────────────────────────────────────────

export async function runBusinessMode(args: {
  userPrompt: string
  language:   string
  extraContext?: unknown
}): Promise<ValidBusinessSite> {
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

  console.log('modes: runBusinessMode — calling OpenAI', { language: args.language })

  const raw = await callModel({ intent: 'business', prompt, maxTokens: 2048 })
  const parsed = safeParseJSON(raw)
  console.log('modes: runBusinessMode — JSON parsing', { success: parsed !== null })
  return validateBusinessSite(parsed)
}

// ── 2.3 Creative Mode ─────────────────────────────────────────────────────────

export async function runCreativeMode(args: {
  userPrompt: string
  language:   string
  extraContext?: unknown
}): Promise<ValidCreativeWorld> {
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

  console.log('modes: runCreativeMode — calling Claude', { language: args.language })

  const raw = await callModel({ intent: 'creative', prompt, maxTokens: 2048 })
  const parsed = safeParseJSON(raw)
  console.log('modes: runCreativeMode — JSON parsing', { success: parsed !== null })
  return validateCreativeWorld(parsed)
}

// ── 2.4 Global Knowledge Mode ─────────────────────────────────────────────────

export async function runGlobalKnowledgeMode(args: {
  userPrompt: string
  language:   string
  extraContext?: unknown
}): Promise<ValidGlobalKnowledge> {
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

  console.log('modes: runGlobalKnowledgeMode — calling OpenAI', { language: args.language })

  const raw = await callModel({ intent: 'global_knowledge', prompt, maxTokens: 1024 })
  const parsed = safeParseJSON(raw)
  console.log('modes: runGlobalKnowledgeMode — JSON parsing', { success: parsed !== null })
  return validateGlobalKnowledge(parsed)
}
