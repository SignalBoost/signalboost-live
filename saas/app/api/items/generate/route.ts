
// saas/app/api/items/generate/route.ts
//
// Local Knowledge Generation Engine
// When Wikipedia doesn't have the data (local teams, neighborhood restaurants,
// small businesses, etc.), this route asks Claude to use its own internal
// knowledge to generate structured items and saves them to Supabase.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildLocalKnowledgePrompt, type GeneratedItem } from '@/lib/ai/localKnowledge'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── Validate each item from Claude's response ─────────────────────────────────
function validateGeneratedItem(raw: any): GeneratedItem | null {
  if (!raw || typeof raw !== 'object') return null
  const name         = (raw.name || raw.nome || raw.title || '').toString().trim()
  const neighborhood = (raw.neighborhood || raw.bairro || raw.district || '').toString().trim()
  const zone         = (raw.zone || raw.zona || raw.region || '').toString().trim()
  if (!name || !neighborhood) return null
  return {
    name,
    neighborhood,
    zone:        zone || 'Unknown',
    founded:     raw.founded || raw.fundado || raw.ano_fundacao || null,
    colors:      Array.isArray(raw.colors) ? raw.colors : Array.isArray(raw.cores) ? raw.cores : [],
    description: (raw.description || raw.descricao || raw.desc || '').toString().trim() || `${name} — ${neighborhood}`,
    image_url:   raw.image_url || raw.logo || null,
    source_url:  `local-knowledge://${encodeURIComponent(name)}`,
    metadata:    { source: 'local-knowledge', category: raw.category || 'general', generated: true },
  }
}

// ── Save to Supabase items table (non-blocking) ───────────────────────────────
async function saveItems(items: GeneratedItem[]): Promise<number> {
  if (items.length === 0) return 0
  try {
    const db = supabaseAdmin()
    const rows = items.map(item => ({
      name:        item.name,
      description: item.description,
      image_url:   item.image_url,
      source_url:  item.source_url,
      metadata:    item.metadata,
    }))
    const { data, error } = await db
      .from('items')
      .upsert(rows, { onConflict: 'source_url' })
      .select('id')
    if (error) {
      console.error('items/generate: DB save error (non-blocking):', error.message)
      return 0
    }
    return data?.length ?? rows.length
  } catch (err) {
    console.error('items/generate: DB save exception (non-blocking):', err)
    return 0
  }
}

// ── Call Claude with local knowledge prompt ───────────────────────────────────
async function callClaude(prompt: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        system:     'You are a local knowledge engine. You have deep knowledge of cities, neighborhoods, sports teams, restaurants, businesses and culture worldwide. Always respond with valid JSON only — no markdown, no backticks, no prose.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    })
    if (!response.ok) {
      console.error('items/generate: Claude error', response.status, await response.text())
      return null
    }
    const data = await response.json()
    return data.content?.[0]?.text || ''
  } catch (err) {
    console.error('items/generate: Claude exception', err)
    return null
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body       = await req.json()
    const userPrompt = (body?.userPrompt || '').toString().trim()
    const language   = (body?.language   || 'en').toString().trim()
    const category   = (body?.category   || 'general').toString().trim()
    const count      = Math.min(Number(body?.count) || 20, 40)

    if (!userPrompt) {
      return NextResponse.json({ error: 'userPrompt is required' }, { status: 400 })
    }

    console.log('items/generate: request received', { userPrompt, language, category, count })

    // 1. Build the structured prompt
    const prompt = buildLocalKnowledgePrompt({ userPrompt, language, category, count })

    // 2. Call Claude
    const raw = await callClaude(prompt)
    if (!raw) {
      console.error('items/generate: Claude returned null')
      return NextResponse.json({ error: 'AI model unavailable. Please try again.' }, { status: 502 })
    }

    console.log('items/generate: Claude response received, length:', raw.length)

    // 3. Parse the JSON array Claude returns
    let parsed: any[] = []
    try {
      const firstBracket = raw.indexOf('[')
      const lastBracket  = raw.lastIndexOf(']')
      if (firstBracket !== -1 && lastBracket > firstBracket) {
        parsed = JSON.parse(raw.slice(firstBracket, lastBracket + 1))
      } else {
        // Try wrapping as object with array
        const firstBrace = raw.indexOf('{')
        const lastBrace  = raw.lastIndexOf('}')
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          const obj = JSON.parse(raw.slice(firstBrace, lastBrace + 1))
          parsed = obj.items || obj.teams || obj.results || obj.data || []
        }
      }
    } catch (parseErr) {
      console.error('items/generate: JSON parse failed', parseErr, 'raw:', raw.slice(0, 200))
      return NextResponse.json({ error: 'AI returned invalid JSON. Please try again.' }, { status: 502 })
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      console.error('items/generate: empty or non-array response')
      return NextResponse.json({ error: 'AI returned no items. Please try again.' }, { status: 502 })
    }

    // 4. Validate each item
    const validItems: GeneratedItem[] = []
    const skippedItems: any[]         = []

    for (const raw of parsed) {
      const item = validateGeneratedItem({ ...raw, category })
      if (item) validItems.push(item)
      else skippedItems.push(raw)
    }

    console.log('items/generate: validation complete', {
      total:   parsed.length,
      valid:   validItems.length,
      skipped: skippedItems.length,
    })

    // 5. Save to DB (non-blocking — never kills the response)
    const saved = await saveItems(validItems)
    console.log('items/generate: saved to DB', { saved, total: validItems.length })

    const duration = Date.now() - startTime

    return NextResponse.json({
      items:    validItems,
      count:    validItems.length,
      saved,
      skipped:  skippedItems.length,
      source:   'local-knowledge',
      category,
      language,
      duration,
      log: {
        intent:        'local_knowledge',
        mode:          'Local Knowledge Engine',
        claudeUsed:    true,
        itemsGenerated: parsed.length,
        itemsValid:    validItems.length,
        itemsSaved:    saved,
        durationMs:    duration,
      },
    })
  } catch (error) {
    console.error('items/generate: unhandled error', error)
    return NextResponse.json({ error: 'Something went wrong generating items.' }, { status: 500 })
  }
}
