// saas/app/api/autonomous-supervisor/vercel/route.ts
//
// THE SELF-HEALING LOOP, END TO END.
//
// Detect (a signed Vercel webhook) → diagnose (a validated repair + rollback plan) →
// RECOVER. The recover step is what this route was missing: the diagnosis produced a repair
// plan and the route threw it away, staging one hardcoded read-only inspection instead. So
// detection and diagnosis were autonomous and nothing ever acted on the result.
//
// Now the plan is run through the governed socket (agent-gateway), one step at a time and
// in order. Governance decides what happens to each step — today every step halts and is
// staged as an Infrastructure PR carrying the diagnosis's ACTUAL proposed repair, so the
// owner reviews the real thing in the cockpit he already uses. The bridge stops at the
// first step that does not execute, so step 3 never runs against a half-repaired system.
//
// The old read-only investigation is kept for the case it was written for: a diagnosis that
// proposes no repair steps but still wants a UI agent to look.
//
// Nothing here can execute unattended. That requires an entry in GATEWAY_ALLOWLIST, which
// is empty, and an executable action in the hub action route. Both are deliberate.

import { NextRequest, NextResponse } from 'next/server'
import { diagnoseIncident } from '@/lib/autonomous-supervisor/diagnostic'
import {
  normalizeVercelIncident,
  stageApprovedInvestigation,
  verifySignalBoostSupervisorSignature,
  verifyVercelWebhookSignature,
} from '@/lib/autonomous-supervisor/vercel'
import type { SupervisorRunResult } from '@/lib/autonomous-supervisor/types'
import { createSignalBoostGatewayHost, GATEWAY_POLICY } from '@/agent-gateway-host/signalboost-host.ts'
import { dispatchRepairPlan } from '@/agent-gateway-host/supervisor-repair.ts'
import type { RepairStep } from '@/agent-gateway-host/supervisor-repair.ts'
import {
  resolveSupervisorRepairAction,
  resolveSupervisorRepairParams,
  summarizeRepairDispatch,
} from '@/agent-gateway-host/supervisor-actions.ts'
import type { RepairDispatchSummary } from '@/agent-gateway-host/supervisor-actions.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signalBoostSignature = req.headers.get('x-signalboost-supervisor-signature')
  const vercelSignature = req.headers.get('x-vercel-signature')
  const authenticated = signalBoostSignature
    ? verifySignalBoostSupervisorSignature(rawBody, signalBoostSignature)
    : verifyVercelWebhookSignature(rawBody, vercelSignature)

  if (!authenticated) {
    return NextResponse.json({ ok: false, error: 'Invalid supervisor webhook signature.' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 })
  }

  const incident = await normalizeVercelIncident(body)
  if (!incident) return NextResponse.json({ ok: true, ignored: true, reason: 'Not a failed Vercel deployment event.' })

  const diagnostic = await diagnoseIncident(incident)

  const repairPlan: RepairStep[] = Array.isArray(diagnostic?.repair_plan)
    ? (diagnostic.repair_plan as RepairStep[])
    : []

  let repairDispatch: RepairDispatchSummary | undefined
  let approvalDispatch: SupervisorRunResult['approvalDispatch']

  if (repairPlan.length > 0) {
    // The diagnosis proposed a repair. Run it through governance rather than discarding it.
    // A staging failure must never break the webhook acknowledgement: Vercel retries on a
    // non-2xx, which would re-diagnose the same incident in a loop.
    try {
      const dispatched = await dispatchRepairPlan({
        incident: {
          incident_id: incident.incident_id,
          project: incident.project,
          provider: incident.provider,
        },
        repairPlan,
        policy: GATEWAY_POLICY,
        host: createSignalBoostGatewayHost(),
        resolveAction: resolveSupervisorRepairAction,
        resolveParams: resolveSupervisorRepairParams,
      })
      repairDispatch = summarizeRepairDispatch(dispatched, repairPlan.length)
    } catch (error: any) {
      repairDispatch = {
        attempted: 0,
        planned: repairPlan.length,
        prIds: [],
        mode: 'unavailable',
        message: `The repair plan was diagnosed but could not be routed for approval: ${error?.message || 'unknown error'}`,
      }
    }
  } else {
    // No repair steps. Fall back to the original read-only investigation.
    approvalDispatch = await stageApprovedInvestigation(incident, diagnostic)
  }

  const result: SupervisorRunResult = {
    ok: true,
    incident,
    diagnostic,
    ...(approvalDispatch ? { approvalDispatch } : {}),
    ...(repairDispatch ? { repairDispatch } : {}),
  }
  return NextResponse.json(result)
}
