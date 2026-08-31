import { NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { getAccess } from '@/lib/auth/access'
import { getCOSA2ARuntimeHost } from '@/a2a-host/cos-runtime-host'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function specialistReply(data: Readonly<Record<string, unknown>> | undefined): string {
  if (!data) return ''
  if (typeof data.text === 'string') return text(data.text)
  const artifacts = Array.isArray(data.artifacts) ? data.artifacts : []
  for (const artifact of artifacts as any[]) {
    const parts = Array.isArray(artifact?.parts) ? artifact.parts : []
    const joined = parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim()
    if (joined) return joined
  }
  const parts = Array.isArray((data as any).parts) ? (data as any).parts : []
  return parts.map((part: any) => typeof part?.text === 'string' ? part.text : '').filter(Boolean).join('\n').trim()
}

/**
 * Thin COS runtime bridge. Ordinary turns are forwarded unchanged to COS Primary.
 * Specialist delegation is privileged on the SignalBoost-hosted surface; buyer portables
 * compose the same A2A host in their own authenticated server boundary.
 */
export async function POST(req: NextRequest) {
  const body: any = await req.clone().json().catch(() => ({}))
  const plan = body?.context?.specialistPlan
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return cosPrimaryPost(req)

  const access = await getAccess().catch(() => null)
  if (!access?.isOwner && !access?.isAdmin) {
    return NextResponse.json({
      ok: false,
      reply: 'Specialist delegation is not authorized for this hosted COS session.',
      source: 'cos-a2a-unauthorized',
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 403 })
  }

  const host = getCOSA2ARuntimeHost()
  if (!host) {
    return NextResponse.json({
      ok: false,
      reply: 'No governed A2A specialist host is installed for this deployment.',
      source: 'cos-a2a-host-unavailable',
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }

  const messages = Array.isArray(body?.messages) ? body.messages : []
  const user = [...messages].reverse().find((message: any) => message?.role === 'user')
  const prompt = text(user?.content)
  const result = await host.orchestrator.orchestrate({
    tenantId: text(body?.context?.tenantId),
    environmentId: text(body?.context?.environmentId),
    portableId: text(body?.context?.portableId),
    messageId: text(body?.context?.messageId) || crypto.randomUUID(),
    text: prompt,
    plan: {
      familyId: text(plan.familyId) as any,
      skillId: text(plan.skillId),
      ...(text(plan.agentId) ? { agentId: text(plan.agentId) } : {}),
    },
    ...(body?.context?.a2aApproval ? { approval: body.context.a2aApproval } : {}),
    ...(text(body?.context?.traceId) ? { traceId: text(body.context.traceId) } : {}),
  })

  const reply = specialistReply(result.data) || (result.ok
    ? `Specialist ${result.selectedAgentId || result.agentId} completed ${result.skillId}.`
    : `Specialist delegation did not run: ${result.mode || result.error || 'unavailable'}.`)

  return NextResponse.json({
    ok: result.ok,
    reply,
    source: result.ok ? 'cos-a2a-specialist' : 'cos-a2a-specialist-blocked',
    a2a: result,
    execution_allowed: result.ok,
    external_action_taken: false,
  }, { status: result.ok ? 200 : 409 })
}
