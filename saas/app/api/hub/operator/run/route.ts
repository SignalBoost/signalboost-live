// saas/app/api/hub/operator/run/route.ts
//
// Governed entry point with owner-only Elevated Privilege Mode (per-request
// `elevated: true`). Read-only auto-executes. Low/medium writes auto-approve and
// execute under elevated mode (audited to admin_audit_log). High-risk/destructive
// actions never auto-run — they route cleanly into the approval queue (no hard
// block). The safety gate, preflight, and capability checks remain in force.

import { NextRequest, NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'
import {
  createOperator, permits, lintTemplate,
  type PreflightChecks, type PermissionPolicy, type ExecutionMode,
} from '@/console-core/operator'
import { createOperatorHost } from '@/lib/hub/operatorHost'
import { probeProvider } from '@/lib/hub/preflightProbe'
import { resolveExecutor } from '@/console-core/defaultHost'
import { classifyElevated } from '@/lib/hub/elevatedPolicy'
import { getAdminSupabase } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  const isOwner = ctx.role === 'owner'
  const elevated = body?.elevated === true && isOwner   // elevated honored for owner only
  const role = toPolicyRole(ctx.role)

  const ex = resolveExecutor(providerId, actionId)
  if (!ex) return NextResponse.json({ ok: false, error: `No executor registered for ${providerId}.${actionId}` }, { status: 400 })

  // Elevated classification decides auto-execute vs approval queue.
  const decision = classifyElevated(ex.policyActionId, { elevated, isOwner })

  if (decision.decision === 'needs_approval') {
    // High-risk, or low/medium write without elevation: queue, do not execute.
    return NextResponse.json({
      ok: false,
      status: 'needs_approval',
      tier: decision.tier,
      approval_card: {
        title: 'Approval Required',
        action: `${providerId}.${actionId}`,
        provider: providerId,
        risk_level: decision.tier === 'high_risk' ? 'High' : 'Medium',
        reason: decision.reason,
        approve: `APPROVE: ${actionId}`,
        reject: `REJECT: ${actionId}`,
      },
    })
  }

  const host = createOperatorHost()
  const operator = createOperator(host)
  const tpl = host.resolveTemplate(providerId, actionId)
  const executionMode: ExecutionMode = body?.mode === 'execution' ? 'execution' : 'simulation'

  // Explicit audit trail for an elevated auto-approval (separate from pipeline audit).
  if (decision.autoApproved) {
    try {
      const admin = getAdminSupabase()
      await admin.from('admin_audit_log').insert({
        actor_id: UUID_RE.test(ctx.userId || '') ? ctx.userId : null,
        action: 'operator:elevated_auto_approve',
        target_type: 'provider',
        target_id: providerId,
        metadata: { action: actionId, tier: decision.tier, reason: decision.reason, mode: executionMode },
      })
    } catch (e) {
      console.error('[operator.elevated] audit failed', e)
    }
  }

  // Live preflight in execution mode (no probe for simulation).
  let preflight: PreflightChecks | undefined
  if (executionMode === 'execution') {
    const probe = await probeProvider(providerId)
    preflight = {
      credentialsValid: probe.credentialsValid,
      providerHealth: probe.providerHealth,
      permissionsValid: !!tpl && permits(tpl.permissionPolicy, role),
      templatesValid: !!tpl && lintTemplate(tpl).ok,
      dependenciesSatisfied: true,
      rateLimitsSafe: probe.status !== 429,
      idempotencyConfirmed: true,
    }
  }

  const result = await operator.run({
    providerId, actionId, input,
    user: { id: ctx.userId || 'unknown', role },
    executionMode,
    approvalGranted: decision.autoApproved ? true : !!body?.approvalGranted,
    approverRole: typeof body?.approverRole === 'string' ? body.approverRole : undefined,
    preflight,
  })

  return NextResponse.json({
    ok: result.ok,
    elevated,
    tier: decision.tier,
    stage: result.stage,
    normalized: result.normalized,
    failure: result.failure,
    operatorReady: operator.ready(),
  })
}
