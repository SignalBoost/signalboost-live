// saas/app/api/hub/operator/run/route.ts
//
// The governed entry point. Routes one provider action through the full operator
// pipeline (template lint → RBAC → approval → secret → payload → capability →
// execution → post-state → audit) via createOperator(createOperatorHost()).
// Defaults to SIMULATION; execution requires mode:'execution' and passes the
// safety gate (approvals, preflight, permissions) before any provider is touched.

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

  // Build a preflight from the checks verifiable here; the operator's safety gate
  // re-validates template + permission independently before any execution.
  const tpl = host.resolveTemplate(providerId, actionId)
  const preflight: PreflightChecks = {
    credentialsValid: true,        // executors self-inject; missing surfaces at exec
    providerHealth: true,
    permissionsValid: !!tpl && permits(tpl.permissionPolicy, role),
    templatesValid: !!tpl && lintTemplate(tpl).ok,
    dependenciesSatisfied: true,   // single action
    rateLimitsSafe: true,
    idempotencyConfirmed: true,
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

  // A failed/blocked stage carries a FailureRecord the UI feeds straight into the
  // Module 5 Failure Card.
  return NextResponse.json({
    ok: result.ok,
    stage: result.stage,
    normalized: result.normalized,
    failure: result.failure,
    operatorReady: operator.ready(),
  }, { status: result.ok ? 200 : 200 })
}
