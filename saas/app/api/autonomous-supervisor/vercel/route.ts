import { NextRequest, NextResponse } from 'next/server'
import { diagnoseIncident } from '@/lib/autonomous-supervisor/diagnostic'
import {
  normalizeVercelIncident,
  stageApprovedInvestigation,
  verifySignalBoostSupervisorSignature,
  verifyVercelWebhookSignature,
} from '@/lib/autonomous-supervisor/vercel'
import type { SupervisorRunResult } from '@/lib/autonomous-supervisor/types'

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
  const approvalDispatch = await stageApprovedInvestigation(incident, diagnostic)
  const result: SupervisorRunResult = { ok: true, incident, diagnostic, approvalDispatch }
  return NextResponse.json(result)
}
