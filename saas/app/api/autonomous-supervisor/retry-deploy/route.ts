// saas/app/api/autonomous-supervisor/retry-deploy/route.ts
//
// ONE-CLICK RECOVERY — the endpoint that makes self-healing actually heal.
//
// The supervisor already detects a failed deployment, diagnoses it, and stages its proposed
// repair as an Infrastructure PR. Reading that PR tells the owner what is wrong; it does
// not fix anything. This route is the other half: it performs the one recovery the gateway
// is authorized to perform, a production redeploy.
//
// IT DOES NOT BYPASS GOVERNANCE — it runs THROUGH it. The request is built as a normal
// AgentRequest and handed to runGoverned, exactly like a request arriving over MCP or from
// the supervisor. The classifier reaches 'reversible_internal' on the action's own merits,
// Gate 2 finds the single entry in GATEWAY_ALLOWLIST (agent-gateway-host/gateway-policy.ts),
// and the execution chain performs it. Every outcome is audited through the same path as
// everything else. Remove that allowlist entry and this endpoint starts halting instead of
// running, with no change here.
//
// WHY A HUMAN HAS TO PRESS IT. An automatic retry driven by the deployment-failure webhook
// would loop: fail → webhook → retry → fail → webhook. Nothing on the webhook path can
// reach this action — resolveSupervisorRepairAction maps every diagnosed repair step onto
// PROPOSED_REPAIR_TARGET, which is not allowlisted — and a durable attempt-counter has to
// exist before unattended retry is safe. Until then the owner is the counter.
//
// OWNER ONLY. A redeploy changes what production is running. That is the same bar the
// cockpit applies to a high-risk merge, resolved by the same hub user resolver — no
// header-trust, no owner fallback.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { runGoverned } from '@/agent-gateway/index.ts'
import type { AgentRequest } from '@/agent-gateway/index.ts'
import { createSignalBoostGatewayHost, GATEWAY_POLICY } from '@/agent-gateway-host/signalboost-host.ts'
import {
  RETRY_DEPLOYMENT_KIND,
  RETRY_DEPLOYMENT_TARGET,
} from '@/agent-gateway-host/deployment-recovery.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as any).role !== 'owner') {
    return NextResponse.json(
      { ok: false, error: 'Forbidden — retrying a production deployment is owner-only' },
      { status: 403 },
    )
  }

  let incidentId = ''
  let reason = ''
  try {
    const body = await req.json()
    incidentId = typeof body?.incidentId === 'string' ? body.incidentId.slice(0, 120) : ''
    reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : ''
  } catch {
    // A body is optional. An empty POST is a valid "retry the deployment".
  }

  const request: AgentRequest = {
    requestId: `retry-deploy:${incidentId || 'manual'}:${Date.now()}`,
    protocol: 'supervisor',
    agentId: 'owner-initiated-recovery',
    actor: { userId: (user as any).id ?? undefined, roles: ['owner'] },
    action: {
      kind: RETRY_DEPLOYMENT_KIND,
      target: RETRY_DEPLOYMENT_TARGET,
      params: {
        ...(incidentId ? { incidentId } : {}),
        ...(reason ? { reason } : {}),
      },
    },
  }

  const outcome = await runGoverned(request, GATEWAY_POLICY, createSignalBoostGatewayHost())

  // A halt is a real answer, not an error: it means the envelope no longer authorizes this.
  return NextResponse.json({
    ok: outcome.ok,
    verdict: outcome.verdict,
    consequenceClass: outcome.consequenceClass,
    reason: outcome.reason,
    requestId: outcome.requestId,
    ...(outcome.error ? { error: outcome.error } : {}),
    ...(outcome.approvalId ? { approvalId: outcome.approvalId } : {}),
  })
}
