import { NextRequest, NextResponse } from 'next/server'
import { isFastTextTransform } from '@/app/api/cos-primary/route'
import { runDirectFastTextEdit } from '@/lib/ai/cos/fastTextEditDirect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function latestUserText(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && typeof message?.content === 'string') return message.content.trim()
  }
  return ''
}

export async function POST(req: NextRequest) {
  const internalRewrite = req.headers.get('x-signalboost-fast-transform-internal') === '1'
  const referer = req.headers.get('referer') || ''
  let legacyOwnerAssistant = false
  try {
    const url = new URL(referer)
    legacyOwnerAssistant = url.origin === req.nextUrl.origin
      && url.pathname.startsWith('/dashboard/assistant')
      && req.headers.get('x-signalboost-surface') === 'cos'
  } catch {}
  if (!internalRewrite && !legacyOwnerAssistant) {
    return NextResponse.json({ ok: false, error: 'fast_transform_ingress_required' }, { status: 403 })
  }

  const body = await req.clone().json().catch(() => ({}))
  const prompt = latestUserText(body)
  if (!isFastTextTransform(prompt)) {
    return NextResponse.json({
      ok: false,
      error: 'fast_text_transform_required',
      reply: 'This endpoint only accepts edit, rewrite, proofread, polish, translate, shorten, and equivalent text-transform requests.',
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 400 })
  }

  const edited = await runDirectFastTextEdit(prompt)
  if (edited) {
    return NextResponse.json({
      ok: true,
      reply: edited.text,
      source: 'cos-fast-text-edit-direct',
      confidence_score: 1,
      external_ai_invoked: false,
      external_fallback_invoked: false,
      local_model_invoked: true,
      execution_provenance: {
        answer_origin: { provider: null, model: edited.model, from_cache: false },
        local_reasoning: { invoked: true, model: edited.model, elapsed_ms: edited.elapsedMs },
      },
      execution_allowed: false,
      external_action_taken: false,
    })
  }

  const failed = 'COS could not complete this text edit within the fast-path deadline. Nothing was sent and no action was taken.'
  return NextResponse.json({
    ok: false,
    reply: failed,
    error: failed,
    source: 'cos-fast-text-edit-direct-timeout',
    confidence_score: 0,
    external_ai_invoked: false,
    external_fallback_invoked: false,
    local_model_invoked: true,
    execution_allowed: false,
    external_action_taken: false,
  }, { status: 503 })
}
