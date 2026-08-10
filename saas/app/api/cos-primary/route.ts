// saas/app/api/cos-primary/route.ts
// Live COS-first entrypoint. Normal reasoning is attempted by COS before the
// legacy cloud-model/tool route. Tool/action turns still fall through to the
// governed legacy executor until COS has a local tool-planning/execution loop.

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

// Until the local COS engine owns tool planning, explicit execution/tool turns
// must keep using the governed executor. Pure reasoning/advisory questions are
// routed through COS first. This prevents a local model from merely narrating
// an action it cannot yet execute.
function requiresGovernedTools(input: string): boolean {
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

  if (!input || requiresGovernedTools(input)) {
    return legacyConciergePost(new NextRequest(req.clone()))
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
      local_model_invoked: true,
      provenance: cos.provenance,
      execution_allowed: false,
      external_action_taken: false,
    })
  }

  // This is the only normal path from local COS to the legacy provider/tool
  // system. COS records the gap itself before returning handled:false.
  const response = await legacyConciergePost(new NextRequest(req.clone()))
  try {
    const payload = await response.clone().json()
    return NextResponse.json({
      ...payload,
      cos_first_attempted: Boolean(cos),
      cos_first_confidence: cos?.confidence ?? null,
      cos_first_reason: cos && !cos.handled ? cos.reason : 'COS-first attempt unavailable',
      cos_first_provenance: cos?.provenance ?? null,
      external_ai_invoked: true,
    }, { status: response.status })
  } catch {
    return response
  }
}
