import { NextRequest, NextResponse } from 'next/server'
import { POST as cosPrimaryPost } from '@/app/api/cos-primary/route'
import { POST as visualPost } from '@/app/api/visuals/route'
import { getAccess } from '@/lib/auth/access'
import { getCOSA2ARuntimeHost } from '@/a2a-host/cos-runtime-host'
import { planCOSSpecialistFromText } from '@/a2a-host/cos-specialist-planner'
import { selectCOSA2AHostForPlan } from '@/a2a-host/reference-cos-runtime-host'
import { classifyVisualRequest } from '@/lib/visuals/requestClassifier'
import { hasUserReferenceImage } from '@/lib/visuals/userReference'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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

function inlineVisualResponse(response: Response): Promise<NextResponse> {
  return response.clone().json().then((payload: any) => {
    const workspaceId = typeof payload?.workspaceId === 'string' ? payload.workspaceId : ''
    const imagePath = Array.isArray(payload?.files)
      ? payload.files.find((path: unknown): path is string => typeof path === 'string' && /\.(?:png|jpe?g|webp)$/i.test(path))
      : ''
    if (!workspaceId || !imagePath || typeof payload?.reply !== 'string') return NextResponse.json(payload, { status: response.status })
    const previewUrl = `/api/builder/workspaces/${encodeURIComponent(workspaceId)}/files/${imagePath.split('/').map(encodeURIComponent).join('/')}?preview=1`
    return NextResponse.json({
      ...payload,
      reply: `${payload.reply}\n\n<IMAGE>${previewUrl}</IMAGE>`,
      visual: {
        previewUrl,
        downloadUrl: previewUrl.replace('?preview=1', ''),
        alt: typeof payload?.generated_visual_label === 'string' ? payload.generated_visual_label : 'Generated visual',
      },
    }, { status: response.status })
  }).catch(() => new NextResponse(response.body, { status: response.status, headers: response.headers }))
}

/**
 * COS specialist runtime bridge.
 * Buyer-installed hosts take precedence. When none is installed, privileged exact-scope COS
 * may use the real SignalBoost reference host for canonical advisory self-healing diagnosis only.
 * Visual generation is an authenticated first-party tool and is routed before specialist planning.
 */
export async function POST(req: NextRequest) {
  const body: any = await req.clone().json().catch(() => ({}))
  const prompt = latestUserPrompt(body)

  const visualClassification = classifyVisualRequest({
    objective: prompt,
    hasUserReferenceImage: hasUserReferenceImage(body),
  })
  if (visualClassification) {
    const headers = new Headers(req.headers)
    headers.set('content-type', 'application/json')
    headers.delete('content-length')
    const visualRequest = new NextRequest(new URL('/api/visuals', req.url), {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, objective: prompt }),
    })
    return inlineVisualResponse(await visualPost(visualRequest))
  }

  const supplied = body?.context?.specialistPlan
  const hasSuppliedPlan = Boolean(supplied && typeof supplied === 'object' && !Array.isArray(supplied))
  const inferred = hasSuppliedPlan ? null : planCOSSpecialistFromText(prompt)
  const inferredPlan = inferred?.mode === 'delegate' ? inferred : null

  if (!hasSuppliedPlan && !inferredPlan) return cosPrimaryPost(req)

  const access = await getAccess().catch(() => null)
  const privileged = Boolean(access?.isOwner || access?.isAdmin)
  const scope = exactScope(body)

  if (!hasSuppliedPlan && (!privileged || !scope)) return cosPrimaryPost(req)
  if (!privileged) {
    return NextResponse.json({ ok: false, reply: 'Specialist delegation is not authorized for this hosted COS session.', source: 'cos-a2a-unauthorized', execution_allowed: false, external_action_taken: false }, { status: 403 })
  }
  if (!scope) {
    return NextResponse.json({ ok: false, reply: 'Specialist delegation requires an exact tenant, environment, and portable scope.', source: 'cos-a2a-scope-unavailable', execution_allowed: false, external_action_taken: false }, { status: 409 })
  }

  const plan = hasSuppliedPlan ? {
    familyId: text(supplied.familyId) as any,
    skillId: text(supplied.skillId),
    ...(text(supplied.agentId) ? { agentId: text(supplied.agentId) } : {}),
  } : {
    familyId: inferredPlan!.familyId,
    skillId: inferredPlan!.skillId,
  }

  const selected = selectCOSA2AHostForPlan({ installedHost: getCOSA2ARuntimeHost(), scope, plan })
  if (!selected.host) {
    if (!hasSuppliedPlan) return cosPrimaryPost(req)
    return NextResponse.json({ ok: false, reply: 'No governed A2A specialist host is available for this specialist plan.', source: 'cos-a2a-host-unavailable', execution_allowed: false, external_action_taken: false }, { status: 503 })
  }

  const result = await selected.host.orchestrator.orchestrate({
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
    a2a_host_source: selected.source,
    specialist_plan_source: hasSuppliedPlan ? 'supplied' : 'natural_language',
    specialist_planner: hasSuppliedPlan ? undefined : inferredPlan,
    execution_allowed: result.ok,
    external_action_taken: false,
  }, { status: result.ok ? 200 : 409 })
}
