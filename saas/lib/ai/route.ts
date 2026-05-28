// saas/app/api/ai/route.ts
// Unified AI orchestration endpoint.
// POST { userPrompt, language } → detects intent → runs correct mode → returns typed data.

import { NextRequest, NextResponse } from 'next/server'
import { routeIntent, type IntentType } from '@/lib/ai/intentRouter'
import { runLocalKnowledgeMode, runBusinessMode, runCreativeMode, runGlobalKnowledgeMode } from '@/lib/ai/modes'
import { saveLocalItems, saveBusinessSite } from '@/lib/ai/memory'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body       = await req.json()
    const userPrompt = (body?.userPrompt || '').toString().trim()
    const language   = (body?.language   || '').toString().trim() || undefined

    if (!userPrompt) {
      return NextResponse.json({ error: 'userPrompt is required' }, { status: 400 })
    }

    // ── Step 1: Route the intent ──────────────────────────────────────────────
    const routed = routeIntent({ userPrompt, language })

    console.log('api/ai: intent routed', {
      intent:     routed.intent,
      language:   routed.language,
      confidence: routed.confidence,
      reason:     routed.reason,
    })

    // ── Step 2: Run the correct mode ──────────────────────────────────────────
    let data: any = null
    let mode: IntentType = routed.intent

    if (routed.intent === 'local_knowledge') {
      console.log('api/ai: running LOCAL KNOWLEDGE mode')
      const items = await runLocalKnowledgeMode({
        userPrompt: routed.userPrompt,
        language:   routed.language,
      })
      data = items

      // Save to memory non-blocking
      if (items.length > 0) {
        saveLocalItems(items, { userPrompt: routed.userPrompt, language: routed.language }).catch(() => {})
      }

      console.log('api/ai: local knowledge mode complete', {
        itemCount: items.length,
        durationMs: Date.now() - startTime,
      })

    } else if (routed.intent === 'business') {
      console.log('api/ai: running BUSINESS mode')
      const site = await runBusinessMode({
        userPrompt: routed.userPrompt,
        language:   routed.language,
      })
      data = site

      if (site) {
        saveBusinessSite(site, { userPrompt: routed.userPrompt, language: routed.language }).catch(() => {})
      }

      console.log('api/ai: business mode complete', {
        hasData:    !!site,
        durationMs: Date.now() - startTime,
      })

    } else if (routed.intent === 'creative') {
      console.log('api/ai: running CREATIVE mode')
      const world = await runCreativeMode({
        userPrompt: routed.userPrompt,
        language:   routed.language,
      })
      data = world

      console.log('api/ai: creative mode complete', {
        hasData:    !!world,
        durationMs: Date.now() - startTime,
      })

    } else if (routed.intent === 'global_knowledge') {
      console.log('api/ai: running GLOBAL KNOWLEDGE mode')
      const knowledge = await runGlobalKnowledgeMode({
        userPrompt: routed.userPrompt,
        language:   routed.language,
      })
      data = knowledge

      console.log('api/ai: global knowledge mode complete', {
        hasData:    !!knowledge,
        durationMs: Date.now() - startTime,
      })
    }

    // ── Step 3: Handle empty/null result ─────────────────────────────────────
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.warn('api/ai: mode returned empty result', { mode, durationMs: Date.now() - startTime })
      return NextResponse.json({
        intent: mode,
        data:   null,
        error:  'The AI mode returned no results. Please try rephrasing your request.',
        log: {
          intent:     mode,
          mode,
          language:   routed.language,
          confidence: routed.confidence,
          reason:     routed.reason,
          durationMs: Date.now() - startTime,
          success:    false,
        },
      }, { status: 200 }) // 200 so the client can handle gracefully
    }

    // ── Step 4: Return result ─────────────────────────────────────────────────
    return NextResponse.json({
      intent: mode,
      data,
      log: {
        intent:     mode,
        mode,
        language:   routed.language,
        confidence: routed.confidence,
        reason:     routed.reason,
        itemCount:  Array.isArray(data) ? data.length : 1,
        durationMs: Date.now() - startTime,
        success:    true,
      },
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('api/ai: unhandled error', message, error instanceof Error ? error.stack : '')
    return NextResponse.json({
      error:  'Something went wrong. Please try again.',
      detail: message,
    }, { status: 500 })
  }
}
