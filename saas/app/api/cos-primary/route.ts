// saas/app/api/cos-primary/route.ts
// Live COS-first entrypoint. COS reasoning is attempted first; governed cloud/tool
// execution remains available as fallback when COS cannot safely handle the request.

import { NextRequest, NextResponse } from 'next/server'
import { POST as legacyConciergePost } from '@/app/api/concierge/route'
import { tryCOSFirstAnswer } from '@/lib/ai/cos/cosFirstAnswer'
import { getAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role !== 'user') continue
    const content = messages[i]?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      return content.map((block: any) => String(block?.text || '')).join('\n').trim()
    }
  }
  return ''
}

function languageFrom(body: any): string {
  const value = String(body?.context?.language || 'en').toLowerCase()
  return ['en', 'es', 'pt', 'pl', 'ru'].includes(value) ? value : 'en'
}

function confidenceThreshold(): number {
  const value = Number(process.env.COS_LOCAL_CONFIDENCE_THRESHOLD || '0.72')
  return Number.isFinite(value) ? Math.max(0.5, Math.min(0.98, value)) : 0.72
}

function requestsExternalAction(input: string): boolean {
  const text = String(input || '').trim()
  if (!text) return false
  const explicitExecution = /\b(run|execute|perform|investigate|check|fetch|pull|read|scan|audit|search|look up|research|deploy|commit|merge|create|update|delete|send|publish|queue|launch|start|fix|repair|change|modify|call the tool|use (?:the )?tools?)\b/i
  const repoOrLiveTarget = /\b(repo|repository|github|vercel|supabase|logs?|metrics?|status page|production|database|table|file|route|api|web|internet|youtube|publication|magazine|journal|provider|campaign|prospect)\b/i
  const actionDemand = /\b(now|immediately|for real|actually|do not give me a plan|perform the|execute the|using every relevant tool)\b/i
  return explicitExecution.test(text) && (repoOrLiveTarget.test(text) || actionDemand.test(text))
}

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const input = latestUserText(body)
  const language = languageFrom(body)

  if (!input) return legacyConciergePost(new NextRequest(req.clone()))

  const access = await getAccess().catch(() => null)
  const cos = await tryCOSFirstAnswer({
    prompt: input,
    userId: access?.userId || null,
    language,
    privileged: Boolean(access?.isOwner || access?.isAdmin),
  }).catch(() => null)

  if (cos?.handled && !requestsExternalAction(input)) {
    return NextResponse.json({
      reply: cos.reply,
      source: 'cos-local-primary',
      confidence_score: cos.confidence,
      confidence_threshold: confidenceThreshold(),
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: true,
      isolation_mode: false,
      diagnostics: {
        failure_reason: null,
        knowledge_facts_used: cos.provenance.knowledgeFactsUsed,
        learned_items_used: cos.provenance.learnedItemsUsed,
        user_memories_used: cos.provenance.userMemoriesUsed,
        autonomous_research_attempted: cos.provenance.autonomousResearchAttempted ?? false,
        research_documents_acquired: cos.provenance.researchDocumentsAcquired ?? 0,
        knowledge_newly_retained: cos.provenance.knowledgeNewlyRetained ?? 0,
      },
      provenance: cos.provenance,
      execution_allowed: false,
      external_action_taken: false,
    })
  }

  const response = await legacyConciergePost(new NextRequest(req.clone()))
  try {
    const payload = await response.clone().json()
    const reason = cos && !cos.handled
      ? cos.reason
      : requestsExternalAction(input)
        ? 'COS completed its first-pass reasoning, then delegated the requested external action to the governed executor.'
        : 'COS-first attempt unavailable'
    const provenance = cos?.provenance ?? null

    return NextResponse.json({
      ...payload,
      cos_first_attempted: Boolean(cos),
      cos_first_handled: Boolean(cos?.handled),
      cos_first_confidence: cos?.confidence ?? null,
      confidence_threshold: confidenceThreshold(),
      cos_first_reason: reason,
      cos_first_provenance: provenance,
      external_fallback_invoked: true,
      isolation_mode: false,
      diagnostics: {
        failure_reason: cos?.handled ? null : reason,
        failure_kind: cos?.handled
          ? null
          : !provenance?.localModelInvoked
            ? 'local_model_unavailable_or_not_configured'
            : 'local_model_below_confidence_or_unparseable',
        knowledge_facts_used: provenance?.knowledgeFactsUsed ?? 0,
        learned_items_used: provenance?.learnedItemsUsed ?? 0,
        user_memories_used: provenance?.userMemoriesUsed ?? 0,
        autonomous_research_attempted: provenance?.autonomousResearchAttempted ?? false,
        research_documents_acquired: provenance?.researchDocumentsAcquired ?? 0,
        knowledge_newly_retained: provenance?.knowledgeNewlyRetained ?? 0,
      },
    }, { status: response.status })
  } catch {
    return response
  }
}
