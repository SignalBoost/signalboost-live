
// saas/app/api/items/generate/route.ts
//
// Local Knowledge Generation Engine
// When Wikipedia doesn't have the data (local teams, neighborhood restaurants,
// small businesses, etc.), this route asks Claude to use its own internal
// knowledge to generate structured items and saves them to Supabase.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { type GeneratedItem } from '@/lib/ai/localKnowledge'
import { runLocalKnowledgeMode } from '@/lib/ai/modes'
import { saveLocalItems as saveAiLocalItems } from '@/lib/ai/memory'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
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

    const localItems = await runLocalKnowledgeMode({ userPrompt, language, category, count })

    const validItems: GeneratedItem[] = localItems.map(item => ({
      name: item.name,
      neighborhood: item.neighborhood || 'Unknown',
      zone: item.zone || 'Unknown',
      founded: item.founded,
      colors: item.colors,
      description: item.description,
      image_url: null,
      source_url: `local-knowledge://${encodeURIComponent(item.name)}`,
      metadata: { source: 'local-knowledge', category, generated: true, orchestrated: true },
    }))

    console.log('items/generate: orchestration validation complete', {
      total: localItems.length,
      valid: validItems.length,
    })

    const saved = await saveItems(validItems)
    await saveAiLocalItems(localItems, { userPrompt, language, category })
    console.log('items/generate: saved to DB', { saved, aiMemorySaved: localItems.length })

    const duration = Date.now() - startTime

    return NextResponse.json({
      items: validItems,
      count: validItems.length,
      saved,
      skipped: 0,
      source: 'local-knowledge',
      category,
      language,
      duration,
      log: {
        intent: 'local_knowledge',
        mode: 'Local Knowledge Mode',
        modelRouterUsed: true,
        itemsGenerated: localItems.length,
        itemsValid: validItems.length,
        itemsSaved: saved,
        durationMs: duration,
      },
    })
  } catch (error) {
    console.error('items/generate: unhandled error', error)
    return NextResponse.json({ error: 'Something went wrong generating items.' }, { status: 500 })
  }
}
