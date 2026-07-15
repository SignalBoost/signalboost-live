import { NextRequest, NextResponse } from 'next/server'
import { diagnoseIncidentWithGemini } from '@/lib/autonomous-supervisor/diagnostic'
import { dispatchUiAgentBackup, normalizeVercelIncident, verifySupervisorWebhookSecret } from '@/lib/autonomous-supervisor/vercel'
import type { SupervisorRunResult } from '@/lib/autonomous-supervisor/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const supplied = req.headers.get('x-signalboost-supervisor-signature') || req.headers.get('x-vercel-signature')
  if (!verifySupervisorWebhookSecret(rawBody, supplied)) {
    return NextResponse.json({ ok: false, error: 'Invalid supervisor webhook signature.' }, { status: 401 })
  }

  let body: any = {}
  try { body = JSON.parse(rawBody) } catch { return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 }) }

  const incident = await normalizeVercelIncident(body)
  if (!incident) return NextResponse.json({ ok: true, ignored: true, reason: 'Not a failed Vercel deployment event.' })

  const diagnostic = await diagnoseIncidentWithGemini(incident)
  const uiAgentDispatch = await dispatchUiAgentBackup(incident, diagnostic)
  const result: SupervisorRunResult = { ok: true, incident, diagnostic, uiAgentDispatch }
  return NextResponse.json(result)
}
