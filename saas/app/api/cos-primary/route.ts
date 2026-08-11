// saas/app/api/cos-primary/route.ts
// COS isolation benchmark entrypoint. Cloud/external model fallback is hard-disabled
// here so a benchmark can measure only COS local inference + retained knowledge.

import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const input = latestUserText(body)
  const language = languageFrom(body)

  if (!input) {
    return NextResponse.json({
      reply: 'COS isolation mode requires a user prompt.',
      source: 'cos-isolation-baseline',
      confidence_score: 0,
      confidence_threshold: confidenceThreshold(),
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: false,
      isolation_mode: true,
    }, { status: 400 })
  }

  const access = await getAccess().catch(() => null)
  const cos = await tryCOSFirstAnswer({
    prompt: input,
    userId: access?.userId || null,
    language,
    privileged: Boolean(access?.isOwner || access?.isAdmin),
  }).catch(() => null)

  if (cos?.handled) {
    return NextResponse.json({
      reply: cos.reply,
      source: 'cos-local-primary',
      confidence_score: cos.confidence,
      confidence_threshold: confidenceThreshold(),
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: true,
      isolation_mode: true,
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

  const reason = cos && !cos.handled ? cos.reason : 'COS local attempt was unavailable.'
  const provenance = cos?.provenance ?? null

  // FAIL CLOSED. The legacy Concierge/Anthropic executor is intentionally not
  // imported or called in this benchmark branch. A COS miss remains a COS miss.
  return NextResponse.json({
    reply: 'COS could not answer this request confidently using its local reasoning and retained internal knowledge. External AI fallback is disabled for this isolation benchmark.',
    source: 'cos-local-insufficient',
    confidence_score: cos?.confidence ?? 0,
    confidence_threshold: confidenceThreshold(),
    external_ai_invoked: false,
    external_fallback_invoked: false,
    local_model_invoked: Boolean(provenance?.localModelInvoked),
    isolation_mode: true,
    reason,
    diagnostics: {
      failure_reason: reason,
      failure_kind: !provenance?.localModelInvoked
        ? 'local_model_unavailable_or_not_configured'
        : 'local_model_below_confidence_or_unparseable',
      knowledge_facts_used: provenance?.knowledgeFactsUsed ?? 0,
      learned_items_used: provenance?.learnedItemsUsed ?? 0,
      user_memories_used: provenance?.userMemoriesUsed ?? 0,
      autonomous_research_attempted: provenance?.autonomousResearchAttempted ?? false,
      research_documents_acquired: provenance?.researchDocumentsAcquired ?? 0,
      knowledge_newly_retained: provenance?.knowledgeNewlyRetained ?? 0,
    },
    provenance,
    execution_allowed: false,
    external_action_taken: false,
  }, { status: 422 })
}
