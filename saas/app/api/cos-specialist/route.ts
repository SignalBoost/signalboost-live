import { NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { getAccess } from '@/lib/auth/access'
import { getCOSA2ARuntimeHost } from '@/a2a-host/cos-runtime-host'
import { planCOSSpecialistFromText } from '@/a2a-host/cos-specialist-planner'

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

function latestUserPrompt(body: any): string {
  const messages = Array.isArray(body?.messages) ? body.messages : []
  const user = [...messages].reverse().find((message: any) => message?.role === 'user')
  if (typeof user?.content === 'string') return text(user.content)
  if (Array.isArray(user?.content)) return text(user.content.map((part: any) => text(part?.text)).filter(Boolean).join(' '))
  return ''
}

function exactScope(body: any): { tenantId: string; environmentId: string; portableId: string } | null {
  const tenantId = text(body?.context?.tenantId)
  const environmentId = text(body?.context?.environmentId)
  const portableId = text(body?.context?.portableId)
  if (!tenantId || !environmentId || !portableId || [tenantId, environmentId, portableId].includes('*')) return null
  return { tenantId, environmentId, portableId }
}

/**
 * COS specialist runtime bridge.
 * - Explicit structured plans remain supported and independently governed.
 * - Ordinary language is conservatively planned; unclear intent stays on COS Primary.
 * - Inferred delegation requires privilege + installed host + exact scope. Missing any of those
 *   returns to COS Primary rather than inventing an agent path.
 */
export async function POST(req: NextRequest) {
  const body: any = await req.clone().json().catch(() => ({}))
  const prompt = latestUserPrompt(body)
  const supplied = body?.context?.specialistPlan
  const hasSuppliedPlan = Boolean(supplied && typeof supplied === 'object' && !Array.isArray(supplied))
  const inferred = hasSuppliedPlan ? null : planCOSSpecialistFromText(prompt)

  if (!hasSuppliedPlan && inferred?.mode !== 'delegate') return cosPrimaryPost(req)

  const access = await getAccess().catch(() => null)
  const privileged = Boolean(access?.isOwner || access?.isAdmin)
  const host = getCOSA2ARuntimeHost()
  const scope = exactScope(body)

  if (!hasSuppliedPlan && (!privileged || !host || !scope)) return cosPrimaryPost(req)

  if (!privileged) {
    return NextResponse.json({
      ok: false,
      reply: 'Specialist delegation is not authorized for this hosted COS session.',
      source: 'cos-a2a-unauthorized',
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 403 })
  }

  if (!host) {
    return NextResponse.json({
      ok: false,
      reply: 'No governed A2A specialist host is installed for this deployment.',
      source: 'cos-a2a-host-unavailable',
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 503 })
  }

  if (!scope) {
    return NextResponse.json({
      ok: false,
      reply: 'Specialist delegation requires an exact tenant, environment, and portable scope.',
      source: 'cos-a2a-scope-unavailable',
      execution_allowed: false,
      external_action_taken: false,
    }, { status: 409 })
  }

  const plan = hasSuppliedPlan ? {
    familyId: text(supplied.familyId) as any,
    skillId: text(supplied.skillId),
    ...(text(supplied.agentId) ? { agentId: text(supplied.agentId) } : {}),
  } : {
    familyId: inferred!.familyId,
    skillId: inferred!.skillId,
  }

  const result = await host.orchestrator.orchestrate({
    ...scope,
    messageId: text(body?.context?.messageId) || crypto.randomUUID(),
    text: prompt,
    plan,
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
    specialist_plan_source: hasSuppliedPlan ? 'supplied' : 'natural_language',
    specialist_planner: hasSuppliedPlan ? undefined : inferred,
    execution_allowed: result.ok,
    external_action_taken: false,
  }, { status: result.ok ? 200 : 409 })
}
