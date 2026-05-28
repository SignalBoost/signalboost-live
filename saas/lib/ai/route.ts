import { NextRequest, NextResponse } from 'next/server'
import { routeIntent, type IntentType } from '@/lib/ai/intentRouter'
import {
  runBusinessMode,
  runCreativeMode,
  runGlobalKnowledgeMode,
  runLocalKnowledgeMode,
} from '@/lib/ai/modes'
import { saveBusinessSite, saveLocalItems } from '@/lib/ai/memory'

export const dynamic = 'force-dynamic'

type ApiAiResponse = {
  intent: IntentType
  data: unknown
  log: {
    intent: IntentType
    mode: IntentType
    language: string
    confidence?: number
    reason?: string
    itemCount: number
    durationMs: number
    success: boolean
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await req.json().catch(() => null)
    const userPrompt = (body?.userPrompt || '').toString().trim()
    const language = (body?.language || '').toString().trim() || undefined

    if (!userPrompt) {
      return NextResponse.json({ error: 'userPrompt is required' }, { status: 400 })
    }

    const routed = routeIntent({ userPrompt, language })
    console.log('api/ai: intent routed', {
      intent: routed.intent,
      language: routed.language,
      confidence: routed.confidence,
      reason: routed.reason,
    })

    let data: ApiAiResponse['data']

    switch (routed.intent) {
      case 'local_knowledge': {
        console.log('api/ai: selected mode local_knowledge and model claude')
        const items = await runLocalKnowledgeMode({
          userPrompt: routed.userPrompt,
          language: routed.language,
        })
        data = items
        console.log('api/ai: local validation complete', { itemCount: items.length })
        if (items.length > 0) {
          saveLocalItems(items, { userPrompt: routed.userPrompt, language: routed.language }).catch(error => {
            console.error('api/ai: saveLocalItems failed', error)
          })
        }
        break
      }
      case 'business': {
        console.log('api/ai: selected mode business and model openai')
        const site = await runBusinessMode({ userPrompt: routed.userPrompt, language: routed.language })
        data = site
        console.log('api/ai: business validation complete', { hasData: Boolean(site) })
        if (site) {
          saveBusinessSite(site, { userPrompt: routed.userPrompt, language: routed.language }).catch(error => {
            console.error('api/ai: saveBusinessSite failed', error)
          })
        }
        break
      }
      case 'creative': {
        console.log('api/ai: selected mode creative and model claude')
        data = await runCreativeMode({ userPrompt: routed.userPrompt, language: routed.language })
        console.log('api/ai: creative validation complete', { hasData: Boolean(data) })
        break
      }
      case 'global_knowledge': {
        console.log('api/ai: selected mode global_knowledge and model openai')
        data = await runGlobalKnowledgeMode({ userPrompt: routed.userPrompt, language: routed.language })
        console.log('api/ai: global validation complete', { hasData: Boolean(data) })
        break
      }
      default: {
        const exhaustive: never = routed.intent
        throw new Error(`Unsupported intent: ${exhaustive}`)
      }
    }

    const itemCount = Array.isArray(data) ? data.length : data ? 1 : 0
    if (!data || itemCount === 0) {
      console.warn('api/ai: mode returned empty result', { intent: routed.intent, durationMs: Date.now() - startTime })
    }

    return NextResponse.json({
      intent: routed.intent,
      data,
      log: {
        intent: routed.intent,
        mode: routed.intent,
        language: routed.language,
        confidence: routed.confidence,
        reason: routed.reason,
        itemCount,
        durationMs: Date.now() - startTime,
        success: itemCount > 0,
      },
    } satisfies ApiAiResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('api/ai: unhandled error', message, error instanceof Error ? error.stack : error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.', detail: message }, { status: 500 })
  }
}
