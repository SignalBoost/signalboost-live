// saas/app/api/hub/operator/run/route.ts
//
// Governed entry point. Routes one provider action through the full operator
// pipeline via createOperator(createOperatorHost()). Simulation by default;
// execution requires mode:'execution' AND a LIVE preflight probe of the provider's
// credentials/health before the safety gate will allow it.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import {
  createOperator,
  permits,
  lintTemplate,
  type PreflightChecks,
  type PermissionPolicy,
  type ExecutionMode,
} from '@/console-core/operator'
import { createOperatorHost } from '@/lib/hub/operatorHost'
import { probeProvider } from '@/lib/hub/preflightProbe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function toPolicyRole(role: string): PermissionPolicy {
  if (role === 'owner') return 'owner'
  if (role === 'admin') return 'admin'
  return 'user'
}

export async function POST(req: NextRequest) {
  const ctx = await getAccess()
  if (ctx.role === 'guest') {
    return NextResponse.json({ ok: false, error: 'Not signed in.' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 }) }

  const providerId = String(body?.providerId || '')
  const actionId = String(body?.actionId || '')
  if (!providerId || !actionId) {
    return NextResponse.json({ ok: false, error: 'providerId and actionId are required' }, { status: 400 })
  }
  const input: Record<string, unknown> = (body?.input && typeof body.input === 'object') ? body.input : {}
  const executionMode: ExecutionMode = body?.mode === 'execution' ? 'execution' : 'simulation'
  const role = toPolicyRole(ctx.role)

  const host = createOperatorHost()
  const operator = createOperator(host)
  const tpl = host.resolveTemplate(providerId, actionId)

  // Preflight: a LIVE credential/health probe in execution mode (no probe needed
  // for simulation, which makes no provider call).
  let preflight: PreflightChecks | undefined
  if (executionMode === 'execution') {
    const probe = await probeProvider(providerId)
    preflight = {
      credentialsValid: probe.credentialsValid,
      providerHealth: probe.providerHealth,
      permissionsValid: !!tpl && permits(tpl.permissionPolicy, role),
      templatesValid: !!tpl && lintTemplate(tpl).ok,
      dependenciesSatisfied: true,            // single action
      rateLimitsSafe: probe.status !== 429,
      idempotencyConfirmed: true,             // single-shot; engine forbids retrying non-idempotent actions
    }
  }

  const result = await operator.run({
    providerId,
    actionId,
    input,
    user: { id: ctx.userId || 'unknown', role },
    executionMode,
    approvalGranted: !!body?.approvalGranted,
    approverRole: typeof body?.approverRole === 'string' ? body.approverRole : undefined,
    preflight,
  })

  return NextResponse.json({
    ok: result.ok,
    stage: result.stage,
    normalized: result.normalized,
    failure: result.failure,
    operatorReady: operator.ready(),
  })
}
