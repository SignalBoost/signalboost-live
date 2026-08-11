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

export async function POST(req: NextRequest) {
  const body = await req.clone().json().catch(() => ({}))
  const input = latestUserText(body)
  const language = languageFrom(body)

  if (!input) {
    return NextResponse.json({
      reply: 'COS isolation mode requires a user prompt.',
      source: 'cos-isolation-baseline',
      confidence_score: 0,
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
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: true,
      isolation_mode: true,
      provenance: cos.provenance,
      execution_allowed: false,
      external_action_taken: false,
    })
  }

  // FAIL CLOSED. The legacy Concierge/Anthropic executor is intentionally not
  // imported or called in this benchmark branch. A COS miss remains a COS miss.
  return NextResponse.json({
    reply: 'COS could not answer this request confidently using its local reasoning and retained internal knowledge. External AI fallback is disabled for this isolation benchmark.',
    source: 'cos-local-insufficient',
    confidence_score: cos?.confidence ?? 0,
    external_ai_invoked: false,
    external_fallback_invoked: false,
    local_model_invoked: Boolean(cos?.provenance.localModelInvoked),
    isolation_mode: true,
    reason: cos && !cos.handled ? cos.reason : 'COS local attempt was unavailable.',
    provenance: cos?.provenance ?? null,
    execution_allowed: false,
    external_action_taken: false,
  }, { status: 422 })
}
