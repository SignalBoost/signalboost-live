// saas/app/api/hub/operator/verify/route.ts
//
// Live self-verification of the governed operator. Owner-gated. Confirms the
// installation (Module 10) and dry-runs EVERY registered action through the
// operator in SIMULATION mode — exercising template resolution, lint, RBAC,
// approval, capability, and payload validation with zero provider calls. The
// per-action stage tells you exactly where each would land.

import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth/access'
import { createOperator } from '@/console-core/operator'
import { createOperatorHost } from '@/lib/hub/operatorHost'
import { listRegistered } from '@/console-core/defaultHost'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type ActionReport = { action: string; ok: boolean; stage: string; status: string; detail?: string }

export async function GET() {
  const guard = await requireOwner()
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status })

  const operator = createOperator(createOperatorHost())
  const installation = operator.verify()

  const role = guard.ctx.isOwner ? 'owner' : guard.ctx.isAdmin ? 'admin' : 'user'
  const keys = listRegistered()

  const reports: ActionReport[] = []
  for (const key of keys) {
    const dot = key.indexOf('.')
    const providerId = key.slice(0, dot)
    const actionId = key.slice(dot + 1)
    const r = await operator.run({
      providerId, actionId, input: {},
      user: { id: guard.ctx.userId || 'unknown', role },
      executionMode: 'simulation',
      approvalGranted: false,
    })
    reports.push({
      action: key,
      ok: r.ok,
      stage: r.stage,
      status: r.normalized.status,
      detail: r.failure?.errorMessage,
    })
  }

  const simulated = reports.filter(r => r.status === 'simulated').length
  const summary = {
    total: reports.length,
    simulated,                                   // passed the full gate with no inputs
    needs_input: reports.filter(r => r.stage === 'payload_validation').length,
    blocked_by_policy: reports.filter(r => r.stage === 'safety_gate').length,
    missing_template: reports.filter(r => r.stage === 'template_load').length,
  }

  return NextResponse.json({
    ok: installation.ok,
    installation,
    operatorReady: operator.ready(),
    summary,
    actions: reports,
    checked_at: new Date().toISOString(),
  })
}
