// saas/app/api/cos-primary/route.ts
// Live COS-first entrypoint. Every turn is offered to COS first. Governed
// cloud/tool execution remains a fallback only when COS cannot safely handle
// the request itself.

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

// Action/tool requests still need the governed executor until the local COS
// runtime owns the tool registry itself. Crucially, they no longer bypass COS:
// COS gets the first reasoning/retrieval attempt, records the knowledge gap,
// and only then may the governed executor be reached.
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

  // Pure reasoning can terminate locally. An explicit request to inspect or
  // mutate an external system must continue into the governed executor: a
  // locally generated plan is not evidence that the requested action occurred.
  if (cos?.handled && !requestsExternalAction(input)) {
    return NextResponse.json({
      reply: cos.reply,
      source: 'cos-local-primary',
      confidence_score: cos.confidence,
      external_ai_invoked: false,
      local_model_invoked: true,
      provenance: cos.provenance,
      execution_allowed: false,
      external_action_taken: false,
    })
  }

  const response = await legacyConciergePost(new NextRequest(req.clone()))
  try {
    const payload = await response.clone().json()
    return NextResponse.json({
      ...payload,
      cos_first_attempted: Boolean(cos),
      cos_first_handled: Boolean(cos?.handled),
      cos_first_confidence: cos?.confidence ?? null,
      cos_first_reason: cos && !cos.handled
        ? cos.reason
        : requestsExternalAction(input)
          ? 'COS completed its first-pass reasoning, then delegated the requested external action to the governed executor.'
          : 'COS-first attempt unavailable',
      cos_first_provenance: cos?.provenance ?? null,
      // Do not overwrite the executor's own provenance. Reaching this route
      // means the governed fallback was invoked; the payload remains the source
      // of truth for whether an external model/tool actually executed.
      external_fallback_invoked: true,
    }, { status: response.status })
  } catch {
    return response
  }
}
