// saas/app/api/supervisor/demo/incident/route.ts
//
// THE INCIDENT DRILL — the third thing a buyer wants to watch, after the approval
// rehearsal and the production repair history.
//
// It sends a synthetic incident through THE REAL INTAKE PATH: the same signed webhook
// source, the same authentication, the same deduplication, normalization and storage,
// the same triage thinker, the same policy engine, and the same entitlement gate that a
// buyer's Datadog or PagerDuty alert would meet. Nothing is stubbed and nothing is
// bypassed. The signature is produced with the exported signIntakeRequest helper — the
// same function the documentation tells a buyer to use — rather than by reaching past
// the authenticator.
//
// WHY THAT MATTERS FOR A DEMO. Showing a screenshot of a diagnosis proves nothing. Making
// the product actually diagnose something, in front of the person, through the path their
// own monitoring would use, is the demonstration. The audit events returned are the ones
// the run really emitted.
//
// THE PAYLOAD IS MARKED A DRILL, IN THE PAYLOAD ITSELF. Its provider, error message and
// metadata all say so, so nobody reading the audit trail later mistakes it for a real
// production incident. A demo that quietly writes realistic-looking history into an audit
// store is the same failure as a fabricated one.
//
// WHAT IT WILL NOT DO: execute a repair. This deployment configures no execution step
// runner, so the orchestration honestly ends unresolved and says why. That is the correct
// and disclosed behaviour, documented in the integration guide, and the page presents it
// as such rather than hiding it.
//
// OWNER ONLY, matching the acceptance route beside it: this reveals wiring state and
// writes to the incident record store.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getCurrentUser } from '@/lib/auth/permission-middleware'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, signIntakeRequest } from '@/lib/supervisor/portable'
import {
  GENERIC_SOURCE_ID,
  getIncidentIntake,
  recentIntakeAudit,
} from '@/self-healing-host/incident-intake'
import { getSupervisorEntitlement } from '@/self-healing-host/supervisor-entitlement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SEVERITIES = new Set(['critical', 'error', 'warning', 'info'])

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if ((user as { role?: string }).role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'Forbidden — running the incident drill is owner-only' }, { status: 403 })
  }

  const secret = String(process.env.SUPERVISOR_INTAKE_SECRET || '').trim()
  if (!secret) {
    // A wiring answer, not a server error, so it is reported as one the operator can act on.
    return NextResponse.json({
      ok: false,
      stage: 'intake_secret',
      error: 'SUPERVISOR_INTAKE_SECRET is not set, so the generic signed webhook source is not mounted.',
      remedy: 'Set SUPERVISOR_INTAKE_SECRET (16 characters or more) in the deployment environment and redeploy, then run this again.',
    }, { status: 409 })
  }

  const url = new URL(req.url)
  const requested = String(url.searchParams.get('severity') || 'critical').toLowerCase()
  const severity = SEVERITIES.has(requested) ? requested : 'critical'

  // A fresh dedupe key per run, so the drill can be repeated in front of someone. Sending
  // the same key twice is what the connection guide's verification step covers; that is a
  // different demonstration and belongs there, not here.
  const stamp = Date.now()
  const envelope = {
    schemaVersion: 'supervisor-incident-intake-v1',
    provider: 'signalboost-demo-drill',
    errorMessage: 'DRILL — synthetic incident raised from the demo page. Not a production failure.',
    environment: 'staging',
    severity,
    detectedAt: new Date(stamp).toISOString(),
    errorCode: 'DEMO_DRILL',
    affectedResource: 'demo/synthetic-service',
    dedupeKey: `demo-drill-${stamp}`,
    evidence: [
      {
        evidenceId: `demo-drill-${stamp}-evidence`,
        type: 'note',
        capturedAt: new Date(stamp).toISOString(),
        summary: 'Raised by an operator from /dashboard/supervisor/demo to demonstrate the intake and diagnosis path.',
      },
    ],
    metadata: { drill: true, raisedBy: 'demo-page', notARealIncident: true },
  }

  const rawBody = JSON.stringify(envelope)
  const timestamp = Math.floor(stamp / 1000)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [TIMESTAMP_HEADER]: String(timestamp),
    [SIGNATURE_HEADER]: signIntakeRequest(secret, timestamp, rawBody),
  }

  const before = recentIntakeAudit(200).length
  const entitlement = getSupervisorEntitlement()

  let result
  try {
    const { runtime: intake } = getIncidentIntake()
    result = await intake.deliver(GENERIC_SOURCE_ID, { headers, rawBody, receivedAt: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: 'delivery',
      error: error instanceof Error ? error.message : 'the incident could not be delivered',
    }, { status: 500 })
  }

  // The audit buffer is in the memory of this process, and the delivery above ran in this
  // same request, so the events this run produced are the tail of it. Anything earlier
  // belongs to other runs and is not this drill's evidence.
  const produced = recentIntakeAudit(200).slice(before)

  const accepted = result.status === 'handled'
  return NextResponse.json({
    ok: true,
    schemaVersion: 'self-healing-demo-drill-v1',
    drill: true,
    ranAt: new Date().toISOString(),
    severityRequested: severity,
    licence: { configured: entitlement.configured, reason: entitlement.reason },
    delivery: {
      status: result.status,
      incidentId: accepted ? result.record.incidentId : null,
      outcome: accepted ? result.record.status : null,
      reason: accepted ? result.record.reason : (result as { reason?: string }).reason ?? null,
    },
    auditEventTypes: [...new Set(produced.map(event => event.eventType))],
    auditEvents: produced.map(event => ({ eventType: event.eventType, occurredAt: event.occurredAt })),
    meaning: accepted
      ? 'The incident was authenticated, stored, diagnosed and evaluated by policy. No repair was executed: this deployment configures no execution step runner, so the orchestration ends unresolved and records why.'
      : 'The incident was not accepted. The delivery status names the reason.',
  }, { status: accepted ? 200 : 409 })
}
